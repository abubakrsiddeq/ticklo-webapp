-- =============================================================================
-- TickLO v1 – societies, team, event lifecycle, admin actions, misc
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Societies (ORG-01, ADM-01)
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_university_id uuid,
  p_type public.org_type,
  p_about text,
  p_logo_url text,
  p_social_links jsonb,
  p_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if not public.is_active_user(v_uid) then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;
  if (select count(*) from public.organizations o where o.created_by = v_uid and o.status = 'pending') >= 3 then
    raise exception using message = 'TL:TOO_MANY_PENDING', detail = 'You already have 3 societies waiting for approval.';
  end if;
  if exists (select 1 from public.organizations o where o.slug = p_slug) then
    raise exception using message = 'TL:SLUG_TAKEN', detail = 'That society link is already taken.';
  end if;

  insert into public.organizations (slug, name, university_id, type, about, logo_url, social_links, proof_path, created_by)
  values (
    p_slug, trim(p_name), p_university_id, coalesce(p_type, 'society'), nullif(trim(coalesce(p_about, '')), ''),
    p_logo_url, coalesce(p_social_links, '{}'::jsonb), p_proof_path, v_uid
  )
  returning id into v_org_id;

  insert into public.organization_members (org_id, user_id, role) values (v_org_id, v_uid, 'owner');
  return v_org_id;
end;
$$;

-- Rejected society → edit details → send for review again
create or replace function public.resubmit_organization(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_owner(p_org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the owner can resubmit.';
  end if;
  update public.organizations
  set status = 'pending', review_note = null, reviewed_at = null, reviewed_by = null
  where id = p_org_id and status = 'rejected';
  if not found then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only rejected societies can be resubmitted.';
  end if;
end;
$$;

create or replace function public.review_organization(p_org_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_owner_email text;
  v_owner_name text;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if not p_approve and v_note is null then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Please give a reason for rejecting.';
  end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if v_org.status <> 'pending' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This society is not waiting for review.';
  end if;

  update public.organizations
  set status = case when p_approve then 'approved'::public.org_status else 'rejected'::public.org_status end,
      review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_org_id;

  perform public.audit(case when p_approve then 'org.approve' else 'org.reject' end, 'organization', p_org_id::text,
    jsonb_build_object('name', v_org.name, 'note', v_note));

  select p.email, p.full_name into v_owner_email, v_owner_name
  from public.organization_members m join public.profiles p on p.id = m.user_id
  where m.org_id = p_org_id and m.role = 'owner';

  return jsonb_build_object(
    'org_id', p_org_id, 'org_name', v_org.name, 'org_slug', v_org.slug,
    'approved', p_approve, 'note', v_note,
    'owner_email', v_owner_email, 'owner_name', v_owner_name
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Team (ORG-03, EML-09)
-- ---------------------------------------------------------------------------
create or replace function public.invite_to_org(p_org_id uuid, p_email text, p_role public.org_role)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_invite_id uuid;
begin
  if not public.is_org_owner(p_org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can invite people.';
  end if;
  if p_role not in ('member', 'scanner') then
    raise exception using message = 'TL:INVALID_ROLE', detail = 'Role must be member or scanner.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using message = 'TL:INVALID_EMAIL', detail = 'Please enter a valid email address.';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id and lower(p.email) = v_email
  ) then
    raise exception using message = 'TL:ALREADY_MEMBER', detail = 'This person is already in your team.';
  end if;

  update public.org_invites set revoked_at = now()
  where org_id = p_org_id and lower(email) = v_email and accepted_at is null and revoked_at is null;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.org_invites (org_id, email, role, token, invited_by)
  values (p_org_id, v_email, p_role, v_token, auth.uid())
  returning id into v_invite_id;

  return jsonb_build_object('invite_id', v_invite_id, 'token', v_token);
end;
$$;

-- Invite details for the /invite/[token] page (needs the token itself)
create or replace function public.get_invite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'org_id', o.id, 'org_name', o.name, 'org_slug', o.slug, 'org_logo_url', o.logo_url,
    'email', i.email, 'role', i.role,
    'state', case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at <= now() then 'expired'
      else 'open'
    end
  )
  from public.org_invites i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token;
$$;

create or replace function public.accept_org_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.org_invites;
  v_email text;
  v_slug text;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to accept the invite.';
  end if;
  select * into v_invite from public.org_invites where token = p_token for update;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception using message = 'TL:INVITE_INVALID', detail = 'This invite link is no longer valid.';
  end if;

  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  if v_email is distinct from lower(v_invite.email) then
    raise exception using message = 'TL:INVITE_EMAIL_MISMATCH',
      detail = format('This invite was sent to %s. Log in with that email to accept it.', v_invite.email);
  end if;

  if v_invite.accepted_at is null then
    insert into public.organization_members (org_id, user_id, role)
    values (v_invite.org_id, v_uid, v_invite.role)
    on conflict (org_id, user_id) do nothing;
    update public.org_invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;
  end if;

  select o.slug into v_slug from public.organizations o where o.id = v_invite.org_id;
  return jsonb_build_object('org_id', v_invite.org_id, 'org_slug', v_slug, 'role', v_invite.role);
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.org_invites where id = p_invite_id;
  if v_org is null or not public.is_org_owner(v_org) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can revoke invites.';
  end if;
  update public.org_invites set revoked_at = now() where id = p_invite_id and accepted_at is null;
end;
$$;

create or replace function public.update_member_role(p_org_id uuid, p_user_id uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_owner(p_org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can change roles.';
  end if;
  if p_role not in ('member', 'scanner') then
    raise exception using message = 'TL:INVALID_ROLE', detail = 'Role must be member or scanner.';
  end if;
  if exists (select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = p_user_id and m.role = 'owner') then
    raise exception using message = 'TL:CANNOT_CHANGE_OWNER', detail = 'The owner''s role cannot be changed.';
  end if;
  update public.organization_members set role = p_role where org_id = p_org_id and user_id = p_user_id;
  if not found then
    raise exception using message = 'TL:NOT_A_MEMBER', detail = 'This person is not in your team.';
  end if;
end;
$$;

create or replace function public.remove_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_owner(p_org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can remove people.';
  end if;
  if exists (select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = p_user_id and m.role = 'owner') then
    raise exception using message = 'TL:CANNOT_CHANGE_OWNER', detail = 'The owner cannot be removed.';
  end if;
  delete from public.event_staff s
  where s.user_id = p_user_id and s.event_id in (select e.id from public.events e where e.org_id = p_org_id);
  delete from public.organization_members where org_id = p_org_id and user_id = p_user_id;
end;
$$;

-- Team list with names and emails (organizers only)
create or replace function public.org_team(p_org_id uuid)
returns table (user_id uuid, full_name text, email text, phone text, role public.org_role, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_org_staff(p_org_id) or public.is_admin()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  return query
    select m.user_id, p.full_name, p.email, p.phone, m.role, m.created_at
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org_id
    order by case m.role when 'owner' then 0 when 'member' then 1 else 2 end, p.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event lifecycle (ORG-06, ADM-02, ORG-11, EVT-06)
-- ---------------------------------------------------------------------------
create or replace function public.submit_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_org_status public.org_status;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can submit events.';
  end if;
  if v_event.status not in ('draft', 'rejected') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only draft or rejected events can be submitted.';
  end if;
  select o.status into v_org_status from public.organizations o where o.id = v_event.org_id;
  if v_org_status <> 'approved' then
    raise exception using message = 'TL:ORG_NOT_APPROVED', detail = 'Your society must be approved before events can be submitted.';
  end if;
  if v_event.starts_at <= now() then
    raise exception using message = 'TL:EVENT_IN_PAST', detail = 'The event start time must be in the future.';
  end if;
  if not exists (select 1 from public.ticket_types tt where tt.event_id = p_event_id) then
    raise exception using message = 'TL:NO_TICKET_TYPES', detail = 'Add at least one ticket type.';
  end if;
  if exists (select 1 from public.ticket_types tt where tt.event_id = p_event_id and tt.price_paisa > 0)
     and not exists (
       select 1 from public.event_payment_accounts epa
       join public.payment_accounts pa on pa.id = epa.payment_account_id and pa.is_active
       where epa.event_id = p_event_id
     ) then
    raise exception using message = 'TL:NO_PAYMENT_ACCOUNT',
      detail = 'Paid tickets need at least one payment account selected for this event.';
  end if;

  update public.events
  set status = 'pending_review', submitted_at = now(), review_note = null
  where id = p_event_id;
end;
$$;

create or replace function public.review_event(p_event_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_org public.organizations;
  v_owner_email text;
  v_owner_name text;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if not p_approve and v_note is null then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Please give a reason for rejecting.';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if v_event.status <> 'pending_review' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This event is not waiting for review.';
  end if;

  update public.events
  set status = case when p_approve then 'published'::public.event_status else 'rejected'::public.event_status end,
      review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(),
      published_at = case when p_approve then coalesce(published_at, now()) else published_at end
  where id = p_event_id;

  perform public.audit(case when p_approve then 'event.approve' else 'event.reject' end, 'event', p_event_id::text,
    jsonb_build_object('name', v_event.name, 'note', v_note));

  select * into v_org from public.organizations where id = v_event.org_id;
  select p.email, p.full_name into v_owner_email, v_owner_name
  from public.organization_members m join public.profiles p on p.id = m.user_id
  where m.org_id = v_event.org_id and m.role = 'owner';

  return jsonb_build_object(
    'event_id', p_event_id, 'event_name', v_event.name, 'event_slug', v_event.slug,
    'org_name', v_org.name, 'org_slug', v_org.slug, 'approved', p_approve, 'note', v_note,
    'owner_email', v_owner_email, 'owner_name', v_owner_name
  );
end;
$$;

-- Cancel a published event: tickets → cancelled, open orders closed.
-- Returns the people to email (EML-05). Money is settled by the organizer (rule 10).
create or replace function public.cancel_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_recipients jsonb;
  v_is_admin boolean := public.is_admin();
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not (public.is_org_staff(v_event.org_id) or v_is_admin) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can cancel this event.';
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only published events can be cancelled.';
  end if;
  if v_reason is null then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Please tell attendees why the event is cancelled.';
  end if;

  -- Recipients: everyone with an approved order or a payment under review
  select coalesce(jsonb_agg(distinct jsonb_build_object('email', o.buyer_email, 'name', o.buyer_name, 'user_id', o.user_id)), '[]'::jsonb)
  into v_recipients
  from public.orders o
  where o.event_id = p_event_id and o.status in ('approved', 'under_review') and o.buyer_email is not null;

  update public.events
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(v_reason, 1000)
  where id = p_event_id;

  update public.tickets set status = 'cancelled', cancelled_at = now()
  where event_id = p_event_id and status = 'valid';

  update public.orders set status = 'expired'
  where event_id = p_event_id and status = 'awaiting_payment';

  update public.orders
  set status = 'rejected', reject_reason = 'Event cancelled', decided_at = now(), decided_by = auth.uid()
  where event_id = p_event_id and status = 'under_review';

  update public.payment_proofs set status = 'rejected', reject_reason = 'Event cancelled', reviewed_at = now()
  where event_id = p_event_id and status = 'pending';

  perform public.audit('event.cancel', 'event', p_event_id::text,
    jsonb_build_object('name', v_event.name, 'reason', v_reason, 'by_admin', v_is_admin));

  return jsonb_build_object('event_id', p_event_id, 'event_name', v_event.name, 'recipients', v_recipients);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin actions (ADM-05, ADM-06, ADM-07, ADM-04) – all audited (ADM-08)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_user_id = auth.uid() then
    raise exception using message = 'TL:INVALID_STATE', detail = 'You cannot suspend yourself.';
  end if;
  update public.profiles
  set is_suspended = p_suspended,
      suspended_at = case when p_suspended then now() else null end,
      suspended_reason = case when p_suspended then nullif(trim(coalesce(p_reason, '')), '') else null end
  where id = p_user_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  perform public.audit(case when p_suspended then 'user.suspend' else 'user.restore' end, 'user', p_user_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_save_university(
  p_id uuid, p_name text, p_short_name text, p_city text, p_email_domain text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_id is null then
    insert into public.universities (name, short_name, city, email_domain)
    values (trim(p_name), nullif(trim(coalesce(p_short_name, '')), ''), trim(p_city),
            nullif(lower(trim(coalesce(p_email_domain, ''))), ''))
    returning id into v_id;
    perform public.audit('university.create', 'university', v_id::text, jsonb_build_object('name', p_name));
  else
    update public.universities
    set name = trim(p_name), short_name = nullif(trim(coalesce(p_short_name, '')), ''), city = trim(p_city),
        email_domain = nullif(lower(trim(coalesce(p_email_domain, ''))), '')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'TL:NOT_FOUND', detail = 'University not found.';
    end if;
    perform public.audit('university.update', 'university', v_id::text, jsonb_build_object('name', p_name));
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_delete_university(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  delete from public.universities where id = p_id;
  perform public.audit('university.delete', 'university', p_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_resolve_dispute(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  update public.disputes
  set status = 'resolved', admin_note = nullif(trim(coalesce(p_note, '')), ''), resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id and status = 'open';
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Open dispute not found.';
  end if;
  perform public.audit('dispute.resolve', 'dispute', p_dispute_id::text, jsonb_build_object('note', p_note));
end;
$$;

-- For admin actions performed outside the database (e.g. viewing a payment
-- screenshot, banning a login in Supabase Auth).
create or replace function public.admin_log(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  perform public.audit(p_action, p_target_type, p_target_id, p_details);
end;
$$;

-- Accounts with many rejected orders (ADM-05 fraud list)
create or replace function public.admin_repeat_rejections(p_min integer default 3)
returns table (user_id uuid, full_name text, email text, phone text, is_suspended boolean, rejected_count bigint, last_rejected_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, p.is_suspended, count(*), max(pp.reviewed_at)
    from public.payment_proofs pp
    join public.profiles p on p.id = pp.user_id
    where pp.status = 'rejected' and coalesce(pp.reject_reason, '') <> 'Event cancelled'
    group by p.id
    having count(*) >= p_min
    order by count(*) desc, max(pp.reviewed_at) desc;
end;
$$;

-- Admin overview numbers (ADM-09)
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  return jsonb_build_object(
    'events_this_week', (
      select count(*) from public.events e
      where e.status = 'published' and e.starts_at >= v_week_start and e.starts_at < v_week_start + interval '7 days'
    ),
    'tickets_this_week', (select count(*) from public.tickets t where t.created_at >= v_week_start),
    'revenue_this_week_paisa', (
      select coalesce(sum(o.total_paisa), 0) from public.orders o
      where o.status = 'approved' and o.approved_at >= v_week_start
    ),
    'pending_societies', (select count(*) from public.organizations o where o.status = 'pending'),
    'pending_events', (select count(*) from public.events e where e.status = 'pending_review'),
    'open_disputes', (select count(*) from public.disputes d where d.status = 'open'),
    'duplicate_flags', (
      select count(*) from public.payment_proofs pp where pp.is_possible_duplicate and pp.status = 'pending'
    ),
    'failed_emails_7d', (
      select count(*) from public.email_log l where l.status = 'failed' and l.created_at >= now() - interval '7 days'
    ),
    'users', (select count(*) from public.profiles)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Student helpers
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = auth.uid();
  perform public.audit('user.request_deletion', 'user', auth.uid()::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (NFR-05) – SERVICE ROLE ONLY. Returns true when allowed.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event reminders (EML-04) – SERVICE ROLE ONLY
-- ---------------------------------------------------------------------------
create or replace function public.events_due_for_reminder()
returns table (event_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.events e
  where e.status = 'published'
    and e.reminder_sent_at is null
    and e.starts_at > now()
    and e.starts_at <= now() + interval '24 hours';
$$;

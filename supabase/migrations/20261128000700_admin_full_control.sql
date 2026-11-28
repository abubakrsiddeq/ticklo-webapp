-- =============================================================================
-- TickLO – admins can do everything (D-084)
--
--  1. Admins act as owner of every society: org_role_of() returns 'owner' for
--     the signed-in admin, so every organizer screen and function works for
--     them (events, ticket types, sessions, payments, team, printed tickets).
--  2. Societies: suspend / restore, delete (permanently when nothing was sold,
--     otherwise hidden with every record kept, restorable), edit name, link,
--     university and type.
--     A suspended or deleted society cannot sell, create or edit anything.
--     Tickets already sold stay valid and scanning keeps working.
--  3. Events: pause / resume sales, unpublish (no bookings yet), delete
--     (nothing sold yet).
--  4. Orders and tickets: cancel one ticket, correct buyer details, mark an
--     order refunded.
--  5. Users: edit profile, sign out everywhere, delete an account (permanently
--     when they have no orders, otherwise personal details are removed).
--  6. Payment accounts: turn off any society's account.
--  7. Site settings: an announcement banner on every page.
-- Every admin change is written to the audit log (ADM-08).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column suspended_at timestamptz,
  add column suspended_reason text,
  add column suspended_by uuid references public.profiles (id) on delete set null,
  add column suspended_from public.org_status,
  add column deleted_at timestamptz,
  add column deleted_reason text,
  add column deleted_by uuid references public.profiles (id) on delete set null,
  add constraint organizations_suspended_reason_len check (suspended_reason is null or char_length(suspended_reason) <= 1000),
  add constraint organizations_deleted_reason_len check (deleted_reason is null or char_length(deleted_reason) <= 1000);

alter table public.events
  add column sales_paused_at timestamptz,
  add column sales_paused_reason text,
  add constraint events_sales_paused_reason_len check (sales_paused_reason is null or char_length(sales_paused_reason) <= 500);

alter table public.orders
  add column refunded_at timestamptz,
  add column refund_note text,
  add column refunded_by uuid references public.profiles (id) on delete set null,
  add constraint orders_refund_note_len check (refund_note is null or char_length(refund_note) <= 1000);

alter table public.profiles
  add column deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Site settings (one row): announcement banner
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id integer primary key default 1,
  announcement text,
  announcement_tone text not null default 'info',
  announcement_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint site_settings_single_row check (id = 1),
  constraint site_settings_tone check (announcement_tone in ('info', 'warning')),
  constraint site_settings_announcement_len check (announcement is null or char_length(announcement) <= 300)
);
insert into public.site_settings (id) values (1);
alter table public.site_settings enable row level security;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Approved and not deleted: shown to the public.
create or replace function public.org_is_live(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org_id and o.status = 'approved' and o.deleted_at is null
  );
$$;

-- Suspended or deleted: nothing can be sold, created or edited (except by admins).
create or replace function public.org_is_frozen(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org_id and (o.status = 'suspended' or o.deleted_at is not null)
  );
$$;

-- The caller booked or holds a ticket for this event (keeps their tickets visible
-- when the society is suspended or deleted).
create or replace function public.holds_ticket_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.orders o where o.event_id = p_event_id and o.user_id = auth.uid())
    or exists (select 1 from public.tickets t where t.event_id = p_event_id and t.owner_id = auth.uid())
  );
$$;

create or replace function public.holds_ticket_for_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.orders o join public.events e on e.id = o.event_id
      where e.org_id = p_org_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.tickets t join public.events e on e.id = t.event_id
      where e.org_id = p_org_id and t.owner_id = auth.uid()
    )
  );
$$;

-- Admins act as owner of every society that is not deleted. A deleted society
-- has no members until it is restored. Only the caller's own role is raised,
-- never someone else's.
create or replace function public.org_role_of(p_org_id uuid, p_user_id uuid default auth.uid())
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.organizations o where o.id = p_org_id and o.deleted_at is not null) then null
    when p_user_id = auth.uid() and public.is_admin() then 'owner'::public.org_role
    else (
      select m.role
      from public.organization_members m
      join public.profiles p on p.id = m.user_id and not p.is_suspended
      where m.org_id = p_org_id and m.user_id = p_user_id
    )
  end;
$$;

-- Admins can manage any festival session too.
create or replace function public.can_manage_session(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and public.is_active_user(p_user_id)
    and exists (
      select 1 from public.event_sessions s
      join public.events e on e.id = s.event_id
      where s.id = p_session_id and (
        (p_user_id = auth.uid() and public.is_admin())
        or exists (
          select 1 from public.organization_members m
          where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
        )
        or exists (select 1 from public.session_managers sm where sm.session_id = s.id and sm.user_id = p_user_id)
      )
    );
$$;

-- The "Sell" menu lists only events the admin really works on, not every event
-- (admins can still open any event's printed tickets from its dashboard).
create or replace function public.my_sell_events()
returns table(event_id uuid, event_name text, event_slug text, org_name text, org_slug text, starts_at timestamptz, access text, has_printed boolean, ref_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.slug, o.name, o.slug, e.starts_at,
         case when public.is_org_staff(e.org_id) then 'organizer' else 'seller' end,
         exists (select 1 from public.print_batches pb where pb.event_id = e.id),
         (select s.ref_code from public.print_sellers s where s.event_id = e.id and s.user_id = auth.uid())
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.status = 'published' and now() <= e.ends_at + interval '6 hours'
    and public.can_sell_printed(e.id, auth.uid())
    and (
      exists (select 1 from public.print_batches pb where pb.event_id = e.id)
      or exists (select 1 from public.print_sellers s where s.event_id = e.id and s.user_id = auth.uid() and s.settled_at is null)
    )
    and (
      not public.is_admin()
      or exists (select 1 from public.organization_members m where m.org_id = e.org_id and m.user_id = auth.uid())
      or exists (select 1 from public.print_sellers s where s.event_id = e.id and s.user_id = auth.uid())
    )
  order by e.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- Visibility: deleted societies disappear; suspended ones leave the public
-- pages; people who hold tickets keep seeing their event and society.
-- ---------------------------------------------------------------------------
drop policy organizations_read on public.organizations;
create policy organizations_read on public.organizations
  for select to anon, authenticated
  using (
    (status = 'approved' and deleted_at is null)
    or public.is_org_member_any(id)
    or public.is_admin()
    or public.holds_ticket_for_org(id)
  );

drop policy events_read on public.events;
create policy events_read on public.events
  for select to anon, authenticated
  using (
    (status in ('published', 'cancelled') and public.org_is_live(org_id))
    or public.is_org_member_any(org_id)
    or public.is_admin()
    or public.holds_ticket_for_event(id)
  );

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- A suspended or deleted society cannot create or edit anything. Organizers may
-- still cancel an event (attendees are told). Background jobs (no signed-in
-- user) and admins are not blocked.
create or replace function public.guard_frozen_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_org uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;
  if tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
  elsif v_row ? 'org_id' then
    v_org := (v_row ->> 'org_id')::uuid;
  else
    v_org := public.event_org_id((v_row ->> 'event_id')::uuid);
  end if;
  if tg_table_name = 'events' and tg_op = 'UPDATE'
     and v_row ->> 'status' = 'cancelled' and to_jsonb(old) ->> 'status' <> 'cancelled' then
    return new;
  end if;
  if public.org_is_frozen(v_org) then
    raise exception using message = 'TL:ORG_SUSPENDED', detail = 'This society is suspended. Contact TickLO support.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger organizations_guard_frozen before update on public.organizations
  for each row execute function public.guard_frozen_org();
create trigger events_guard_frozen before insert or update or delete on public.events
  for each row execute function public.guard_frozen_org();
create trigger ticket_types_guard_frozen before insert or update or delete on public.ticket_types
  for each row execute function public.guard_frozen_org();
create trigger event_sessions_guard_frozen before insert or update or delete on public.event_sessions
  for each row execute function public.guard_frozen_org();
create trigger payment_accounts_guard_frozen before insert or update or delete on public.payment_accounts
  for each row execute function public.guard_frozen_org();
create trigger org_invites_guard_frozen before insert on public.org_invites
  for each row execute function public.guard_frozen_org();
create trigger ticket_templates_guard_frozen before insert or update on public.ticket_templates
  for each row execute function public.guard_frozen_org();

-- No new bookings, registrations, waitlist places or printed batches when the
-- society is suspended / deleted or TickLO paused the event's sales.
create or replace function public.guard_event_sales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if public.is_admin() then
    return new;
  end if;
  select * into v_event from public.events where id = new.event_id;
  if public.org_is_frozen(v_event.org_id) then
    raise exception using message = 'TL:ORG_SUSPENDED', detail = 'This society is suspended, so tickets are not on sale.';
  end if;
  if v_event.sales_paused_at is not null then
    raise exception using message = 'TL:SALES_PAUSED', detail = 'Ticket sales for this event are paused for now.';
  end if;
  return new;
end;
$$;

create trigger orders_guard_sales before insert on public.orders
  for each row execute function public.guard_event_sales();
create trigger team_registrations_guard_sales before insert on public.team_registrations
  for each row execute function public.guard_event_sales();
create trigger waitlist_entries_guard_sales before insert on public.waitlist_entries
  for each row execute function public.guard_event_sales();
create trigger print_batches_guard_sales before insert on public.print_batches
  for each row execute function public.guard_event_sales();

-- ---------------------------------------------------------------------------
-- Shared: cancel a society's upcoming events, send pending ones back to draft
-- ---------------------------------------------------------------------------
create or replace function public.admin_stop_org_events(p_org_id uuid, p_reason text, p_cancel boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_result jsonb;
  v_cancelled jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  update public.events
  set status = 'draft', submitted_at = null, review_note = left('Sent back: ' || p_reason, 1000)
  where org_id = p_org_id and status = 'pending_review';
  if p_cancel then
    for v_event in
      select e.id from public.events e
      where e.org_id = p_org_id and e.status = 'published' and e.ends_at > now()
      order by e.starts_at
    loop
      v_result := public.cancel_event(v_event.id, p_reason);
      v_cancelled := v_cancelled || jsonb_build_array(jsonb_build_object('event_id', v_event.id, 'recipients', coalesce(v_result -> 'recipients', '[]'::jsonb)));
    end loop;
  end if;
  return v_cancelled;
end;
$$;

create or replace function public.org_owner_contact(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('email', p.email, 'name', p.full_name)
     from public.organization_members m join public.profiles p on p.id = m.user_id
     where m.org_id = p_org_id and m.role = 'owner'),
    '{}'::jsonb
  );
$$;

-- ---------------------------------------------------------------------------
-- Societies
-- ---------------------------------------------------------------------------
create or replace function public.admin_suspend_organization(p_org_id uuid, p_reason text, p_cancel_events boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_cancelled jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for suspending this society.';
  end if;
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if v_org.deleted_at is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This society is deleted. Restore it first.';
  end if;
  if v_org.status not in ('approved', 'pending') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only approved or pending societies can be suspended.';
  end if;

  update public.organizations
  set suspended_from = status, status = 'suspended', suspended_at = now(),
      suspended_reason = left(v_reason, 1000), suspended_by = auth.uid()
  where id = p_org_id;
  v_cancelled := public.admin_stop_org_events(p_org_id, v_reason, coalesce(p_cancel_events, false));

  perform public.audit('org.suspend', 'organization', p_org_id::text, jsonb_build_object(
    'reason', v_reason, 'name', v_org.name, 'slug', v_org.slug, 'cancelled_events', jsonb_array_length(v_cancelled)));
  return jsonb_build_object('org_name', v_org.name, 'org_slug', v_org.slug, 'owner', public.org_owner_contact(p_org_id), 'cancelled', v_cancelled);
end;
$$;

-- Lifts a suspension, or brings back a deleted society (same button).
create or replace function public.admin_restore_organization(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_what text;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if v_org.deleted_at is not null then
    v_what := 'deleted';
    update public.organizations set deleted_at = null, deleted_reason = null, deleted_by = null where id = p_org_id;
  elsif v_org.status = 'suspended' then
    v_what := 'suspended';
    update public.organizations
    set status = coalesce(suspended_from, 'approved'), suspended_from = null, suspended_at = null,
        suspended_reason = null, suspended_by = null
    where id = p_org_id;
  else
    raise exception using message = 'TL:INVALID_STATE', detail = 'This society is not suspended or deleted.';
  end if;
  perform public.audit('org.restore', 'organization', p_org_id::text, jsonb_build_object('from', v_what, 'name', v_org.name, 'slug', v_org.slug));
  return jsonb_build_object('org_name', v_org.name, 'org_slug', v_org.slug, 'restored_from', v_what, 'owner', public.org_owner_contact(p_org_id));
end;
$$;

-- Permanently deletes a society that never sold anything; otherwise hides it
-- (status kept, deleted_at set) so orders, tickets and money records stay.
create or replace function public.admin_delete_organization(p_org_id uuid, p_reason text, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_has_sales boolean;
  v_cancelled jsonb := '[]'::jsonb;
  v_owner jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for deleting this society.';
  end if;
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_org.name)) then
    raise exception using message = 'TL:CONFIRM_MISMATCH', detail = 'Type the society''s name exactly to delete it.';
  end if;
  if v_org.deleted_at is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This society is already deleted.';
  end if;

  v_owner := public.org_owner_contact(p_org_id);
  v_has_sales := exists (
    select 1 from public.events e
    where e.org_id = p_org_id and (
      exists (select 1 from public.orders o where o.event_id = e.id)
      or exists (select 1 from public.tickets t where t.event_id = e.id)
      or exists (select 1 from public.print_batches pb where pb.event_id = e.id)
      or exists (select 1 from public.team_registrations tr where tr.event_id = e.id)
    )
  );

  if not v_has_sales then
    perform public.audit('org.delete', 'organization', p_org_id::text, jsonb_build_object(
      'reason', v_reason, 'name', v_org.name, 'slug', v_org.slug, 'mode', 'permanent',
      'logo_url', v_org.logo_url, 'proof_path', v_org.proof_path));
    delete from public.events where org_id = p_org_id;
    delete from public.organizations where id = p_org_id;
    return jsonb_build_object('mode', 'permanent', 'org_name', v_org.name, 'owner', v_owner,
      'logo_url', v_org.logo_url, 'proof_path', v_org.proof_path, 'cancelled', v_cancelled);
  end if;

  v_cancelled := public.admin_stop_org_events(p_org_id, v_reason, true);
  update public.organizations
  set deleted_at = now(), deleted_reason = left(v_reason, 1000), deleted_by = auth.uid()
  where id = p_org_id;
  perform public.audit('org.delete', 'organization', p_org_id::text, jsonb_build_object(
    'reason', v_reason, 'name', v_org.name, 'slug', v_org.slug, 'mode', 'hidden',
    'cancelled_events', jsonb_array_length(v_cancelled)));
  return jsonb_build_object('mode', 'hidden', 'org_name', v_org.name, 'owner', v_owner, 'cancelled', v_cancelled);
end;
$$;

create or replace function public.admin_update_organization(
  p_org_id uuid, p_name text, p_slug text, p_university_id uuid, p_type public.org_type
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.organizations;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  select * into v_old from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if p_university_id is not null and not exists (select 1 from public.universities u where u.id = p_university_id) then
    raise exception using message = 'TL:INVALID_UNIVERSITY', detail = 'Choose a university from the list.';
  end if;
  begin
    update public.organizations
    set name = trim(p_name), slug = lower(trim(p_slug)), university_id = p_university_id, type = p_type
    where id = p_org_id;
  exception when unique_violation then
    raise exception using message = 'TL:SLUG_TAKEN', detail = 'That society link is already taken.';
  end;
  perform public.audit('org.admin_edit', 'organization', p_org_id::text, jsonb_build_object(
    'name', trim(p_name),
    'from', jsonb_build_object('name', v_old.name, 'slug', v_old.slug, 'university_id', v_old.university_id, 'type', v_old.type),
    'to', jsonb_build_object('name', trim(p_name), 'slug', lower(trim(p_slug)), 'university_id', p_university_id, 'type', p_type)));
end;
$$;

create or replace function public.admin_set_payment_account_active(p_account_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc public.payment_accounts;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  update public.payment_accounts set is_active = p_active where id = p_account_id returning * into v_acc;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Payment account not found.';
  end if;
  perform public.audit(case when p_active then 'payment_account.on' else 'payment_account.off' end,
    'organization', v_acc.org_id::text,
    jsonb_build_object('account_id', p_account_id, 'kind', v_acc.kind, 'title', v_acc.account_title));
end;
$$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create or replace function public.event_has_bookings(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.event_id = p_event_id)
    or exists (select 1 from public.tickets t where t.event_id = p_event_id)
    or exists (select 1 from public.print_batches pb where pb.event_id = p_event_id)
    or exists (select 1 from public.team_registrations tr where tr.event_id = p_event_id);
$$;

create or replace function public.admin_set_event_sales_paused(p_event_id uuid, p_paused boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_paused and (v_reason is null or char_length(v_reason) < 3) then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for pausing ticket sales.';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  update public.events
  set sales_paused_at = case when p_paused then now() else null end,
      sales_paused_reason = case when p_paused then left(v_reason, 500) else null end
  where id = p_event_id;
  perform public.audit(case when p_paused then 'event.sales_pause' else 'event.sales_resume' end,
    'event', p_event_id::text, jsonb_build_object('reason', v_reason, 'name', v_event.name, 'org_id', v_event.org_id));
end;
$$;

create or replace function public.admin_unpublish_event(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason (the organizers see it).';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only published events can be unpublished.';
  end if;
  if public.event_has_bookings(p_event_id) then
    raise exception using message = 'TL:HAS_BOOKINGS',
      detail = 'People have already booked this event. Pause ticket sales or cancel the event instead.';
  end if;
  update public.events
  set status = 'draft', published_at = null, submitted_at = null, review_note = left('Unpublished by TickLO: ' || v_reason, 1000)
  where id = p_event_id;
  perform public.audit('event.unpublish', 'event', p_event_id::text,
    jsonb_build_object('reason', v_reason, 'name', v_event.name, 'org_id', v_event.org_id));
end;
$$;

create or replace function public.admin_delete_event(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for deleting this event.';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if public.event_has_bookings(p_event_id) then
    raise exception using message = 'TL:HAS_BOOKINGS',
      detail = 'This event has bookings, so it cannot be deleted. Cancel it instead.';
  end if;
  perform public.audit('event.delete', 'event', p_event_id::text, jsonb_build_object(
    'reason', v_reason, 'name', v_event.name, 'slug', v_event.slug, 'org_id', v_event.org_id, 'status', v_event.status,
    'poster_url', v_event.poster_url));
  delete from public.events where id = p_event_id;
  return jsonb_build_object('name', v_event.name, 'poster_url', v_event.poster_url);
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders and tickets
-- ---------------------------------------------------------------------------
create or replace function public.admin_cancel_ticket(p_ticket_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for cancelling this ticket.';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Ticket not found.';
  end if;
  if v_ticket.status <> 'valid' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only valid (unused) tickets can be cancelled.';
  end if;
  update public.tickets set status = 'cancelled', cancelled_at = now() where id = p_ticket_id;
  perform public.audit('ticket.cancel',
    case when v_ticket.order_id is not null then 'order' else 'ticket' end,
    coalesce(v_ticket.order_id, v_ticket.id)::text,
    jsonb_build_object('reason', v_reason, 'ticket_id', v_ticket.id, 'code', v_ticket.code));
end;
$$;

create or replace function public.admin_update_order_buyer(p_order_id uuid, p_name text, p_email text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.orders;
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using message = 'TL:INVALID_EMAIL', detail = 'Please enter a valid email address.';
  end if;
  select * into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  update public.orders
  set buyer_name = nullif(left(trim(coalesce(p_name, '')), 100), ''),
      buyer_email = v_email,
      buyer_phone = nullif(trim(coalesce(p_phone, '')), '')
  where id = p_order_id;
  perform public.audit('order.buyer_edit', 'order', p_order_id::text, jsonb_build_object(
    'from', jsonb_build_object('name', v_old.buyer_name, 'email', v_old.buyer_email, 'phone', v_old.buyer_phone),
    'to', jsonb_build_object('name', p_name, 'email', v_email, 'phone', p_phone)));
end;
$$;

-- The money went back to the buyer: the order counts as rejected (its places
-- return, it leaves the takings) and its unused tickets are cancelled.
create or replace function public.admin_mark_order_refunded(p_order_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_cancelled int;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_note is null or char_length(v_note) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Write how the money was returned (e.g. JazzCash TID).';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if v_order.refunded_at is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This order is already marked refunded.';
  end if;
  if v_order.status not in ('approved', 'under_review') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only paid orders (approved or under review) can be refunded.';
  end if;
  if exists (select 1 from public.tickets t where t.order_id = p_order_id and t.status = 'checked_in') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'A ticket of this order was already used at the gate.';
  end if;
  update public.tickets set status = 'cancelled', cancelled_at = now() where order_id = p_order_id and status = 'valid';
  get diagnostics v_cancelled = row_count;
  update public.payment_proofs set status = 'rejected', reject_reason = 'Refunded', reviewed_at = now()
  where order_id = p_order_id and status = 'pending';
  update public.orders
  set status = 'rejected', reject_reason = left('Refunded: ' || v_note, 1000), decided_at = now(), decided_by = auth.uid(),
      refunded_at = now(), refund_note = left(v_note, 1000), refunded_by = auth.uid()
  where id = p_order_id;
  perform public.audit('order.refund', 'order', p_order_id::text, jsonb_build_object(
    'reason', v_note, 'ref_code', v_order.ref_code, 'total_paisa', v_order.total_paisa, 'tickets_cancelled', v_cancelled));
  return jsonb_build_object('tickets_cancelled', v_cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_profile(p_user_id uuid, p_full_name text, p_phone text, p_university_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  if p_university_id is not null and not exists (select 1 from public.universities u where u.id = p_university_id) then
    raise exception using message = 'TL:INVALID_UNIVERSITY', detail = 'Choose a university from the list.';
  end if;
  update public.profiles
  set full_name = nullif(left(trim(coalesce(p_full_name, '')), 100), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      university_id = p_university_id
  where id = p_user_id;
  perform public.audit('user.admin_edit', 'user', p_user_id::text, jsonb_build_object(
    'from', jsonb_build_object('full_name', v_old.full_name, 'phone', v_old.phone, 'university_id', v_old.university_id),
    'to', jsonb_build_object('full_name', p_full_name, 'phone', p_phone, 'university_id', p_university_id)));
end;
$$;

-- Ends every login of this user (their app session stops at the next refresh).
create or replace function public.admin_sign_out_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics v_count = row_count;
  perform public.audit('user.sign_out_all', 'user', p_user_id::text, jsonb_build_object('sessions', v_count));
  return v_count;
end;
$$;

-- Deletes an account. With no orders, tickets, payments, disputes or societies
-- it is removed completely; otherwise the login is closed and personal details
-- are wiped, while orders and tickets stay (as "Deleted user") for the records.
create or replace function public.admin_delete_user(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.profiles;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_owned text;
  v_has_records boolean;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Give a reason for deleting this account.';
  end if;
  if p_user_id = auth.uid() then
    raise exception using message = 'TL:INVALID_STATE', detail = 'You cannot delete your own account here.';
  end if;
  select * into v_user from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  if v_user.deleted_at is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This account is already deleted.';
  end if;
  if v_user.is_admin then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Remove this person''s admin access first.';
  end if;
  select string_agg(o.name, ', ') into v_owned
  from public.organization_members m join public.organizations o on o.id = m.org_id
  where m.user_id = p_user_id and m.role = 'owner' and o.deleted_at is null;
  if v_owned is not null then
    raise exception using message = 'TL:CANNOT_CHANGE_OWNER',
      detail = 'This person owns ' || v_owned || '. Make someone else the owner (or delete the society) first.';
  end if;

  v_has_records := exists (select 1 from public.orders o where o.user_id = p_user_id)
    or exists (select 1 from public.tickets t where t.owner_id = p_user_id)
    or exists (select 1 from public.payment_proofs pp where pp.user_id = p_user_id)
    or exists (select 1 from public.disputes d where d.user_id = p_user_id)
    or exists (select 1 from public.organizations o where o.created_by = p_user_id);

  perform public.audit('user.delete', 'user', p_user_id::text, jsonb_build_object(
    'reason', v_reason, 'name', v_user.full_name, 'email', v_user.email,
    'mode', case when v_has_records then 'details_removed' else 'permanent' end));

  if not v_has_records then
    delete from auth.users where id = p_user_id;
    return jsonb_build_object('mode', 'permanent', 'name', v_user.full_name);
  end if;

  delete from auth.sessions where user_id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  update auth.users
  set email = 'deleted-' || p_user_id::text || '@deleted.invalid',
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'
  where id = p_user_id;
  update public.profiles
  set full_name = 'Deleted user', phone = null, avatar_url = null, university_id = null, email = null,
      is_suspended = true, suspended_at = now(), suspended_reason = 'Account deleted',
      deletion_requested_at = null, deleted_at = now()
  where id = p_user_id;
  update public.orders set buyer_name = 'Deleted user', buyer_email = null, buyer_phone = null where user_id = p_user_id;
  update public.tickets set holder_name = 'Deleted user', holder_phone = null where owner_id = p_user_id;
  delete from public.organization_members where user_id = p_user_id;
  delete from public.event_staff where user_id = p_user_id;
  delete from public.session_managers where user_id = p_user_id;
  delete from public.waitlist_entries where user_id = p_user_id;
  update public.campus_ambassadors set active = false where user_id = p_user_id;
  return jsonb_build_object('mode', 'details_removed', 'name', v_user.full_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Site settings
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_site_settings(p_announcement text, p_tone text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := nullif(trim(coalesce(p_announcement, '')), '');
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_active and v_text is null then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Write the announcement first.';
  end if;
  if p_tone not in ('info', 'warning') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Choose a banner colour.';
  end if;
  update public.site_settings
  set announcement = left(v_text, 300), announcement_tone = p_tone, announcement_active = coalesce(p_active, false),
      updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform public.audit('site.settings', 'site', 'settings', jsonb_build_object('announcement', v_text, 'tone', p_tone, 'active', p_active));
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview: more counts
-- ---------------------------------------------------------------------------
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
    'pending_societies', (select count(*) from public.organizations o where o.status = 'pending' and o.deleted_at is null),
    'pending_events', (select count(*) from public.events e where e.status = 'pending_review'),
    'open_disputes', (select count(*) from public.disputes d where d.status = 'open'),
    'duplicate_flags', (
      select count(*) from public.payment_proofs pp where pp.is_possible_duplicate and pp.status = 'pending'
    ),
    'failed_emails_7d', (
      select count(*) from public.email_log l where l.status = 'failed' and l.created_at >= now() - interval '7 days'
    ),
    'users', (select count(*) from public.profiles where deleted_at is null),
    'societies', (select count(*) from public.organizations o where o.deleted_at is null),
    'suspended_societies', (select count(*) from public.organizations o where o.status = 'suspended' and o.deleted_at is null),
    'live_events', (select count(*) from public.events e where e.status = 'published' and e.ends_at > now()),
    'paused_events', (select count(*) from public.events e where e.sales_paused_at is not null and e.status = 'published' and e.ends_at > now())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.org_is_live(uuid),
  public.org_is_frozen(uuid),
  public.holds_ticket_for_event(uuid),
  public.holds_ticket_for_org(uuid),
  public.guard_frozen_org(),
  public.guard_event_sales(),
  public.admin_stop_org_events(uuid, text, boolean),
  public.org_owner_contact(uuid),
  public.admin_suspend_organization(uuid, text, boolean),
  public.admin_restore_organization(uuid),
  public.admin_delete_organization(uuid, text, text),
  public.admin_update_organization(uuid, text, text, uuid, public.org_type),
  public.admin_set_payment_account_active(uuid, boolean),
  public.event_has_bookings(uuid),
  public.admin_set_event_sales_paused(uuid, boolean, text),
  public.admin_unpublish_event(uuid, text),
  public.admin_delete_event(uuid, text),
  public.admin_cancel_ticket(uuid, text),
  public.admin_update_order_buyer(uuid, text, text, text),
  public.admin_mark_order_refunded(uuid, text),
  public.admin_update_profile(uuid, text, text, uuid),
  public.admin_sign_out_user(uuid),
  public.admin_delete_user(uuid, text),
  public.admin_save_site_settings(text, text, boolean)
from public, anon;

-- Visibility helpers are used by policies that logged-out visitors also hit.
grant execute on function
  public.org_is_live(uuid),
  public.holds_ticket_for_event(uuid),
  public.holds_ticket_for_org(uuid)
to anon, authenticated, service_role;

-- org_is_frozen, admin_stop_org_events, org_owner_contact and event_has_bookings
-- are only used inside the functions above (which run as their owner).
grant execute on function
  public.admin_suspend_organization(uuid, text, boolean),
  public.admin_restore_organization(uuid),
  public.admin_delete_organization(uuid, text, text),
  public.admin_update_organization(uuid, text, text, uuid, public.org_type),
  public.admin_set_payment_account_active(uuid, boolean),
  public.admin_set_event_sales_paused(uuid, boolean, text),
  public.admin_unpublish_event(uuid, text),
  public.admin_delete_event(uuid, text),
  public.admin_cancel_ticket(uuid, text),
  public.admin_update_order_buyer(uuid, text, text, text),
  public.admin_mark_order_refunded(uuid, text),
  public.admin_update_profile(uuid, text, text, uuid),
  public.admin_sign_out_user(uuid),
  public.admin_delete_user(uuid, text),
  public.admin_save_site_settings(text, text, boolean)
to authenticated, service_role;
grant execute on function
  public.org_is_frozen(uuid),
  public.admin_stop_org_events(uuid, text, boolean),
  public.org_owner_contact(uuid),
  public.event_has_bookings(uuid)
to service_role;

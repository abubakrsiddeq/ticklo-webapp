-- =============================================================================
-- TickLO – registration fixes (D-064), from the review of all three formats
--
-- * Team entries: every member gets their own ticket (also when the fee is per
--   team), so the whole team gets through the gate and into the session.
-- * Festivals: a ticket with no "sale ends" keeps selling until its session
--   starts (passes: until the last pass session starts), not only until day 1.
-- * Shortlisting: accepting a team holds its place for 48 hours to pay, and
--   nobody can be accepted once every place is taken.
-- * Individuals: no team name (the participant's name is used) and two people
--   with the same name can both enter.
-- * Organizers choose which member details are required (phone, email, roll
--   no, university); the same person cannot be in two teams of a competition.
-- * Team leads can change members until the competition starts.
-- * Buyers can cancel an unpaid booking.
-- * Organizers choose whether each ticket carries its holder's name and
--   university (off / optional / required); session questions are asked per
--   ticket.
-- * A festival needs a session, a competition event needs a competition,
--   before it can be sent for review.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.events
  add column attendee_names text not null default 'off',
  add column attendee_university text not null default 'off',
  add constraint events_attendee_names check (attendee_names in ('off', 'optional', 'required')),
  add constraint events_attendee_university check (attendee_university in ('off', 'optional', 'required'));
grant insert (attendee_names, attendee_university), update (attendee_names, attendee_university) on public.events to authenticated;

alter table public.event_sessions
  add column member_required text[] not null default '{}',
  add constraint event_sessions_member_required check (member_required <@ array['phone', 'email', 'roll_no', 'university']::text[]);

alter table public.team_registrations add column pay_by timestamptz;

alter table public.orders add column attendees jsonb not null default '[]'::jsonb,
  add constraint orders_attendees_array check (jsonb_typeof(attendees) = 'array');

alter table public.tickets
  add column holder_university text,
  add column answers jsonb not null default '{}'::jsonb,
  add column team_member_index smallint,
  add constraint tickets_holder_university_len check (holder_university is null or char_length(holder_university) <= 120);

-- ---------------------------------------------------------------------------
-- Festivals: when does a ticket with no "sale ends" stop selling?
-- ---------------------------------------------------------------------------
create or replace function public.ticket_type_default_sale_end(p_ticket_type_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.format = 'festival' then coalesce(
      case
        when tt.all_sessions then (select max(s.starts_at) from public.event_sessions s where s.event_id = e.id and s.pass_access)
        else (select max(s.starts_at) from public.ticket_type_sessions x join public.event_sessions s on s.id = x.session_id
              where x.ticket_type_id = tt.id)
      end,
      e.ends_at)
    else e.starts_at
  end
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  where tt.id = p_ticket_type_id;
$$;

-- ---------------------------------------------------------------------------
-- Competition places: paid / paying teams, and accepted teams still inside
-- their time to pay (pay_by). p_exclude: the team that is paying right now.
-- ---------------------------------------------------------------------------
create or replace function public.session_teams_taken_except(p_session_id uuid, p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.team_registrations r
  where r.session_id = p_session_id and r.status = 'approved'
    and (p_exclude is null or r.id <> p_exclude)
    and (
      exists (
        select 1 from public.orders o
        where o.id = r.order_id
          and (o.status in ('approved', 'under_review') or (o.status = 'awaiting_payment' and o.hold_expires_at > now()))
      )
      or (r.pay_by is not null and r.pay_by > now())
    );
$$;

create or replace function public.session_teams_taken(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_teams_taken_except(p_session_id, null);
$$;

-- ---------------------------------------------------------------------------
-- Team members: required details (chosen by the organizer), valid phone and
-- email, nobody listed twice.
-- ---------------------------------------------------------------------------
drop function public.clean_members(jsonb);

create function public.clean_members(p_members jsonb, p_required text[] default '{}')
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_m jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_phone text;
  v_email text;
  v_roll text;
  v_uni text;
  v_f text;
  v_val text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add your team members.';
  end if;
  for v_m in select * from jsonb_array_elements(p_members) loop
    v_name := regexp_replace(btrim(coalesce(v_m ->> 'name', '')), '\s+', ' ', 'g');
    if char_length(v_name) not between 2 and 80 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Every team member needs a name.';
    end if;
    v_phone := nullif(btrim(coalesce(v_m ->> 'phone', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_m ->> 'email', ''))), '');
    v_roll := nullif(left(btrim(coalesce(v_m ->> 'roll_no', '')), 40), '');
    v_uni := nullif(left(btrim(coalesce(v_m ->> 'university', '')), 120), '');
    if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception using message = 'TL:INVALID_ITEMS', detail = format('Check the mobile number of %s.', v_name);
    end if;
    if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception using message = 'TL:INVALID_ITEMS', detail = format('Check the email address of %s.', v_name);
    end if;
    foreach v_f in array coalesce(p_required, '{}'::text[]) loop
      v_val := case v_f when 'phone' then v_phone when 'email' then v_email when 'roll_no' then v_roll when 'university' then v_uni end;
      if v_val is null then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('Add the %s of %s.',
          case v_f when 'phone' then 'mobile number' when 'email' then 'email' when 'roll_no' then 'roll / student ID' else 'university' end, v_name);
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name, 'phone', v_phone, 'email', v_email, 'roll_no', v_roll, 'university', v_uni
    )));
  end loop;

  -- the same person twice in one team
  if exists (
    select 1 from jsonb_array_elements(v_out) m
    where m ? 'phone' group by m ->> 'phone' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_out) m
    where m ? 'email' group by m ->> 'email' having count(*) > 1
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'The same person is listed twice (same mobile number or email).';
  end if;
  return v_out;
end;
$$;

-- Is one of these people already in another team of this competition?
create or replace function public.team_member_conflict(p_session_id uuid, p_members jsonb, p_exclude uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select format('%s is already in "%s" for this competition.', m ->> 'name', r.team_name)
  from jsonb_array_elements(p_members) m
  join public.team_registrations r
    on r.session_id = p_session_id and r.status in ('pending', 'approved') and (p_exclude is null or r.id <> p_exclude)
  cross join lateral jsonb_array_elements(r.members) x
  where (m ? 'phone' and x ->> 'phone' = m ->> 'phone')
     or (m ? 'email' and lower(x ->> 'email') = m ->> 'email')
     or (m ? 'roll_no' and lower(x ->> 'roll_no') = lower(m ->> 'roll_no')
         and lower(coalesce(x ->> 'university', '')) = lower(coalesce(m ->> 'university', '')))
  limit 1;
$$;

-- Organizer: which member details are required for a competition
create or replace function public.set_session_member_fields(p_session_id uuid, p_required text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select e.org_id into v_org from public.event_sessions s join public.events e on e.id = s.event_id where s.id = p_session_id;
  if v_org is null then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.is_org_staff(v_org) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change this.';
  end if;
  update public.event_sessions
  set member_required = (
    select coalesce(array_agg(distinct f order by f), '{}')
    from unnest(coalesce(p_required, '{}'::text[])) f
    where f in ('phone', 'email', 'roll_no', 'university')
  )
  where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ticket holders (names / university / answers per ticket), when the event
-- asks for them. Returns one entry per ticket in item order.
-- ---------------------------------------------------------------------------
create or replace function public.clean_attendees(p_event public.events, p_items jsonb, p_attendees jsonb, p_legacy_answers jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_type uuid;
  v_qty int;
  v_given jsonb;
  v_elem jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_uni text;
  v_answers jsonb;
  v_src jsonb;
  v_q record;
  v_n int;
  i int;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_type := (v_item ->> 'ticket_type_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb) into v_given
    from jsonb_array_elements(case when jsonb_typeof(p_attendees) = 'array' then p_attendees else '[]'::jsonb end)
      with ordinality a(e, n)
    where e ->> 'ticket_type_id' = v_type::text;
    for i in 1..v_qty loop
      v_elem := coalesce(v_given -> (i - 1), '{}'::jsonb);
      v_name := nullif(regexp_replace(btrim(coalesce(v_elem ->> 'name', '')), '\s+', ' ', 'g'), '');
      v_uni := nullif(regexp_replace(btrim(coalesce(v_elem ->> 'university', '')), '\s+', ' ', 'g'), '');
      if p_event.attendee_names = 'off' then
        v_name := null;
      elsif v_name is null and p_event.attendee_names = 'required' then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Enter the name of the person for every ticket.';
      elsif v_name is not null and char_length(v_name) not between 2 and 80 then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Each name on a ticket must be 2 to 80 characters.';
      end if;
      if p_event.attendee_university = 'off' then
        v_uni := null;
      elsif v_uni is null and p_event.attendee_university = 'required' then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Enter the university for every ticket.';
      elsif v_uni is not null and char_length(v_uni) not between 2 and 120 then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Each university name must be 2 to 120 characters.';
      end if;

      -- FES-09: questions of sessions this ticket opens by name (not passes), asked per ticket
      v_answers := '{}'::jsonb;
      for v_q in
        select s.id, s.name, s.questions
        from public.event_sessions s
        join public.ticket_type_sessions x on x.session_id = s.id and x.ticket_type_id = v_type
        where s.event_id = p_event.id and s.kind <> 'competition' and jsonb_array_length(s.questions) > 0
        order by s.starts_at
      loop
        v_src := coalesce(v_elem -> 'answers' -> (v_q.id::text), coalesce(p_legacy_answers, '{}'::jsonb) -> (v_q.id::text));
        v_answers := v_answers || jsonb_build_object(v_q.id::text, public.validate_answers(v_q.questions, v_src, v_q.name));
      end loop;

      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'ticket_type_id', v_type, 'name', v_name, 'university', v_uni, 'answers', v_answers
      )));
    end loop;
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tickets: team entries get one ticket per member; other orders take the
-- holder's name / university / answers per ticket when the event asked.
-- ---------------------------------------------------------------------------
create or replace function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_reg public.team_registrations;
  v_item record;
  v_att jsonb;
  v_type uuid;
  v_count int := 0;
  i int;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if v_order.status <> 'approved' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Tickets are only created for approved orders.';
  end if;
  if exists (select 1 from public.tickets t where t.order_id = p_order_id) then
    return 0;
  end if;

  select * into v_reg from public.team_registrations where order_id = p_order_id;
  if v_reg.id is not null then
    select oi.ticket_type_id into v_type from public.order_items oi where oi.order_id = p_order_id limit 1;
    for i in 1..jsonb_array_length(v_reg.members) loop
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, holder_university, code, team_member_index)
      values (
        p_order_id, v_order.event_id, v_type, v_order.user_id,
        left(coalesce(nullif(btrim(v_reg.members -> (i - 1) ->> 'name'), ''), v_reg.team_name), 120),
        nullif(left(btrim(coalesce(v_reg.members -> (i - 1) ->> 'university', '')), 120), ''),
        public.generate_ticket_code(), i - 1
      );
      v_count := v_count + 1;
    end loop;
    return v_count;
  end if;

  for v_item in
    select oi.ticket_type_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id order by oi.ticket_type_id
  loop
    for i in 1..v_item.quantity loop
      select e into v_att
      from jsonb_array_elements(v_order.attendees) with ordinality a(e, n)
      where e ->> 'ticket_type_id' = v_item.ticket_type_id::text
      order by n offset (i - 1) limit 1;
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, holder_university, answers, code)
      values (
        p_order_id, v_order.event_id, v_item.ticket_type_id, v_order.user_id,
        left(coalesce(nullif(btrim(v_att ->> 'name'), ''), v_order.buyer_name), 120),
        nullif(left(btrim(coalesce(v_att ->> 'university', '')), 120), ''),
        coalesce(v_att -> 'answers', '{}'::jsonb),
        public.generate_ticket_code()
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team lead changes the team (members drop out, details fixed) until the
-- competition starts. After paying, the number of members stays the same and
-- the names on not-yet-used tickets follow.
-- ---------------------------------------------------------------------------
create or replace function public.update_team_members(p_registration_id uuid, p_team_name text, p_members jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
  v_session public.event_sessions;
  v_members jsonb;
  v_count int;
  v_team text := btrim(coalesce(p_team_name, ''));
  v_order public.orders;
  v_conflict text;
  i int;
begin
  select * into v_reg from public.team_registrations where id = p_registration_id for update;
  if not found or v_reg.user_id <> auth.uid() then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
  end if;
  if v_reg.status not in ('pending', 'approved') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This registration is closed.';
  end if;
  select * into v_session from public.event_sessions where id = v_reg.session_id for update;
  if now() >= v_session.starts_at then
    raise exception using message = 'TL:INVALID_STATE', detail = 'The competition has started, so the team can no longer be changed.';
  end if;

  v_members := public.clean_members(p_members, v_session.member_required);
  v_count := jsonb_array_length(v_members);
  if v_count not between v_session.team_min and v_session.team_max then
    raise exception using message = 'TL:INVALID_ITEMS',
      detail = case when v_session.team_min = v_session.team_max then format('Teams must have exactly %s members.', v_session.team_min)
                    else format('Teams must have %s to %s members.', v_session.team_min, v_session.team_max) end;
  end if;
  if v_session.team_max = 1 then
    v_team := v_members -> 0 ->> 'name';
  elsif char_length(v_team) not between 2 and 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give your team a name (2 to 80 characters).';
  elsif exists (
    select 1 from public.team_registrations r
    where r.session_id = v_reg.session_id and r.id <> v_reg.id and lower(r.team_name) = lower(v_team) and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Another team already uses this name.';
  end if;
  v_conflict := public.team_member_conflict(v_reg.session_id, v_members, v_reg.id);
  if v_conflict is not null then
    raise exception using message = 'TL:MEMBER_TAKEN', detail = v_conflict;
  end if;

  if v_reg.order_id is not null then
    select * into v_order from public.orders where id = v_reg.order_id for update;
    if v_order.status in ('approved', 'under_review') and v_count <> v_reg.member_count then
      raise exception using message = 'TL:INVALID_STATE',
        detail = format('You have paid for %s members, so keep %s. Replace members instead of adding or removing.', v_reg.member_count, v_reg.member_count);
    end if;
    -- unpaid booking for a per-member fee: the amount changes, so book again
    if v_order.status = 'awaiting_payment' and v_count <> v_reg.member_count and v_session.fee_mode = 'per_member' then
      update public.orders set status = 'expired' where id = v_order.id;
    end if;
  end if;

  update public.team_registrations set team_name = v_team, members = v_members, member_count = v_count where id = v_reg.id;

  -- names on tickets that have not been used yet
  if v_reg.order_id is not null then
    for i in 1..v_count loop
      update public.tickets t
      set holder_name = left(v_members -> (i - 1) ->> 'name', 120),
          holder_university = nullif(left(btrim(coalesce(v_members -> (i - 1) ->> 'university', '')), 120), '')
      where t.order_id = v_reg.order_id and t.team_member_index = i - 1
        and t.checked_in_at is null and t.entry_at is null
        and not exists (select 1 from public.session_checkins c where c.ticket_id = t.id);
    end loop;
  end if;
  perform public.audit('team.update', 'event', v_reg.event_id::text,
    jsonb_build_object('registration_id', v_reg.id, 'team', v_team, 'members', v_count));
end;
$$;

-- ---------------------------------------------------------------------------
-- Buyer cancels an unpaid booking (no payment sent yet) to book again.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> auth.uid() then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Booking not found.';
  end if;
  if v_order.status <> 'awaiting_payment' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only unpaid bookings can be cancelled.';
  end if;
  if exists (select 1 from public.payment_proofs p where p.order_id = p_order_id) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'You already sent a payment for this booking. Contact the organizer.';
  end if;
  update public.orders set status = 'expired', hold_expires_at = now() where id = p_order_id;
  perform public.audit('order.cancel_by_buyer', 'order', p_order_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order: festival sale ends, per-ticket holders and answers, a paying
-- team does not count against its own place
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, jsonb, text, text, text, text, jsonb, uuid);

create function public.create_order(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_code text default null,
  p_ref text default null,
  p_answers jsonb default null,
  p_registration_id uuid default null,
  p_attendees jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event public.events;
  v_items jsonb := p_items;
  v_item jsonb;
  v_type public.ticket_types;
  v_type_ids uuid[];
  v_qty int;
  v_total_qty int := 0;
  v_total bigint := 0;
  v_requires_card boolean := false;
  v_taken int;
  v_sale_end timestamptz;
  v_existing public.orders;
  v_status public.order_status;
  v_order_id uuid;
  v_ref text;
  -- codes
  v_code text := public.normalize_code(p_code);
  v_link text := public.normalize_code(p_ref);
  v_promo public.promo_codes;
  v_seller public.print_sellers;
  v_source text;
  v_cfg public.referral_settings;
  v_eligible_qty int;
  v_promo_discount bigint := 0;
  v_seller_discount bigint := 0;
  v_discount bigint := 0;
  v_promo_id uuid;
  -- festivals
  v_reg public.team_registrations;
  v_session public.event_sessions;
  v_answers jsonb := '{}'::jsonb;
  v_attendees jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to book tickets.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to book tickets.';
  end if;
  if v_profile.is_suspended then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;

  -- AUTH-06: name and phone can be filled in right here at checkout
  if p_buyer_name is not null and char_length(trim(p_buyer_name)) >= 2 then
    v_profile.full_name := left(trim(p_buyer_name), 100);
    update public.profiles set full_name = v_profile.full_name where id = v_uid;
  end if;
  if p_buyer_phone is not null and char_length(trim(p_buyer_phone)) between 8 and 20 then
    v_profile.phone := trim(p_buyer_phone);
    update public.profiles set phone = v_profile.phone where id = v_uid;
  end if;
  if coalesce(char_length(trim(v_profile.full_name)), 0) < 2 or coalesce(char_length(trim(v_profile.phone)), 0) < 8 then
    raise exception using message = 'TL:PROFILE_INCOMPLETE', detail = 'Please add your full name and phone number first.';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'Tickets for this event are not on sale.';
  end if;

  if p_registration_id is not null then
    -- FES-10: paying for a team registration
    select * into v_reg from public.team_registrations where id = p_registration_id for update;
    if not found or v_reg.user_id <> v_uid or v_reg.event_id <> p_event_id then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
    end if;
    if v_reg.status <> 'approved' then
      raise exception using message = 'TL:INVALID_STATE',
        detail = case v_reg.status when 'pending' then 'The organizer has not accepted your team yet.' else 'This registration is closed.' end;
    end if;
    if v_reg.order_id is not null then
      select * into v_existing from public.orders o where o.id = v_reg.order_id;
      if v_existing.status in ('approved', 'under_review', 'rejected')
         or (v_existing.status = 'awaiting_payment' and v_existing.hold_expires_at > now()) then
        return jsonb_build_object(
          'order_id', v_existing.id, 'ref_code', v_existing.ref_code, 'status', v_existing.status,
          'total_paisa', v_existing.total_paisa, 'discount_paisa', v_existing.discount_paisa, 'existing', true
        );
      end if;
    end if;
    select * into v_session from public.event_sessions where id = v_reg.session_id for update;
    select * into v_type from public.ticket_types where registration_session_id = v_session.id;
    if v_type.id is null then
      raise exception using message = 'TL:INVALID_STATE', detail = 'Registration for this competition is not set up.';
    end if;
    -- D-064: places held by other teams (this team's own hold does not count against it)
    if public.session_teams_taken_except(v_session.id, v_reg.id) >= coalesce(v_session.capacity, 0) then
      raise exception using message = 'TL:SOLD_OUT', detail = format('"%s" is full – no team places left.', v_session.name);
    end if;
    v_items := jsonb_build_array(jsonb_build_object(
      'ticket_type_id', v_type.id,
      'quantity', case when v_session.fee_mode = 'per_member' then v_reg.member_count else 1 end
    ));
    v_type := null;
  else
    -- D-007: one unpaid booking per event per user (team payments are separate)
    select * into v_existing
    from public.orders o
    where o.user_id = v_uid and o.event_id = p_event_id
      and o.status = 'awaiting_payment' and o.hold_expires_at > now()
      and not exists (select 1 from public.team_registrations r where r.order_id = o.id)
    order by o.created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'ref_code', v_existing.ref_code, 'status', v_existing.status,
        'total_paisa', v_existing.total_paisa, 'discount_paisa', v_existing.discount_paisa, 'existing', true
      );
    end if;
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose at least one ticket.';
  end if;

  select array_agg(x.id order by x.id) into v_type_ids
  from (select distinct (elem ->> 'ticket_type_id')::uuid as id from jsonb_array_elements(v_items) elem) x;
  if coalesce(array_length(v_type_ids, 1), 0) <> jsonb_array_length(v_items) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each ticket type can appear only once.';
  end if;

  -- Lock in a stable order to avoid deadlocks between concurrent buyers
  perform 1 from public.ticket_types tt where tt.id = any (v_type_ids) order by tt.id for update;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Quantity must be at least 1.';
    end if;

    select * into v_type from public.ticket_types tt
    where tt.id = (v_item ->> 'ticket_type_id')::uuid and tt.event_id = p_event_id;
    if not found then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'That ticket type does not belong to this event.';
    end if;
    if v_type.registration_session_id is not null and p_registration_id is null then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Competition entries are made by registering your team.';
    end if;

    if v_type.sale_starts_at is not null and now() < v_type.sale_starts_at then
      raise exception using message = 'TL:SALE_NOT_STARTED', detail = format('Sale for "%s" has not started yet.', v_type.name);
    end if;
    -- rule 3: no end date → booking closes when the event starts. D-064: festival tickets sell until
    -- their session starts (passes: the last pass session); an accepted team can pay until its competition starts.
    v_sale_end := case
      when p_registration_id is not null then v_session.starts_at
      else coalesce(v_type.sale_ends_at, public.ticket_type_default_sale_end(v_type.id))
    end;
    if now() >= v_sale_end then
      raise exception using message = 'TL:SALE_CLOSED', detail = format('Sale for "%s" is closed.', v_type.name);
    end if;

    v_taken := public.ticket_type_taken(v_type.id);
    if v_type.quantity - v_taken < v_qty then
      raise exception using message = 'TL:SOLD_OUT',
        detail = case
          when v_type.quantity - v_taken <= 0 then format('"%s" is sold out.', v_type.name)
          else format('Only %s "%s" ticket(s) left.', v_type.quantity - v_taken, v_type.name)
        end;
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_total := v_total + (v_qty::bigint * v_type.price_paisa);
    v_requires_card := v_requires_card or v_type.requires_student_card;
  end loop;

  if p_registration_id is null and v_total_qty > v_event.max_tickets_per_order then
    raise exception using message = 'TL:MAX_PER_ORDER',
      detail = format('You can book at most %s tickets in one order.', v_event.max_tickets_per_order);
  end if;

  -- FES-03: session seats (after the ticket types are locked)
  perform public.assert_session_capacity(v_items);

  -- D-064: one entry per ticket (holder name / university when the event asks, and the answers to
  -- session questions per ticket). orders.answers keeps the first ticket's answers for older screens.
  if p_registration_id is null then
    v_attendees := public.clean_attendees(v_event, v_items, p_attendees, p_answers);
    select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb) into v_answers
    from (
      select distinct on (j.k) j.k, j.v
      from jsonb_array_elements(v_attendees) with ordinality a(e, n)
      cross join lateral jsonb_each(coalesce(a.e -> 'answers', '{}'::jsonb)) j(k, v)
      order by j.k, a.n
    ) x;
  end if;

  -- ---- Codes (AMB-04, AMB-07) ----
  if v_code is not null then
    select * into v_promo from public.promo_codes pc where pc.event_id = p_event_id and pc.code = v_code for update;
    if found then
      if not v_promo.active then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is turned off.';
      end if;
      if v_promo.starts_at is not null and now() < v_promo.starts_at then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is not active yet.';
      end if;
      if v_promo.ends_at is not null and now() >= v_promo.ends_at then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code has expired.';
      end if;
      if v_promo.max_uses is not null and public.promo_code_uses(v_promo.id) >= v_promo.max_uses then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code has been used up.';
      end if;
      select coalesce(sum((e ->> 'quantity')::int), 0) into v_eligible_qty
      from jsonb_array_elements(v_items) e
      where v_promo.ticket_type_ids is null or (e ->> 'ticket_type_id')::uuid = any (v_promo.ticket_type_ids);
      if v_eligible_qty = 0 then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code does not work for the tickets you chose.';
      end if;
      if v_eligible_qty < v_promo.min_tickets then
        raise exception using message = 'TL:INVALID_CODE',
          detail = format('Choose at least %s tickets to use this code.', v_promo.min_tickets);
      end if;
      v_promo_discount := public.discount_for(v_items, v_promo.discount_type, v_promo.discount_value, v_promo.ticket_type_ids);
    else
      select * into v_seller from public.print_sellers s where s.event_id = p_event_id and s.ref_code = v_code;
      if not found then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code is not valid for this event.';
      end if;
      if v_seller.settled_at is not null then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This ambassador code is no longer active.';
      end if;
      v_source := 'code';
    end if;
  end if;

  if v_seller.id is null and v_link is not null then
    select * into v_seller from public.print_sellers s
    where s.event_id = p_event_id and s.ref_code = v_link and s.settled_at is null;
    if found then
      v_source := 'link';
    end if;
  end if;

  -- AMB-12: nobody earns from their own booking
  if v_seller.id is not null and (
    v_seller.user_id = v_uid
    or (public.phone_key(v_seller.phone) is not null and public.phone_key(v_seller.phone) = public.phone_key(v_profile.phone))
  ) then
    if v_source = 'code' then
      raise exception using message = 'TL:OWN_CODE', detail = 'You cannot use your own ambassador code.';
    end if;
    v_seller := null;
    v_source := null;
  end if;

  if v_seller.id is not null then
    select * into v_cfg from public.referral_settings where event_id = p_event_id;
    if found then
      v_seller_discount := public.discount_for(v_items, v_cfg.discount_type, v_cfg.discount_value, null);
    end if;
  end if;

  if v_promo.id is not null and v_promo_discount >= v_seller_discount then
    v_discount := v_promo_discount;
    v_promo_id := v_promo.id;
  else
    v_discount := v_seller_discount;
  end if;
  v_discount := least(v_discount, v_total);
  v_total := v_total - v_discount;

  v_status := case
    when v_total = 0 and not v_requires_card then 'approved'::public.order_status
    else 'awaiting_payment'::public.order_status
  end;

  v_ref := public.generate_ref_code();
  insert into public.orders (
    ref_code, event_id, user_id, status, total_paisa, ticket_count, requires_student_card,
    hold_expires_at, buyer_name, buyer_email, buyer_phone, approved_at, decided_at,
    seller_id, referral_source, promo_code_id, discount_paisa, answers, attendees
  )
  values (
    v_ref, p_event_id, v_uid, v_status, v_total, v_total_qty, v_requires_card,
    case when v_status = 'awaiting_payment' then now() + interval '60 minutes' end,
    v_profile.full_name, v_profile.email, v_profile.phone,
    case when v_status = 'approved' then now() end,
    case when v_status = 'approved' then now() end,
    v_seller.id, v_source, v_promo_id, v_discount, v_answers, v_attendees
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_paisa)
  select v_order_id, tt.id, (e ->> 'quantity')::int, tt.price_paisa
  from jsonb_array_elements(v_items) e
  join public.ticket_types tt on tt.id = (e ->> 'ticket_type_id')::uuid;

  if p_registration_id is not null then
    update public.team_registrations set order_id = v_order_id where id = p_registration_id;
  end if;

  if v_status = 'approved' then
    perform public.issue_tickets(v_order_id);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id, 'ref_code', v_ref, 'status', v_status,
    'total_paisa', v_total, 'discount_paisa', v_discount, 'existing', false
  );
end;
$$;

revoke all on function public.create_order(uuid, jsonb, text, text, text, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.create_order(uuid, jsonb, text, text, text, text, jsonb, uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Team registration: required details, individuals, nobody in two teams
-- ---------------------------------------------------------------------------
create or replace function public.register_team(
  p_session_id uuid,
  p_team_name text,
  p_members jsonb,
  p_answers jsonb default null,
  p_code text default null,
  p_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_session public.event_sessions;
  v_event public.events;
  v_type public.ticket_types;
  v_members jsonb;
  v_conflict text;
  v_count int;
  v_team text := btrim(coalesce(p_team_name, ''));
  v_answers jsonb;
  v_id uuid;
  v_order jsonb;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to register.';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.is_suspended then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;
  if coalesce(char_length(btrim(v_profile.full_name)), 0) < 2 or coalesce(char_length(btrim(v_profile.phone)), 0) < 8 then
    raise exception using message = 'TL:PROFILE_INCOMPLETE', detail = 'Please add your full name and phone number first.';
  end if;

  select * into v_session from public.event_sessions where id = p_session_id for update;
  if not found or v_session.kind <> 'competition' then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Competition not found.';
  end if;
  select * into v_event from public.events where id = v_session.event_id;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'Registration is not open.';
  end if;
  select * into v_type from public.ticket_types where registration_session_id = p_session_id;
  if v_type.id is null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Registration for this competition is not set up.';
  end if;
  if v_type.sale_starts_at is not null and now() < v_type.sale_starts_at then
    raise exception using message = 'TL:SALE_NOT_STARTED', detail = 'Registration has not opened yet.';
  end if;
  if now() >= coalesce(v_type.sale_ends_at, v_session.starts_at) then
    raise exception using message = 'TL:SALE_CLOSED', detail = 'Registration is closed.';
  end if;

  -- D-064: organizer-chosen required details; individuals enter under their own name
  v_members := public.clean_members(p_members, v_session.member_required);
  if v_session.team_max = 1 then
    v_team := v_members -> 0 ->> 'name';
  end if;
  if char_length(v_team) not between 2 and 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give your team a name (2 to 80 characters).';
  end if;
  v_count := jsonb_array_length(v_members);
  if v_count not between v_session.team_min and v_session.team_max then
    raise exception using message = 'TL:INVALID_ITEMS',
      detail = case when v_session.team_min = v_session.team_max then format('Teams must have exactly %s members.', v_session.team_min)
                    else format('Teams must have %s to %s members.', v_session.team_min, v_session.team_max) end;
  end if;
  if exists (
    select 1 from public.team_registrations r
    where r.session_id = p_session_id and r.user_id = v_uid and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:ALREADY_REGISTERED', detail = 'You have already registered a team for this competition.';
  end if;
  if v_session.team_max > 1 and exists (
    select 1 from public.team_registrations r
    where r.session_id = p_session_id and lower(r.team_name) = lower(v_team) and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Another team already uses this name.';
  end if;
  if not v_session.needs_approval and public.session_teams_taken(p_session_id) >= coalesce(v_session.capacity, 0) then
    raise exception using message = 'TL:SOLD_OUT', detail = format('"%s" is full – no places left.', v_session.name);
  end if;
  v_conflict := public.team_member_conflict(p_session_id, v_members, null);
  if v_conflict is not null then
    raise exception using message = 'TL:MEMBER_TAKEN', detail = v_conflict;
  end if;
  v_answers := public.validate_answers(v_session.questions, p_answers, v_session.name);
  if not public.rate_limit_hit('register_team:' || v_uid::text, 20, 3600) then
    raise exception using message = 'TL:RATE_LIMITED', detail = 'Too many registrations. Please try again later.';
  end if;

  insert into public.team_registrations (event_id, session_id, user_id, team_name, members, member_count, answers, status)
  values (v_session.event_id, p_session_id, v_uid, v_team, v_members, v_count, v_answers,
          case when v_session.needs_approval then 'pending' else 'approved' end)
  returning id into v_id;

  if not v_session.needs_approval then
    v_order := public.create_order(v_session.event_id, null, null, null, p_code, p_ref, null, v_id);
  end if;

  return jsonb_build_object(
    'registration_id', v_id,
    'status', case when v_session.needs_approval then 'pending' else 'approved' end,
    'order', v_order
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Shortlisting: places are held while accepted teams pay
-- ---------------------------------------------------------------------------
create or replace function public.decide_team_registration(p_registration_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
  v_session public.event_sessions;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  select * into v_reg from public.team_registrations where id = p_registration_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
  end if;
  if not public.can_manage_session(v_reg.session_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the organizers or managers of this competition can do that.';
  end if;
  if p_approve then
    if v_reg.status <> 'pending' then
      return jsonb_build_object('changed', false, 'status', v_reg.status);
    end if;
    -- D-064: accepting holds a place for 48 hours to pay; no accepting past the number of places
    select * into v_session from public.event_sessions where id = v_reg.session_id for update;
    if v_session.capacity is not null and public.session_teams_taken(v_session.id) >= v_session.capacity then
      raise exception using message = 'TL:SOLD_OUT',
        detail = format('All %s places are taken (paid, or accepted and still inside their 48 hours to pay). Decline someone or add places first.', v_session.capacity);
    end if;
    update public.team_registrations
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), reject_reason = null,
        pay_by = least(now() + interval '48 hours', v_session.starts_at)
    where id = p_registration_id;
  else
    if v_reg.status not in ('pending', 'approved') then
      return jsonb_build_object('changed', false, 'status', v_reg.status);
    end if;
    if v_reg.order_id is not null and exists (
      select 1 from public.orders o where o.id = v_reg.order_id and o.status in ('approved', 'under_review')
    ) then
      raise exception using message = 'TL:INVALID_STATE', detail = 'This team has already paid or sent a payment. Handle it in Payments first.';
    end if;
    update public.orders set status = 'expired' where id = v_reg.order_id and status = 'awaiting_payment';
    update public.team_registrations set status = 'rejected', decided_by = auth.uid(), decided_at = now(), reject_reason = v_reason
    where id = p_registration_id;
  end if;
  perform public.audit(case when p_approve then 'team.approve' else 'team.reject' end, 'event', v_reg.event_id::text,
    jsonb_build_object('registration_id', p_registration_id, 'team', v_reg.team_name));
  return jsonb_build_object('changed', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

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
  -- D-064: a festival needs its programme, a competition event its competition
  if v_event.format = 'festival' and not exists (select 1 from public.event_sessions s where s.event_id = p_event_id) then
    raise exception using message = 'TL:NO_SESSIONS', detail = 'Add at least one session (workshop, competition, night…) to your festival first.';
  end if;
  if v_event.format = 'competition' and not exists (
    select 1 from public.event_sessions s where s.event_id = p_event_id and s.kind = 'competition'
  ) then
    raise exception using message = 'TL:NO_SESSIONS', detail = 'Set up the competition (who can take part, team size, entry fee) first.';
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

-- ---------------------------------------------------------------------------
-- Session managers: holder university and per-ticket answers
-- ---------------------------------------------------------------------------
drop function public.session_attendees(uuid);

create function public.session_attendees(p_session_id uuid)
returns table (
  ticket_id uuid, code text, holder_name text, holder_university text, ticket_type text, source text, serial text,
  buyer_name text, buyer_phone text, buyer_email text, order_ref text, answers jsonb,
  status public.ticket_status, session_checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_session(p_session_id) and not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  return query
    select t.id, t.code, t.holder_name, t.holder_university, tt.name, t.source, public.print_serial_label(pb.prefix, t.serial_no),
           o.buyer_name, o.buyer_phone, o.buyer_email, o.ref_code,
           coalesce(t.answers -> (s.id::text), o.answers -> (s.id::text), '{}'::jsonb),
           t.status, c.checked_in_at
    from public.event_sessions s
    join public.tickets t on t.event_id = s.event_id
    join public.ticket_types tt on tt.id = t.ticket_type_id
    left join public.orders o on o.id = t.order_id
    left join public.print_batches pb on pb.id = t.batch_id
    left join public.session_checkins c on c.session_id = s.id and c.ticket_id = t.id
    where s.id = p_session_id and t.status <> 'cancelled' and public.session_grants(t.ticket_type_id, s.id)
      and not (t.source = 'printed' and t.sale_status in ('in_stock', 'returned'))
    order by c.checked_in_at nulls last, t.holder_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- My teams: members (to edit), time to pay, team size and required details
-- ---------------------------------------------------------------------------
drop function public.my_team_registrations();

create function public.my_team_registrations()
returns table (
  id uuid, team_name text, member_count integer, status text, reject_reason text, created_at timestamptz,
  session_id uuid, session_name text, session_starts_at timestamptz, needs_approval boolean,
  event_id uuid, event_name text, event_slug text, org_slug text,
  order_id uuid, order_status public.order_status, hold_expires_at timestamptz, fee_paisa integer, fee_mode text,
  members jsonb, pay_by timestamptz, team_min integer, team_max integer, member_required text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.team_name, r.member_count, r.status, r.reject_reason, r.created_at,
         s.id, s.name, s.starts_at, s.needs_approval, e.id, e.name, e.slug, og.slug,
         o.id, o.status, o.hold_expires_at, rt.price_paisa, s.fee_mode,
         r.members, r.pay_by, s.team_min, s.team_max, s.member_required
  from public.team_registrations r
  join public.event_sessions s on s.id = r.session_id
  join public.events e on e.id = r.event_id
  join public.organizations og on og.id = e.org_id
  left join public.orders o on o.id = r.order_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where r.user_id = auth.uid()
  order by s.starts_at desc, r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Public schedule: which member details the organizer requires
-- ---------------------------------------------------------------------------
drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end, s.member_required
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.ticket_type_default_sale_end(uuid) from public, anon, authenticated;
revoke all on function public.session_teams_taken_except(uuid, uuid) from public, anon, authenticated;
revoke all on function public.team_member_conflict(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.clean_attendees(public.events, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.clean_members(jsonb, text[]) from public, anon, authenticated;
grant execute on function
  public.ticket_type_default_sale_end(uuid),
  public.session_teams_taken_except(uuid, uuid),
  public.team_member_conflict(uuid, jsonb, uuid),
  public.clean_attendees(public.events, jsonb, jsonb, jsonb),
  public.clean_members(jsonb, text[])
to service_role;

revoke all on function public.session_attendees(uuid) from public, anon;
revoke all on function public.my_team_registrations() from public, anon;
revoke all on function public.update_team_members(uuid, text, jsonb) from public, anon;
revoke all on function public.cancel_my_order(uuid) from public, anon;
revoke all on function public.set_session_member_fields(uuid, text[]) from public, anon;
grant execute on function
  public.session_attendees(uuid),
  public.my_team_registrations(),
  public.update_team_members(uuid, text, jsonb),
  public.cancel_my_order(uuid),
  public.set_session_member_fields(uuid, text[])
to authenticated, service_role;

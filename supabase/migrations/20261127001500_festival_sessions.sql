-- =============================================================================
-- TickLO – festivals: sessions, session tickets, competitions (FES-01 .. FES-14, D-044)
--
-- One event (e.g. "Aurex 2026") can have sessions: workshops, competitions,
-- concerts / qawwali nights, talks. An event without sessions works exactly as
-- before.
--
-- * Ticket types say what they open:
--     all_sessions = true  → a pass: every session that is "included in passes"
--     all_sessions = false → only the sessions listed in ticket_type_sessions
-- * A session can have its own seats (capacity). Every ticket that opens the
--   session (online holds/sales and printed tickets) uses a seat.
-- * Scanning: the gate can scan "main entry" (once per ticket, as before) or a
--   session (once per ticket per session). The first successful scan anywhere
--   marks the ticket as "came" (status checked_in) so all existing numbers keep
--   working; main entry has its own time (entry_at).
-- * Competitions: teams register (team name, members, answers). The entry fee is
--   a ticket type linked to the competition (made by save_session): one ticket
--   per team or one per member. Optional shortlisting before payment. Max teams.
--   Results (1st/2nd/3rd…) can be published on the event page.
-- * Sessions can ask questions (T-shirt size, laptop?, GitHub link…), answered
--   when booking a session ticket or registering a team.
-- * Session managers (any team member) see and run their own session:
--   attendees, answers, registrations, shortlisting, check-in, results.
--   Scanners can be limited to some sessions.
-- =============================================================================

alter type public.checkin_result add value if not exists 'wrong_session';

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  description text,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer,                         -- seats; for competitions: max teams
  pass_access boolean not null default true, -- included in all-access passes
  sort_order integer not null default 0,
  questions jsonb not null default '[]'::jsonb,
  -- competitions
  team_min integer not null default 1,
  team_max integer not null default 1,
  fee_mode text not null default 'per_team',
  needs_approval boolean not null default false,
  results jsonb not null default '[]'::jsonb,
  results_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sessions_name_len check (char_length(name) between 1 and 120),
  constraint event_sessions_kind check (kind in ('workshop', 'competition', 'concert', 'talk', 'other')),
  constraint event_sessions_description_len check (description is null or char_length(description) <= 2000),
  constraint event_sessions_venue_len check (venue is null or char_length(venue) <= 200),
  constraint event_sessions_times check (ends_at > starts_at),
  constraint event_sessions_capacity check (capacity is null or capacity between 1 and 100000),
  constraint event_sessions_team check (team_min between 1 and 20 and team_max between team_min and 20),
  constraint event_sessions_fee_mode check (fee_mode in ('per_team', 'per_member')),
  constraint event_sessions_questions check (jsonb_typeof(questions) = 'array'),
  constraint event_sessions_results check (jsonb_typeof(results) = 'array'),
  constraint event_sessions_competition_pass check (kind <> 'competition' or not pass_access)
);
create index event_sessions_event_idx on public.event_sessions (event_id, starts_at);
create trigger event_sessions_updated_at before update on public.event_sessions
  for each row execute function public.set_updated_at();

alter table public.ticket_types
  add column all_sessions boolean not null default true,
  add column registration_session_id uuid references public.event_sessions (id) on delete set null;
create unique index ticket_types_registration_idx on public.ticket_types (registration_session_id) where registration_session_id is not null;

create table public.ticket_type_sessions (
  ticket_type_id uuid not null references public.ticket_types (id) on delete cascade,
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  primary key (ticket_type_id, session_id)
);
create index ticket_type_sessions_session_idx on public.ticket_type_sessions (session_id);

-- Main entry has its own time; checked_in_at = first scan anywhere ("came")
alter table public.tickets add column entry_at timestamptz;
update public.tickets set entry_at = checked_in_at where status = 'checked_in' and checked_in_at is not null;

alter table public.checkins add column session_id uuid references public.event_sessions (id) on delete set null;

create table public.session_checkins (
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references public.profiles (id) on delete set null,
  method public.checkin_method not null,
  primary key (session_id, ticket_id)
);
create index session_checkins_ticket_idx on public.session_checkins (ticket_id);

-- Scanners limited to some sessions (null = whole event, as before)
alter table public.event_staff add column session_ids uuid[];

create table public.session_managers (
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index session_managers_user_idx on public.session_managers (user_id);

create table public.team_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  session_id uuid not null references public.event_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_name text not null,
  members jsonb not null,
  member_count integer not null,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  order_id uuid references public.orders (id) on delete set null,
  reject_reason text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_registrations_name_len check (char_length(team_name) between 2 and 80),
  constraint team_registrations_members check (jsonb_typeof(members) = 'array' and member_count between 1 and 20),
  constraint team_registrations_status check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint team_registrations_reason_len check (reject_reason is null or char_length(reject_reason) <= 500)
);
create index team_registrations_session_idx on public.team_registrations (session_id, status);
create index team_registrations_user_idx on public.team_registrations (user_id, created_at desc);
create unique index team_registrations_order_idx on public.team_registrations (order_id) where order_id is not null;
create unique index team_registrations_active_idx on public.team_registrations (session_id, user_id) where status in ('pending', 'approved');
create trigger team_registrations_updated_at before update on public.team_registrations
  for each row execute function public.set_updated_at();

-- Session answers given while booking: {"<session_id>": {"q1": "M"}}
alter table public.orders add column answers jsonb not null default '{}'::jsonb;

-- A registration ticket type must belong to a competition of the same event
create or replace function public.ticket_types_session_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_session_id is not null and not exists (
    select 1 from public.event_sessions s
    where s.id = new.registration_session_id and s.event_id = new.event_id and s.kind = 'competition'
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'The competition must belong to this event.';
  end if;
  if new.registration_session_id is not null then
    new.all_sessions := false;
  end if;
  return new;
end;
$$;
create trigger ticket_types_session_guard before insert or update on public.ticket_types
  for each row execute function public.ticket_types_session_guard();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- Does this ticket type open this session?
create or replace function public.session_grants(p_ticket_type_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ticket_type_sessions x where x.ticket_type_id = p_ticket_type_id and x.session_id = p_session_id
  ) or exists (
    select 1 from public.ticket_types tt
    join public.event_sessions s on s.id = p_session_id
    where tt.id = p_ticket_type_id and tt.event_id = s.event_id and tt.all_sessions and s.pass_access
      and tt.registration_session_id is null
  );
$$;

-- Teams holding a place (paid, in review, or holding an unpaid order)
create or replace function public.session_teams_taken(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.team_registrations r
  join public.orders o on o.id = r.order_id
  where r.session_id = p_session_id and r.status = 'approved'
    and (o.status in ('approved', 'under_review') or (o.status = 'awaiting_payment' and o.hold_expires_at > now()));
$$;

-- Seats used: every ticket of a type that opens the session (online + printed)
create or replace function public.session_taken(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.kind = 'competition' then public.session_teams_taken(s.id)
    else coalesce((
      select sum(public.ticket_type_taken(tt.id))
      from public.ticket_types tt
      where tt.event_id = s.event_id and public.session_grants(tt.id, s.id)
    ), 0)::int
  end
  from public.event_sessions s
  where s.id = p_session_id;
$$;

create or replace function public.session_remaining(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.capacity is null then null else greatest(s.capacity - public.session_taken(s.id), 0) end
  from public.event_sessions s
  where s.id = p_session_id;
$$;

-- Lock and check session seats for a booking or a print batch.
-- p_items: [{"ticket_type_id": "...", "quantity": 2}]. Call AFTER locking the ticket types.
create or replace function public.assert_session_capacity(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_requested int;
  v_taken int;
begin
  for v_session in
    select s.id, s.name, s.capacity
    from public.event_sessions s
    where s.capacity is not null and s.kind <> 'competition'
      and exists (
        select 1 from jsonb_array_elements(p_items) e
        where public.session_grants((e ->> 'ticket_type_id')::uuid, s.id)
      )
    order by s.id
    for update of s
  loop
    select coalesce(sum((e ->> 'quantity')::int), 0) into v_requested
    from jsonb_array_elements(p_items) e
    where public.session_grants((e ->> 'ticket_type_id')::uuid, v_session.id);
    v_taken := public.session_taken(v_session.id);
    if v_taken + v_requested > v_session.capacity then
      raise exception using message = 'TL:SOLD_OUT',
        detail = case
          when v_session.capacity - v_taken <= 0 then format('"%s" is full.', v_session.name)
          else format('Only %s seats left in "%s".', v_session.capacity - v_taken, v_session.name)
        end;
    end if;
  end loop;
end;
$$;

-- Public: remaining tickets per type, now also limited by session seats (EVT-03, FES-03)
create or replace function public.event_availability(p_event_id uuid)
returns table (ticket_type_id uuid, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  select tt.id,
         greatest(least(
           tt.quantity - public.ticket_type_taken(tt.id),
           coalesce((
             select min(public.session_remaining(s.id))
             from public.event_sessions s
             where s.event_id = tt.event_id and s.capacity is not null and s.kind <> 'competition'
               and public.session_grants(tt.id, s.id)
           ), 2147483647)
         ), 0)
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  where tt.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin());
$$;

-- Organizer of the event or a manager of the session (FES-12)
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
        exists (
          select 1 from public.organization_members m
          where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
        )
        or exists (select 1 from public.session_managers sm where sm.session_id = s.id and sm.user_id = p_user_id)
      )
    );
$$;

-- Whole-event scanners only (scanners limited to sessions cannot scan main entry)
create or replace function public.can_scan_event(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and exists (
      select 1
      from public.events e
      join public.profiles pr on pr.id = p_user_id and not pr.is_suspended
      where e.id = p_event_id
        and e.status = 'published'
        and now() <= e.ends_at + interval '6 hours'
        and (
          exists (
            select 1 from public.event_staff s
            where s.event_id = e.id and s.user_id = p_user_id and s.expires_at > now() and s.session_ids is null
          )
          or exists (
            select 1 from public.organization_members m
            where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
          )
        )
    );
$$;

-- Can this person scan this session right now? (FES-07)
create or replace function public.can_scan_session(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_user_id = auth.uid() or coalesce(auth.role(), '') = 'service_role')
    and exists (
      select 1
      from public.event_sessions s
      join public.events e on e.id = s.event_id
      join public.profiles pr on pr.id = p_user_id and not pr.is_suspended
      where s.id = p_session_id
        and e.status = 'published'
        and now() <= e.ends_at + interval '6 hours'
        and (
          exists (
            select 1 from public.event_staff st
            where st.event_id = e.id and st.user_id = p_user_id and st.expires_at > now()
              and (st.session_ids is null or s.id = any (st.session_ids))
          )
          or exists (
            select 1 from public.organization_members m
            where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
          )
          or exists (select 1 from public.session_managers sm where sm.session_id = s.id and sm.user_id = p_user_id)
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.event_sessions enable row level security;
alter table public.ticket_type_sessions enable row level security;
alter table public.session_checkins enable row level security;
alter table public.session_managers enable row level security;
alter table public.team_registrations enable row level security;

-- Sessions are public like ticket types (events RLS hides drafts)
create policy event_sessions_read on public.event_sessions
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy ticket_type_sessions_read on public.ticket_type_sessions
  for select to anon, authenticated
  using (exists (select 1 from public.ticket_types tt where tt.id = ticket_type_id));
create policy session_checkins_read on public.session_checkins
  for select to authenticated
  using (public.can_manage_session(session_id) or public.can_scan_session(session_id) or public.is_admin());
create policy session_managers_read on public.session_managers
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_session(session_id) or public.is_admin());
create policy team_registrations_read on public.team_registrations
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_session(session_id) or public.is_admin());

grant all on public.event_sessions, public.ticket_type_sessions, public.session_checkins, public.session_managers,
  public.team_registrations to service_role;
grant select on public.event_sessions, public.ticket_type_sessions to anon, authenticated;
grant select on public.session_checkins, public.session_managers, public.team_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- Questions (FES-09)
-- [{"id": "q1", "label": "T-shirt size", "type": "select", "options": ["S","M","L"], "required": true}]
-- ---------------------------------------------------------------------------
create or replace function public.clean_questions(p_questions jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_q jsonb;
  v_out jsonb := '[]'::jsonb;
  v_type text;
  v_label text;
  v_options jsonb;
  i int := 0;
begin
  if p_questions is null then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) > 10 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add at most 10 questions.';
  end if;
  for v_q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    v_label := btrim(coalesce(v_q ->> 'label', ''));
    v_type := coalesce(v_q ->> 'type', 'text');
    if char_length(v_label) not between 1 and 200 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each question needs a text (up to 200 characters).';
    end if;
    if v_type not in ('text', 'long_text', 'number', 'select', 'yes_no') then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Unknown question type.';
    end if;
    v_options := '[]'::jsonb;
    if v_type = 'select' then
      select coalesce(jsonb_agg(btrim(o)), '[]'::jsonb) into v_options
      from jsonb_array_elements_text(coalesce(v_q -> 'options', '[]'::jsonb)) o
      where char_length(btrim(o)) between 1 and 80;
      if jsonb_array_length(v_options) not between 2 and 20 then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('Give "%s" 2 to 20 choices.', v_label);
      end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', 'q' || i, 'label', v_label, 'type', v_type, 'options', v_options,
      'required', coalesce((v_q ->> 'required')::boolean, false)
    ));
  end loop;
  return v_out;
end;
$$;

-- Check answers against questions; returns only the known answers, trimmed.
create or replace function public.validate_answers(p_questions jsonb, p_answers jsonb, p_context text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_q jsonb;
  v_val text;
  v_out jsonb := '{}'::jsonb;
  v_answers jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
begin
  for v_q in select * from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_val := btrim(coalesce(v_answers ->> (v_q ->> 'id'), ''));
    if v_val = '' then
      if coalesce((v_q ->> 'required')::boolean, false) then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: please answer "%s".', p_context, v_q ->> 'label');
      end if;
      continue;
    end if;
    case v_q ->> 'type'
      when 'number' then
        if v_val !~ '^-?\d{1,12}(\.\d{1,4})?$' then
          raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" must be a number.', p_context, v_q ->> 'label');
        end if;
      when 'select' then
        if not (coalesce(v_q -> 'options', '[]'::jsonb) ? v_val) then
          raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: choose one of the options for "%s".', p_context, v_q ->> 'label');
        end if;
      when 'yes_no' then
        if v_val not in ('yes', 'no') then
          raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: answer yes or no to "%s".', p_context, v_q ->> 'label');
        end if;
      when 'long_text' then
        v_val := left(v_val, 1000);
      else
        v_val := left(v_val, 200);
    end case;
    v_out := v_out || jsonb_build_object(v_q ->> 'id', v_val);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessions: create / edit / delete (FES-01, FES-08)
-- p_data: name, kind, description, venue, starts_at, ends_at, capacity, pass_access,
--   questions, team_min, team_max, fee_mode, fee_paisa, needs_approval,
--   registration_ends_at (competitions)
-- ---------------------------------------------------------------------------
create or replace function public.save_session(p_event_id uuid, p_session_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_old public.event_sessions;
  v_id uuid;
  v_name text := btrim(coalesce(p_data ->> 'name', ''));
  v_kind text := coalesce(p_data ->> 'kind', 'other');
  v_starts timestamptz := (p_data ->> 'starts_at')::timestamptz;
  v_ends timestamptz := (p_data ->> 'ends_at')::timestamptz;
  v_capacity int := nullif(p_data ->> 'capacity', '')::int;
  v_pass boolean := coalesce((p_data ->> 'pass_access')::boolean, true);
  v_questions jsonb := public.clean_questions(p_data -> 'questions');
  v_team_min int := coalesce(nullif(p_data ->> 'team_min', '')::int, 1);
  v_team_max int := coalesce(nullif(p_data ->> 'team_max', '')::int, 1);
  v_fee_mode text := coalesce(p_data ->> 'fee_mode', 'per_team');
  v_fee bigint := coalesce(nullif(p_data ->> 'fee_paisa', '')::bigint, 0);
  v_reg_ends timestamptz := nullif(p_data ->> 'registration_ends_at', '')::timestamptz;
  v_type public.ticket_types;
  v_qty int;
  v_sort int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change the schedule.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give the session a name (up to 120 characters).';
  end if;
  if v_kind not in ('workshop', 'competition', 'concert', 'talk', 'other') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose what kind of session this is.';
  end if;
  if v_starts is null or v_ends is null or v_ends <= v_starts then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'The session must end after it starts.';
  end if;
  if v_starts < v_event.starts_at or v_ends > v_event.ends_at then
    raise exception using message = 'TL:INVALID_ITEMS',
      detail = 'Sessions must be within the event''s dates. Change the event start/end on Edit & tickets first.';
  end if;
  if v_capacity is not null and v_capacity not between 1 and 100000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Seats must be between 1 and 100000 (or empty for no limit).';
  end if;
  if v_kind = 'competition' then
    v_pass := false;
    if v_team_min not between 1 and 20 or v_team_max not between v_team_min and 20 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Team size: 1 to 20 people, and the maximum must be at least the minimum.';
    end if;
    if v_fee_mode not in ('per_team', 'per_member') then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose a fee per team or per member.';
    end if;
    if v_fee < 0 or v_fee > 100000000 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid entry fee.';
    end if;
    if v_capacity is null then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Set how many teams can take part.';
    end if;
    if v_reg_ends is not null and v_reg_ends > v_starts then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Registration must close before the competition starts.';
    end if;
  else
    v_team_min := 1;
    v_team_max := 1;
    v_fee_mode := 'per_team';
  end if;

  if p_session_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_sort from public.event_sessions where event_id = p_event_id;
    insert into public.event_sessions (
      event_id, name, kind, description, venue, starts_at, ends_at, capacity, pass_access, sort_order, questions,
      team_min, team_max, fee_mode, needs_approval, created_by
    )
    values (
      p_event_id, v_name, v_kind, nullif(left(btrim(coalesce(p_data ->> 'description', '')), 2000), ''),
      nullif(left(btrim(coalesce(p_data ->> 'venue', '')), 200), ''), v_starts, v_ends, v_capacity, v_pass, v_sort, v_questions,
      v_team_min, v_team_max, v_fee_mode, coalesce((p_data ->> 'needs_approval')::boolean, false), auth.uid()
    )
    returning id into v_id;
  else
    select * into v_old from public.event_sessions where id = p_session_id and event_id = p_event_id for update;
    if not found then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
    end if;
    if v_old.kind = 'competition' and v_kind <> 'competition'
       and exists (select 1 from public.team_registrations r where r.session_id = p_session_id) then
      raise exception using message = 'TL:INVALID_STATE', detail = 'Teams have already registered, so this stays a competition.';
    end if;
    if v_old.kind <> 'competition' and v_kind = 'competition'
       and exists (select 1 from public.ticket_type_sessions x where x.session_id = p_session_id) then
      raise exception using message = 'TL:INVALID_STATE', detail = 'Ticket types already open this session. Make a new session for the competition.';
    end if;
    update public.event_sessions set
      name = v_name, kind = v_kind,
      description = nullif(left(btrim(coalesce(p_data ->> 'description', '')), 2000), ''),
      venue = nullif(left(btrim(coalesce(p_data ->> 'venue', '')), 200), ''),
      starts_at = v_starts, ends_at = v_ends, capacity = v_capacity, pass_access = v_pass, questions = v_questions,
      team_min = v_team_min, team_max = v_team_max, fee_mode = v_fee_mode,
      needs_approval = coalesce((p_data ->> 'needs_approval')::boolean, false)
    where id = p_session_id
    returning id into v_id;
  end if;

  -- Competitions: the entry-fee ticket type is made and kept in step here
  select * into v_type from public.ticket_types where registration_session_id = v_id;
  if v_kind = 'competition' then
    v_qty := v_capacity * case when v_fee_mode = 'per_member' then v_team_max else 1 end;
    if v_type.id is null then
      insert into public.ticket_types (
        event_id, name, description, price_paisa, quantity, sale_ends_at, sort_order, all_sessions, registration_session_id
      )
      values (
        p_event_id, left(v_name || ' – ' || case when v_fee_mode = 'per_member' then 'entry per member' else 'team entry' end, 80),
        'Competition registration', v_fee::int, v_qty, v_reg_ends, 1000, false, v_id
      )
      returning * into v_type;
      insert into public.ticket_type_sessions (ticket_type_id, session_id) values (v_type.id, v_id);
    else
      update public.ticket_types set
        name = left(v_name || ' – ' || case when v_fee_mode = 'per_member' then 'entry per member' else 'team entry' end, 80),
        price_paisa = v_fee::int, quantity = greatest(v_qty, public.ticket_type_taken(v_type.id)), sale_ends_at = v_reg_ends
      where id = v_type.id;
    end if;
  elsif v_type.id is not null then
    delete from public.ticket_types where id = v_type.id; -- guard refuses if it has bookings
  end if;

  perform public.audit(case when p_session_id is null then 'session.create' else 'session.update' end, 'event', p_event_id::text,
    jsonb_build_object('session_id', v_id, 'name', v_name, 'kind', v_kind));
  return v_id;
end;
$$;

create or replace function public.delete_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions;
begin
  select * into v_session from public.event_sessions where id = p_session_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.is_event_staff(v_session.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can change the schedule.';
  end if;
  if exists (select 1 from public.team_registrations r where r.session_id = p_session_id)
     or exists (select 1 from public.session_checkins c where c.session_id = p_session_id) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This session already has registrations or check-ins and cannot be deleted.';
  end if;
  if exists (
    select 1 from public.ticket_type_sessions x
    join public.order_items oi on oi.ticket_type_id = x.ticket_type_id
    join public.orders o on o.id = oi.order_id
    where x.session_id = p_session_id and o.status <> 'expired'
      and not exists (select 1 from public.ticket_type_sessions y where y.ticket_type_id = x.ticket_type_id and y.session_id <> p_session_id)
  ) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Tickets for only this session are already booked. It cannot be deleted.';
  end if;
  delete from public.ticket_types where registration_session_id = p_session_id;
  delete from public.event_sessions where id = p_session_id;
  perform public.audit('session.delete', 'event', v_session.event_id::text, jsonb_build_object('name', v_session.name));
end;
$$;

-- What a ticket type opens (FES-02). Booked types can only get MORE access.
create or replace function public.set_ticket_type_access(p_ticket_type_id uuid, p_all boolean, p_session_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.ticket_types;
  v_booked boolean;
  v_new uuid[] := coalesce(p_session_ids, '{}');
begin
  select * into v_type from public.ticket_types where id = p_ticket_type_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Ticket type not found.';
  end if;
  if not public.is_event_staff(v_type.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can change ticket types.';
  end if;
  if v_type.registration_session_id is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This is a competition entry – change it in the schedule.';
  end if;
  if exists (
    select 1 from unnest(v_new) x(id)
    where not exists (
      select 1 from public.event_sessions s where s.id = x.id and s.event_id = v_type.event_id and s.kind <> 'competition'
    )
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose sessions of this event (competitions use team registration).';
  end if;
  if not coalesce(p_all, false) and cardinality(v_new) = 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose at least one session, or make it a pass.';
  end if;

  v_booked := exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.ticket_type_id = p_ticket_type_id and o.status <> 'expired'
  ) or exists (select 1 from public.tickets t where t.ticket_type_id = p_ticket_type_id and t.source = 'printed');
  if v_booked then
    if v_type.all_sessions and not coalesce(p_all, false) then
      raise exception using message = 'TL:ACCESS_LOCKED', detail = 'Tickets are already sold as a pass – it cannot become a session ticket.';
    end if;
    if not v_type.all_sessions and not coalesce(p_all, false) and exists (
      select 1 from public.ticket_type_sessions x where x.ticket_type_id = p_ticket_type_id and not (x.session_id = any (v_new))
    ) then
      raise exception using message = 'TL:ACCESS_LOCKED', detail = 'Tickets are already sold – you can add sessions but not take them away.';
    end if;
  end if;

  update public.ticket_types set all_sessions = coalesce(p_all, false) where id = p_ticket_type_id;
  delete from public.ticket_type_sessions where ticket_type_id = p_ticket_type_id;
  if not coalesce(p_all, false) then
    insert into public.ticket_type_sessions (ticket_type_id, session_id)
    select p_ticket_type_id, x from unnest(v_new) x group by x;
  end if;
end;
$$;

-- Duplicate an event: copy sessions (same offset from the start) and access (FES-01)
create or replace function public.duplicate_event_sessions(p_from_event uuid, p_to_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.events;
  v_to public.events;
  v_shift interval;
  v_count int := 0;
  v_map jsonb := '{}'::jsonb;  -- old session id → new session id
  r record;
  v_new_id uuid;
begin
  select * into v_from from public.events where id = p_from_event;
  select * into v_to from public.events where id = p_to_event;
  if v_from.id is null or v_to.id is null or v_from.org_id <> v_to.org_id or not public.is_org_staff(v_to.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  v_shift := v_to.starts_at - v_from.starts_at;
  for r in select * from public.event_sessions where event_id = p_from_event order by sort_order loop
    insert into public.event_sessions (
      event_id, name, kind, description, venue, starts_at, ends_at, capacity, pass_access, sort_order, questions,
      team_min, team_max, fee_mode, needs_approval, created_by
    )
    values (
      p_to_event, r.name, r.kind, r.description, r.venue, r.starts_at + v_shift, r.ends_at + v_shift, r.capacity,
      r.pass_access, r.sort_order, r.questions, r.team_min, r.team_max, r.fee_mode, r.needs_approval, auth.uid()
    )
    returning id into v_new_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_new_id::text);
    v_count := v_count + 1;
  end loop;

  -- ticket types were copied with the same name + sort order
  update public.ticket_types nt set
    all_sessions = ot.all_sessions,
    registration_session_id = (v_map ->> (ot.registration_session_id::text))::uuid
  from public.ticket_types ot
  where nt.event_id = p_to_event and ot.event_id = p_from_event and nt.name = ot.name and nt.sort_order = ot.sort_order;

  insert into public.ticket_type_sessions (ticket_type_id, session_id)
  select nt.id, (v_map ->> (x.session_id::text))::uuid
  from public.ticket_type_sessions x
  join public.ticket_types ot on ot.id = x.ticket_type_id and ot.event_id = p_from_event
  join public.ticket_types nt on nt.event_id = p_to_event and nt.name = ot.name and nt.sort_order = ot.sort_order
  where v_map ? (x.session_id::text)
  on conflict do nothing;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order: session seats, session answers, competition registrations
-- (PAY-01, PAY-02, PAY-12, AUTH-06, rules 1-3, AMB-04/07/12, FES-03, FES-09, FES-10)
-- p_answers: {"<session_id>": {"q1": "M"}} for sessions with questions opened by
-- session tickets in this order. p_registration_id: pay for an approved team
-- registration (items are then made from the registration).
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, jsonb, text, text, text, text);

create or replace function public.create_order(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null,
  p_code text default null,
  p_ref text default null,
  p_answers jsonb default null,
  p_registration_id uuid default null
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
  v_q record;
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
    if public.session_teams_taken(v_session.id) >= coalesce(v_session.capacity, 0) then
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
    -- rule 3: no end date → booking closes when the event starts (competitions: when they start)
    v_sale_end := coalesce(v_type.sale_ends_at, case when p_registration_id is not null then v_session.starts_at else v_event.starts_at end);
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

  -- FES-09: answers for sessions with questions opened by session tickets (not passes)
  if p_registration_id is null then
    for v_q in
      select s.id, s.name, s.questions
      from public.event_sessions s
      where s.event_id = p_event_id and s.kind <> 'competition' and jsonb_array_length(s.questions) > 0
        and exists (
          select 1 from jsonb_array_elements(v_items) e
          join public.ticket_type_sessions x on x.ticket_type_id = (e ->> 'ticket_type_id')::uuid and x.session_id = s.id
        )
      order by s.starts_at
    loop
      v_answers := v_answers || jsonb_build_object(
        v_q.id::text, public.validate_answers(v_q.questions, coalesce(p_answers, '{}'::jsonb) -> (v_q.id::text), v_q.name)
      );
    end loop;
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
    seller_id, referral_source, promo_code_id, discount_paisa, answers
  )
  values (
    v_ref, p_event_id, v_uid, v_status, v_total, v_total_qty, v_requires_card,
    case when v_status = 'awaiting_payment' then now() + interval '60 minutes' end,
    v_profile.full_name, v_profile.email, v_profile.phone,
    case when v_status = 'approved' then now() end,
    case when v_status = 'approved' then now() end,
    v_seller.id, v_source, v_promo_id, v_discount, v_answers
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

-- Ticket issuing: team tickets carry the team name / member names (FES-10). Idempotent.
create or replace function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_reg public.team_registrations;
  v_mode text;
  v_item record;
  v_count int := 0;
  v_name text;
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
    select s.fee_mode into v_mode from public.event_sessions s where s.id = v_reg.session_id;
  end if;

  for v_item in
    select oi.ticket_type_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id
  loop
    for i in 1..v_item.quantity loop
      v_name := case
        when v_reg.id is null then v_order.buyer_name
        when v_mode = 'per_member' then coalesce(nullif(btrim(v_reg.members -> (i - 1) ->> 'name'), ''), v_reg.team_name)
        else 'Team ' || v_reg.team_name
      end;
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, code)
      values (p_order_id, v_order.event_id, v_item.ticket_type_id, v_order.user_id, left(v_name, 120),
              public.generate_ticket_code());
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Main entry check-in: once per ticket (entry_at); a ticket already scanned at
-- a session can still go through the main gate once (FES-06, extends D-042)
-- ---------------------------------------------------------------------------
create or replace function public.perform_check_in(
  p_ticket_id uuid,
  p_event_id uuid,
  p_actor uuid,
  p_method public.checkin_method,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device text := left(p_device, 200);
  v_ticket_id uuid;
  v_ticket_event uuid;
  v_status public.ticket_status;
  v_sale text;
  v_require_sale boolean;
  v_holder text;
  v_code text;
  v_type_name text;
  v_requires_card boolean;
  v_checked_at timestamptz;
  v_entry_at timestamptz;
  v_serial text;
  v_gate_sold boolean;
  v_sale_price integer;
  v_result public.checkin_result;
begin
  if not public.can_scan_event(p_event_id, p_actor) then
    insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
    values (p_event_id, null, p_actor, p_method, 'not_allowed', v_device);
    return jsonb_build_object('result', 'not_allowed');
  end if;

  with updated as (
    update public.tickets t
    set status = 'checked_in', checked_in_at = coalesce(t.checked_in_at, now()), entry_at = now(),
        checked_in_by = p_actor, checkin_method = p_method,
        sale_status = case when t.sale_status = 'in_stock' then 'sold' else t.sale_status end,
        sale_source = case when t.sale_status = 'in_stock' then 'scan' else t.sale_source end,
        sold_at = case when t.sale_status = 'in_stock' then now() else t.sold_at end,
        sale_price_paisa = case
          when t.sale_status = 'in_stock' then (select tt.price_paisa from public.ticket_types tt where tt.id = t.ticket_type_id)
          else t.sale_price_paisa end
    where t.id = p_ticket_id and t.event_id = p_event_id and t.status in ('valid', 'checked_in') and t.entry_at is null
      and not (t.sale_status = 'in_stock'
               and exists (select 1 from public.print_batches pb where pb.id = t.batch_id and pb.require_sale))
    returning t.id, t.holder_name, t.code, t.ticket_type_id, t.entry_at, t.batch_id, t.serial_no,
              (t.sale_source = 'scan' and t.sold_at = now()) as gate_sold, t.sale_price_paisa
  )
  select u.id, u.holder_name, u.code, tt.name, tt.requires_student_card, u.entry_at,
         public.print_serial_label(pb.prefix, u.serial_no), coalesce(u.gate_sold, false), u.sale_price_paisa
  into v_ticket_id, v_holder, v_code, v_type_name, v_requires_card, v_checked_at, v_serial, v_gate_sold, v_sale_price
  from updated u
  join public.ticket_types tt on tt.id = u.ticket_type_id
  left join public.print_batches pb on pb.id = u.batch_id;

  if v_ticket_id is not null then
    insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
    values (p_event_id, v_ticket_id, p_actor, p_method, 'ok', v_device);
    return jsonb_build_object(
      'result', 'ok',
      'ticket_id', v_ticket_id,
      'holder_name', v_holder,
      'ticket_code', v_code,
      'ticket_type', v_type_name,
      'requires_student_card', v_requires_card,
      'checked_in_at', v_checked_at,
      'serial', v_serial,
      'gate_sold', v_gate_sold,
      'sale_price_paisa', case when v_gate_sold then v_sale_price end
    );
  end if;

  -- Not checked in: find out why
  select t.id, t.event_id, t.status, t.sale_status, coalesce(pb.require_sale, false), t.holder_name, t.code, tt.name,
         tt.requires_student_card, t.entry_at, public.print_serial_label(pb.prefix, t.serial_no)
  into v_ticket_id, v_ticket_event, v_status, v_sale, v_require_sale, v_holder, v_code, v_type_name,
       v_requires_card, v_entry_at, v_serial
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.print_batches pb on pb.id = t.batch_id
  where t.id = p_ticket_id;

  if v_ticket_id is null then
    v_result := 'not_found';
  elsif v_ticket_event <> p_event_id then
    v_result := 'wrong_event';
  elsif v_status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_entry_at is not null then
    v_result := 'already_used';
  elsif v_sale = 'in_stock' and v_require_sale then
    v_result := 'not_sold';
  else
    v_result := 'invalid';
  end if;

  insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
  values (p_event_id, v_ticket_id, p_actor, p_method, v_result, v_device);

  if v_result = 'already_used' then
    return jsonb_build_object(
      'result', v_result, 'ticket_id', v_ticket_id, 'holder_name', v_holder,
      'ticket_type', v_type_name, 'checked_in_at', v_entry_at, 'serial', v_serial
    );
  end if;
  if v_result in ('cancelled', 'not_sold') then
    return jsonb_build_object('result', v_result, 'serial', v_serial, 'returned', v_sale = 'returned');
  end if;
  return jsonb_build_object('result', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- Session check-in (FES-06, FES-07): once per ticket per session. Internal –
-- called by the web server (after verifying the signed QR) with the service role,
-- or through manual_session_check_in.
-- ---------------------------------------------------------------------------
create or replace function public.session_check_in(
  p_ticket_id uuid,
  p_session_id uuid,
  p_actor uuid,
  p_method public.checkin_method,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device text := left(p_device, 200);
  v_session public.event_sessions;
  v_ticket public.tickets;
  v_type public.ticket_types;
  v_require_sale boolean;
  v_serial text;
  v_at timestamptz;
  v_gate_sold boolean := false;
  v_result public.checkin_result;
begin
  select * into v_session from public.event_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not public.can_scan_session(p_session_id, p_actor) then
    insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device, session_id)
    values (v_session.event_id, null, p_actor, p_method, 'not_allowed', v_device, p_session_id);
    return jsonb_build_object('result', 'not_allowed');
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if found then
    select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
    select coalesce(pb.require_sale, false), public.print_serial_label(pb.prefix, v_ticket.serial_no)
    into v_require_sale, v_serial
    from public.print_batches pb where pb.id = v_ticket.batch_id;
  end if;

  if v_ticket.id is null then
    v_result := 'not_found';
  elsif v_ticket.event_id <> v_session.event_id then
    v_result := 'wrong_event';
  elsif v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_ticket.sale_status = 'in_stock' and coalesce(v_require_sale, false) then
    v_result := 'not_sold';
  elsif not public.session_grants(v_ticket.ticket_type_id, p_session_id) then
    v_result := 'wrong_session';
  end if;

  if v_result is null then
    insert into public.session_checkins (session_id, ticket_id, checked_in_by, method)
    values (p_session_id, p_ticket_id, p_actor, p_method)
    on conflict (session_id, ticket_id) do nothing
    returning checked_in_at into v_at;
    if v_at is null then
      select c.checked_in_at into v_at from public.session_checkins c where c.session_id = p_session_id and c.ticket_id = p_ticket_id;
      v_result := 'already_used';
    else
      v_result := 'ok';
      v_gate_sold := v_ticket.sale_status = 'in_stock';
      update public.tickets t set
        status = 'checked_in',
        checked_in_at = coalesce(t.checked_in_at, now()),
        checked_in_by = coalesce(t.checked_in_by, p_actor),
        checkin_method = coalesce(t.checkin_method, p_method),
        sale_status = case when t.sale_status = 'in_stock' then 'sold' else t.sale_status end,
        sale_source = case when t.sale_status = 'in_stock' then 'scan' else t.sale_source end,
        sold_at = case when t.sale_status = 'in_stock' then now() else t.sold_at end,
        sale_price_paisa = case when t.sale_status = 'in_stock' then v_type.price_paisa else t.sale_price_paisa end
      where t.id = p_ticket_id;
    end if;
  end if;

  insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device, session_id)
  values (v_session.event_id, v_ticket.id, p_actor, p_method, v_result, v_device, p_session_id);

  if v_result in ('ok', 'already_used', 'wrong_session') then
    return jsonb_build_object(
      'result', v_result,
      'ticket_id', v_ticket.id,
      'holder_name', v_ticket.holder_name,
      'ticket_code', v_ticket.code,
      'ticket_type', v_type.name,
      'requires_student_card', v_type.requires_student_card,
      'checked_in_at', v_at,
      'serial', v_serial,
      'session', v_session.name,
      'gate_sold', v_gate_sold,
      'sale_price_paisa', case when v_gate_sold then v_type.price_paisa end
    );
  end if;
  if v_result in ('cancelled', 'not_sold') then
    return jsonb_build_object('result', v_result, 'serial', v_serial, 'returned', v_ticket.sale_status = 'returned');
  end if;
  return jsonb_build_object('result', v_result);
end;
$$;

create or replace function public.manual_session_check_in(p_ticket_id uuid, p_session_id uuid, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  return public.session_check_in(p_ticket_id, p_session_id, auth.uid(), 'manual', coalesce(p_device, 'manual'));
end;
$$;

-- Scanner: the sessions I can scan for this event + can I scan main entry?
create or replace function public.my_scan_sessions(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event_entry', public.can_scan_event(p_event_id, auth.uid()),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'kind', s.kind, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
        'venue', s.venue, 'capacity', s.capacity
      ) order by s.starts_at, s.sort_order)
      from public.event_sessions s
      where s.event_id = p_event_id and public.can_scan_session(s.id, auth.uid())
    ), '[]'::jsonb)
  );
$$;

-- Events I can scan (main entry or at least one session) – return type changes
drop function public.my_scan_events();

create or replace function public.my_scan_events()
returns table (
  event_id uuid, event_name text, event_slug text, org_name text, org_slug text, venue text,
  starts_at timestamptz, ends_at timestamptz, access text, sessions_only boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.slug, o.name, o.slug, e.venue, e.starts_at, e.ends_at,
         case when public.is_org_staff(e.org_id) then 'organizer' else 'scanner' end,
         not public.can_scan_event(e.id, auth.uid())
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.status = 'published' and now() <= e.ends_at + interval '6 hours'
    and (
      public.can_scan_event(e.id, auth.uid())
      or exists (select 1 from public.event_sessions s where s.event_id = e.id and public.can_scan_session(s.id, auth.uid()))
    )
  order by e.starts_at;
$$;

-- Session list for scanners (manual check-in / lookup) – no phone or email
create or replace function public.scanner_session_attendees(p_session_id uuid)
returns table (
  ticket_id uuid, code text, holder_name text, ticket_type text, requires_student_card boolean,
  status public.ticket_status, checked_in_at timestamptz, serial text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.can_scan_session(p_session_id, auth.uid()) or public.can_manage_session(p_session_id, auth.uid())) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'You cannot scan this session.';
  end if;
  return query
    select t.id, t.code, t.holder_name, tt.name, tt.requires_student_card, t.status, c.checked_in_at,
           public.print_serial_label(pb.prefix, t.serial_no)
    from public.event_sessions s
    join public.tickets t on t.event_id = s.event_id
    join public.ticket_types tt on tt.id = t.ticket_type_id
    left join public.print_batches pb on pb.id = t.batch_id
    left join public.session_checkins c on c.session_id = s.id and c.ticket_id = t.id
    where s.id = p_session_id and t.status <> 'cancelled' and public.session_grants(t.ticket_type_id, s.id)
      and not (t.source = 'printed' and t.sale_status = 'returned')
    order by t.holder_name, t.code;
end;
$$;

-- Organizer: limit a scanner to some sessions (null/empty = whole event)
create or replace function public.set_scanner_sessions(p_event_id uuid, p_user_id uuid, p_session_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_event_staff(p_event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can change scanners.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_session_ids, '{}')) x(id)
    where not exists (select 1 from public.event_sessions s where s.id = x.id and s.event_id = p_event_id)
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose sessions of this event.';
  end if;
  update public.event_staff
  set session_ids = case when coalesce(cardinality(p_session_ids), 0) = 0 then null else p_session_ids end
  where event_id = p_event_id and user_id = p_user_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Add this person as a scanner first.';
  end if;
end;
$$;

-- Session managers (FES-12): any member of the society team
create or replace function public.add_session_manager(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions;
begin
  select * into v_session from public.event_sessions where id = p_session_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.is_event_staff(v_session.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can choose session managers.';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.org_id = public.event_org_id(v_session.event_id) and m.user_id = p_user_id
  ) then
    raise exception using message = 'TL:NOT_A_MEMBER', detail = 'Invite this person to your team first.';
  end if;
  insert into public.session_managers (session_id, user_id, assigned_by)
  values (p_session_id, p_user_id, auth.uid())
  on conflict do nothing;
  perform public.audit('session.manager_add', 'event', v_session.event_id::text, jsonb_build_object('session_id', p_session_id, 'user_id', p_user_id));
end;
$$;

create or replace function public.remove_session_manager(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions;
begin
  select * into v_session from public.event_sessions where id = p_session_id;
  if not found or not public.is_event_staff(v_session.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can choose session managers.';
  end if;
  delete from public.session_managers where session_id = p_session_id and user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Competitions: team registration (FES-10, FES-11)
-- p_members: [{"name": "...", "phone": "...", "email": "...", "roll_no": "...", "university": "..."}]
-- (first member = the person registering)
-- ---------------------------------------------------------------------------
create or replace function public.clean_members(p_members jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_m jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add your team members.';
  end if;
  for v_m in select * from jsonb_array_elements(p_members) loop
    v_name := btrim(coalesce(v_m ->> 'name', ''));
    if char_length(v_name) not between 2 and 80 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Every team member needs a name.';
    end if;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'phone', nullif(left(btrim(coalesce(v_m ->> 'phone', '')), 20), ''),
      'email', nullif(left(lower(btrim(coalesce(v_m ->> 'email', ''))), 120), ''),
      'roll_no', nullif(left(btrim(coalesce(v_m ->> 'roll_no', '')), 40), ''),
      'university', nullif(left(btrim(coalesce(v_m ->> 'university', '')), 120), '')
    )));
  end loop;
  return v_out;
end;
$$;

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
  v_members jsonb := public.clean_members(p_members);
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
  if exists (
    select 1 from public.team_registrations r
    where r.session_id = p_session_id and lower(r.team_name) = lower(v_team) and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Another team already uses this name.';
  end if;
  if not v_session.needs_approval and public.session_teams_taken(p_session_id) >= coalesce(v_session.capacity, 0) then
    raise exception using message = 'TL:SOLD_OUT', detail = format('"%s" is full – no team places left.', v_session.name);
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

-- After the organizer accepts (or after an unpaid order expired): pay now
create or replace function public.pay_team_registration(p_registration_id uuid, p_code text default null, p_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
begin
  select * into v_reg from public.team_registrations where id = p_registration_id;
  if not found or v_reg.user_id <> auth.uid() then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
  end if;
  return public.create_order(v_reg.event_id, null, null, null, p_code, p_ref, null, p_registration_id);
end;
$$;

create or replace function public.withdraw_team_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
begin
  select * into v_reg from public.team_registrations where id = p_registration_id for update;
  if not found or v_reg.user_id <> auth.uid() then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
  end if;
  if v_reg.status not in ('pending', 'approved') then
    return;
  end if;
  if v_reg.order_id is not null and exists (
    select 1 from public.orders o where o.id = v_reg.order_id and o.status in ('approved', 'under_review')
  ) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'You have already paid or sent a payment. Contact the organizer.';
  end if;
  update public.orders set status = 'expired' where id = v_reg.order_id and status = 'awaiting_payment';
  update public.team_registrations set status = 'withdrawn' where id = p_registration_id;
end;
$$;

-- Shortlisting (FES-11): accept → the team can pay; decline with a reason
create or replace function public.decide_team_registration(p_registration_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
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
    update public.team_registrations set status = 'approved', decided_by = auth.uid(), decided_at = now(), reject_reason = null
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

-- Results (FES-13): [{"place": 1, "label": "Winner", "name": "Team Alpha", "registration_id": "..."}]
create or replace function public.save_session_results(p_session_id uuid, p_results jsonb, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions;
  v_out jsonb;
  v_bad int;
begin
  select * into v_session from public.event_sessions where id = p_session_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.can_manage_session(p_session_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the organizers or managers of this session can do that.';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) > 10 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add up to 10 results.';
  end if;
  select count(*) into v_bad from jsonb_array_elements(p_results) r
  where char_length(btrim(coalesce(r ->> 'name', ''))) not between 1 and 120
     or char_length(btrim(coalesce(r ->> 'label', ''))) > 40
     or (r ->> 'registration_id' is not null and not exists (
       select 1 from public.team_registrations t where t.id::text = r ->> 'registration_id' and t.session_id = p_session_id
     ));
  if v_bad > 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each result needs a name (and teams must be from this competition).';
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'place', ord::int,
    'label', coalesce(nullif(btrim(r ->> 'label'), ''), case ord when 1 then '1st' when 2 then '2nd' when 3 then '3rd' else ord || 'th' end),
    'name', btrim(r ->> 'name'),
    'registration_id', r ->> 'registration_id'
  )) order by ord), '[]'::jsonb)
  into v_out
  from jsonb_array_elements(p_results) with ordinality x(r, ord);
  update public.event_sessions set results = v_out, results_published = coalesce(p_publish, false) where id = p_session_id;
  perform public.audit('session.results', 'event', v_session.event_id::text,
    jsonb_build_object('session_id', p_session_id, 'published', coalesce(p_publish, false)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading: public schedule, organizer/manager lists, buyer's teams
-- ---------------------------------------------------------------------------
create or replace function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

-- Organizer dashboard: per session (FES-14)
create or replace function public.session_stats(p_event_id uuid)
returns table (
  session_id uuid, name text, kind text, starts_at timestamptz, capacity integer, taken integer,
  tickets integer, checked_in integer, teams_pending integer, teams_paid integer, managers integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_event_staff(p_event_id) or public.is_admin()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  return query
    select s.id, s.name, s.kind, s.starts_at, s.capacity, public.session_taken(s.id),
           (select count(*)::int from public.tickets t
            where t.event_id = s.event_id and t.status in ('valid', 'checked_in') and public.session_grants(t.ticket_type_id, s.id)
              and not (t.source = 'printed' and t.sale_status in ('in_stock', 'returned'))),
           (select count(*)::int from public.session_checkins c where c.session_id = s.id),
           (select count(*)::int from public.team_registrations r where r.session_id = s.id and r.status = 'pending'),
           (select count(*)::int from public.team_registrations r join public.orders o on o.id = r.order_id
            where r.session_id = s.id and r.status = 'approved' and o.status = 'approved'),
           (select count(*)::int from public.session_managers m where m.session_id = s.id)
    from public.event_sessions s
    where s.event_id = p_event_id
    order by s.starts_at, s.sort_order;
end;
$$;

-- Session page for organizers and managers: who has a ticket, answers, check-in
create or replace function public.session_attendees(p_session_id uuid)
returns table (
  ticket_id uuid, code text, holder_name text, ticket_type text, source text, serial text,
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
    select t.id, t.code, t.holder_name, tt.name, t.source, public.print_serial_label(pb.prefix, t.serial_no),
           o.buyer_name, o.buyer_phone, o.buyer_email, o.ref_code, coalesce(o.answers -> (s.id::text), '{}'::jsonb),
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

create or replace function public.session_registrations(p_session_id uuid)
returns table (
  id uuid, team_name text, members jsonb, member_count integer, answers jsonb, status text, reject_reason text,
  created_at timestamptz, decided_at timestamptz, leader_name text, leader_email text, leader_phone text,
  order_id uuid, order_ref text, order_status public.order_status, order_total_paisa bigint, hold_expires_at timestamptz,
  tickets integer, checked_in integer
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
    select r.id, r.team_name, r.members, r.member_count, r.answers, r.status, r.reject_reason, r.created_at, r.decided_at,
           p.full_name, p.email, p.phone, o.id, o.ref_code, o.status, o.total_paisa, o.hold_expires_at,
           (select count(*)::int from public.tickets t where t.order_id = o.id and t.status <> 'cancelled'),
           (select count(*)::int from public.session_checkins c join public.tickets t on t.id = c.ticket_id
            where c.session_id = r.session_id and t.order_id = o.id)
    from public.team_registrations r
    join public.profiles p on p.id = r.user_id
    left join public.orders o on o.id = r.order_id
    where r.session_id = p_session_id
    order by case r.status when 'pending' then 0 when 'approved' then 1 else 2 end, r.created_at;
end;
$$;

-- Buyer: my team registrations
create or replace function public.my_team_registrations()
returns table (
  id uuid, team_name text, member_count integer, status text, reject_reason text, created_at timestamptz,
  session_id uuid, session_name text, session_starts_at timestamptz, needs_approval boolean,
  event_id uuid, event_name text, event_slug text, org_slug text,
  order_id uuid, order_status public.order_status, hold_expires_at timestamptz, fee_paisa integer, fee_mode text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.team_name, r.member_count, r.status, r.reject_reason, r.created_at,
         s.id, s.name, s.starts_at, s.needs_approval, e.id, e.name, e.slug, og.slug,
         o.id, o.status, o.hold_expires_at, rt.price_paisa, s.fee_mode
  from public.team_registrations r
  join public.event_sessions s on s.id = r.session_id
  join public.events e on e.id = r.event_id
  join public.organizations og on og.id = e.org_id
  left join public.orders o on o.id = r.order_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where r.user_id = auth.uid()
  order by s.starts_at desc, r.created_at desc;
$$;

-- Sessions I manage (FES-12) – for the /manage area
create or replace function public.my_managed_sessions()
returns table (
  session_id uuid, session_name text, kind text, starts_at timestamptz, ends_at timestamptz,
  event_id uuid, event_name text, org_name text, org_slug text, event_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.starts_at, s.ends_at, e.id, e.name, o.name, o.slug, e.slug
  from public.session_managers m
  join public.event_sessions s on s.id = m.session_id
  join public.events e on e.id = s.event_id
  join public.organizations o on o.id = e.org_id
  where m.user_id = auth.uid() and e.status <> 'draft' and now() <= e.ends_at + interval '30 days'
  order by s.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- Printed tickets: session seats count, competition entries cannot be printed
-- (PRT-03 extended)
-- ---------------------------------------------------------------------------
create or replace function public.create_print_batch(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_prefix text,
  p_design jsonb,
  p_template_key text default null,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_type public.ticket_types;
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_problem text;
  v_taken int;
  v_remaining int;
  v_first int;
  v_batch_id uuid;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if not public.is_active_user(v_uid) then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can print tickets.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:INVALID_STATE',
      detail = 'Printed tickets can be made once TickLO has approved the event.';
  end if;
  if v_event.ends_at <= now() then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This event has already ended.';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 2000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose between 1 and 2000 tickets per batch.';
  end if;
  if v_prefix !~ '^[A-Z0-9]{1,6}$' then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Serial prefix must be 1–6 letters or numbers (e.g. QWL).';
  end if;
  if v_label is not null and char_length(v_label) > 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Batch name must be 80 characters or fewer.';
  end if;

  v_problem := public.print_design_problem(p_design);
  if v_problem is not null then
    raise exception using message = 'TL:INVALID_DESIGN', detail = v_problem;
  end if;

  select * into v_type from public.ticket_types where id = p_ticket_type_id and event_id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose a ticket type of this event.';
  end if;
  if v_type.registration_session_id is not null then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Competition entries are registered online by teams, not printed.';
  end if;

  v_taken := public.ticket_type_taken(v_type.id);
  v_remaining := greatest(v_type.quantity - v_taken, 0);
  if p_quantity > v_remaining then
    raise exception using message = 'TL:SOLD_OUT',
      detail = format('Only %s "%s" tickets are left. Lower the number or raise the quantity on Edit & tickets.', v_remaining, v_type.name);
  end if;
  perform public.assert_session_capacity(jsonb_build_array(jsonb_build_object('ticket_type_id', v_type.id, 'quantity', p_quantity)));

  perform pg_advisory_xact_lock(hashtextextended('ticklo.print_serial.' || p_event_id::text, 0));
  select coalesce(max(t.serial_no), 0) + 1 into v_first from public.tickets t where t.event_id = p_event_id;

  insert into public.print_batches (event_id, ticket_type_id, label, prefix, first_serial, quantity, template_key, design, created_by)
  values (p_event_id, v_type.id, v_label, v_prefix, v_first, p_quantity, left(p_template_key, 60), p_design, v_uid)
  returning id into v_batch_id;

  insert into public.tickets (event_id, ticket_type_id, holder_name, code, source, batch_id, serial_no)
  select p_event_id, v_type.id, 'Printed ticket', public.generate_ticket_code(), 'printed', v_batch_id, s
  from generate_series(v_first, v_first + p_quantity - 1) s;

  perform public.audit('print_batch.create', 'event', p_event_id::text, jsonb_build_object(
    'batch_id', v_batch_id, 'ticket_type', v_type.name, 'quantity', p_quantity,
    'first', public.print_serial_label(v_prefix, v_first),
    'last', public.print_serial_label(v_prefix, v_first + p_quantity - 1)
  ));

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'first_serial', v_first,
    'last_serial', v_first + p_quantity - 1,
    'quantity', p_quantity
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.ticket_types_session_guard(),
  public.session_grants(uuid, uuid),
  public.session_teams_taken(uuid),
  public.session_taken(uuid),
  public.session_remaining(uuid),
  public.assert_session_capacity(jsonb),
  public.clean_questions(jsonb),
  public.validate_answers(jsonb, jsonb, text),
  public.clean_members(jsonb),
  public.session_check_in(uuid, uuid, uuid, public.checkin_method, text)
from public, anon, authenticated;

grant execute on function
  public.session_grants(uuid, uuid),
  public.session_teams_taken(uuid),
  public.session_taken(uuid),
  public.session_remaining(uuid),
  public.assert_session_capacity(jsonb),
  public.clean_questions(jsonb),
  public.validate_answers(jsonb, jsonb, text),
  public.clean_members(jsonb),
  public.session_check_in(uuid, uuid, uuid, public.checkin_method, text)
to service_role;

revoke execute on function
  public.can_manage_session(uuid, uuid),
  public.can_scan_session(uuid, uuid),
  public.save_session(uuid, uuid, jsonb),
  public.delete_session(uuid),
  public.set_ticket_type_access(uuid, boolean, uuid[]),
  public.duplicate_event_sessions(uuid, uuid),
  public.create_order(uuid, jsonb, text, text, text, text, jsonb, uuid),
  public.manual_session_check_in(uuid, uuid, text),
  public.my_scan_sessions(uuid),
  public.my_scan_events(),
  public.scanner_session_attendees(uuid),
  public.set_scanner_sessions(uuid, uuid, uuid[]),
  public.add_session_manager(uuid, uuid),
  public.remove_session_manager(uuid, uuid),
  public.register_team(uuid, text, jsonb, jsonb, text, text),
  public.pay_team_registration(uuid, text, text),
  public.withdraw_team_registration(uuid),
  public.decide_team_registration(uuid, boolean, text),
  public.save_session_results(uuid, jsonb, boolean),
  public.session_stats(uuid),
  public.session_attendees(uuid),
  public.session_registrations(uuid),
  public.my_team_registrations(),
  public.my_managed_sessions(),
  public.event_schedule(uuid),
  public.create_print_batch(uuid, uuid, integer, text, jsonb, text, text)
from public, anon;

-- Policies call these for logged-out visitors too (session lists are public)
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;

grant execute on function
  public.can_manage_session(uuid, uuid),
  public.can_scan_session(uuid, uuid),
  public.save_session(uuid, uuid, jsonb),
  public.delete_session(uuid),
  public.set_ticket_type_access(uuid, boolean, uuid[]),
  public.duplicate_event_sessions(uuid, uuid),
  public.create_order(uuid, jsonb, text, text, text, text, jsonb, uuid),
  public.manual_session_check_in(uuid, uuid, text),
  public.my_scan_sessions(uuid),
  public.my_scan_events(),
  public.scanner_session_attendees(uuid),
  public.set_scanner_sessions(uuid, uuid, uuid[]),
  public.add_session_manager(uuid, uuid),
  public.remove_session_manager(uuid, uuid),
  public.register_team(uuid, text, jsonb, jsonb, text, text),
  public.pay_team_registration(uuid, text, text),
  public.withdraw_team_registration(uuid),
  public.decide_team_registration(uuid, boolean, text),
  public.save_session_results(uuid, jsonb, boolean),
  public.session_stats(uuid),
  public.session_attendees(uuid),
  public.session_registrations(uuid),
  public.my_team_registrations(),
  public.my_managed_sessions(),
  public.create_print_batch(uuid, uuid, integer, text, jsonb, text, text)
to authenticated, service_role;

-- =============================================================================
-- TickLO – waitlist in line order (D-071)
--
-- When a ticket type or a competition (without shortlisting) is full, people
-- join its waitlist. When a place opens, the next person in line is offered
-- it for 2 hours (the place is held for them only); if they do not book, the
-- next person gets it. Offers are made by waitlist_process(), run by the app
-- right after places open (withdraw, decline, cancel, payment rejected…) and
-- every few minutes by cron (expired holds).
-- =============================================================================

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_type_id uuid references public.ticket_types (id) on delete cascade,
  session_id uuid references public.event_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting',
  offered_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_entries_status check (status in ('waiting', 'offered', 'booked', 'expired', 'left')),
  constraint waitlist_entries_one_target check ((ticket_type_id is null) <> (session_id is null)),
  constraint waitlist_entries_offer check (status <> 'offered' or offer_expires_at is not null)
);
create unique index waitlist_entries_active_idx on public.waitlist_entries (user_id, coalesce(ticket_type_id, session_id))
  where status in ('waiting', 'offered');
create index waitlist_entries_type_idx on public.waitlist_entries (ticket_type_id, status, created_at) where ticket_type_id is not null;
create index waitlist_entries_session_idx on public.waitlist_entries (session_id, status, created_at) where session_id is not null;
create index waitlist_entries_event_idx on public.waitlist_entries (event_id, status);
create trigger waitlist_entries_updated_at before update on public.waitlist_entries
  for each row execute function public.set_updated_at();

alter table public.waitlist_entries enable row level security;
create policy waitlist_entries_read on public.waitlist_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.events e where e.id = event_id and public.is_org_staff(e.org_id))
  );
revoke all on public.waitlist_entries from public, anon, authenticated;
grant select on public.waitlist_entries to authenticated;
grant all on public.waitlist_entries to service_role;

-- ---------------------------------------------------------------------------
-- Offers hold places (counted for everybody except the person offered)
-- ---------------------------------------------------------------------------
create or replace function public.ticket_type_taken(p_ticket_type_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((
      select sum(oi.quantity)
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.ticket_type_id = p_ticket_type_id
        and (
          o.status in ('approved', 'under_review')
          or (o.status = 'awaiting_payment' and o.hold_expires_at > now())
        )
    ), 0)
    + (
      select count(*) from public.tickets t
      where t.ticket_type_id = p_ticket_type_id and t.source = 'printed' and t.status <> 'cancelled'
    )
    -- D-071: places held for people offered a place from the waitlist (not the person asking)
    + (
      select count(*) from public.waitlist_entries w
      where w.ticket_type_id = p_ticket_type_id and w.status = 'offered' and w.offer_expires_at > now()
        and w.user_id is distinct from auth.uid()
    )
  )::int;
$$;

create or replace function public.session_teams_taken_except(p_session_id uuid, p_exclude uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
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
    )
  ) + (
    -- D-071: places held for people offered a place from the waitlist (not the person asking)
    select count(*)::int from public.waitlist_entries w
    where w.session_id = p_session_id and w.status = 'offered' and w.offer_expires_at > now()
      and w.user_id is distinct from auth.uid()
  );
$$;

-- Free places of a ticket type (its own quantity and the seats of the sessions it opens)
create or replace function public.ticket_type_free(p_ticket_type_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(least(
    tt.quantity - public.ticket_type_taken(tt.id),
    coalesce((
      select min(public.session_remaining(s.id))
      from public.event_sessions s
      where s.event_id = tt.event_id and s.capacity is not null and s.kind <> 'competition'
        and public.session_grants(tt.id, s.id)
    ), 2147483647)
  ), 0)
  from public.ticket_types tt
  where tt.id = p_ticket_type_id;
$$;

-- Booking with an offer closes it
create or replace function public.waitlist_close_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.waitlist_entries w
  set status = 'booked'
  from public.orders o
  where o.id = new.order_id and w.user_id = o.user_id and w.ticket_type_id = new.ticket_type_id
    and w.status in ('offered', 'waiting');
  return new;
end;
$$;
create trigger order_items_waitlist after insert on public.order_items
  for each row execute function public.waitlist_close_on_order();

create or replace function public.waitlist_close_on_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.waitlist_entries w
  set status = 'booked'
  where w.user_id = new.user_id and w.session_id = new.session_id and w.status in ('offered', 'waiting');
  return new;
end;
$$;
create trigger team_registrations_waitlist after insert on public.team_registrations
  for each row execute function public.waitlist_close_on_registration();

-- ---------------------------------------------------------------------------
-- Join / leave
-- ---------------------------------------------------------------------------
create or replace function public.join_waitlist(p_ticket_type_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_type public.ticket_types;
  v_session public.event_sessions;
  v_event public.events;
  v_entry public.waitlist_entries;
  v_position int;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to join the waitlist.';
  end if;
  if (p_ticket_type_id is null) = (p_session_id is null) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose a ticket or a competition.';
  end if;
  if p_ticket_type_id is not null then
    select * into v_type from public.ticket_types where id = p_ticket_type_id;
    if not found or v_type.registration_session_id is not null then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Ticket not found.';
    end if;
    select * into v_event from public.events where id = v_type.event_id;
    if now() >= coalesce(v_type.sale_ends_at, public.ticket_type_default_sale_end(v_type.id)) then
      raise exception using message = 'TL:SALE_CLOSED', detail = 'Ticket sale for this has ended.';
    end if;
    if public.ticket_type_free(v_type.id) > 0 then
      raise exception using message = 'TL:NOT_FULL', detail = 'Tickets are still available – book now.';
    end if;
  else
    select * into v_session from public.event_sessions where id = p_session_id;
    if not found or v_session.kind <> 'competition' or v_session.needs_approval then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Competition not found.';
    end if;
    select * into v_event from public.events where id = v_session.event_id;
    if now() >= coalesce((select tt.sale_ends_at from public.ticket_types tt where tt.registration_session_id = v_session.id), v_session.starts_at) then
      raise exception using message = 'TL:SALE_CLOSED', detail = 'Registration has closed.';
    end if;
    if public.session_teams_taken(v_session.id) < coalesce(v_session.capacity, 0) then
      raise exception using message = 'TL:NOT_FULL', detail = 'Places are still free – register now.';
    end if;
  end if;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'This event is not on sale.';
  end if;

  select * into v_entry from public.waitlist_entries w
  where w.user_id = v_uid and coalesce(w.ticket_type_id, w.session_id) = coalesce(p_ticket_type_id, p_session_id) and w.status in ('waiting', 'offered');
  if not found then
    insert into public.waitlist_entries (event_id, ticket_type_id, session_id, user_id)
    values (v_event.id, p_ticket_type_id, p_session_id, v_uid)
    returning * into v_entry;
  end if;
  select count(*) into v_position from public.waitlist_entries w
  where coalesce(w.ticket_type_id, w.session_id) = coalesce(p_ticket_type_id, p_session_id)
    and w.status = 'waiting' and w.created_at <= v_entry.created_at;
  return jsonb_build_object('id', v_entry.id, 'status', v_entry.status, 'position', v_position);
end;
$$;

create or replace function public.leave_waitlist(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.waitlist_entries set status = 'left'
  where id = p_entry_id and user_id = auth.uid() and status in ('waiting', 'offered');
end;
$$;

-- My entries with their place in line
create or replace function public.my_waitlist()
returns table (
  id uuid, status text, line_position integer, offer_expires_at timestamptz, created_at timestamptz,
  ticket_type_id uuid, session_id uuid, target_name text, event_name text, event_slug text, org_slug text, session_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.status,
         (select count(*)::int from public.waitlist_entries x
          where coalesce(x.ticket_type_id, x.session_id) = coalesce(w.ticket_type_id, w.session_id)
            and x.status = 'waiting' and x.created_at <= w.created_at),
         w.offer_expires_at, w.created_at, w.ticket_type_id, w.session_id,
         coalesce(tt.name, s.name), e.name, e.slug, og.slug, s.slug
  from public.waitlist_entries w
  join public.events e on e.id = w.event_id
  join public.organizations og on og.id = e.org_id
  left join public.ticket_types tt on tt.id = w.ticket_type_id
  left join public.event_sessions s on s.id = w.session_id
  where w.user_id = auth.uid() and w.status in ('waiting', 'offered')
  order by w.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Offers: expire old ones, then offer free places to the next people in line.
-- Returns the entries offered now (the app emails them).
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_process()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_free int;
  v_end timestamptz;
  v_id uuid;
begin
  update public.waitlist_entries set status = 'expired' where status = 'offered' and offer_expires_at <= now();

  -- ticket types
  for v_t in
    select distinct w.ticket_type_id as id from public.waitlist_entries w
    where w.ticket_type_id is not null and w.status = 'waiting'
  loop
    v_end := (select coalesce(tt.sale_ends_at, public.ticket_type_default_sale_end(tt.id)) from public.ticket_types tt where tt.id = v_t.id);
    if v_end is null or now() >= v_end
       or not exists (select 1 from public.ticket_types tt join public.events e on e.id = tt.event_id where tt.id = v_t.id and e.status = 'published') then
      update public.waitlist_entries set status = 'expired' where ticket_type_id = v_t.id and status = 'waiting';
      continue;
    end if;
    v_free := public.ticket_type_free(v_t.id);
    for v_id in
      select w.id from public.waitlist_entries w
      where w.ticket_type_id = v_t.id and w.status = 'waiting'
      order by w.created_at limit greatest(v_free, 0)
      for update skip locked
    loop
      update public.waitlist_entries
      set status = 'offered', offered_at = now(), offer_expires_at = least(now() + interval '2 hours', v_end)
      where id = v_id;
      return next v_id;
    end loop;
  end loop;

  -- competitions
  for v_t in
    select distinct w.session_id as id from public.waitlist_entries w
    where w.session_id is not null and w.status = 'waiting'
  loop
    v_end := (
      select coalesce(tt.sale_ends_at, s.starts_at) from public.event_sessions s
      left join public.ticket_types tt on tt.registration_session_id = s.id where s.id = v_t.id
    );
    if v_end is null or now() >= v_end
       or not exists (select 1 from public.event_sessions s join public.events e on e.id = s.event_id where s.id = v_t.id and e.status = 'published') then
      update public.waitlist_entries set status = 'expired' where session_id = v_t.id and status = 'waiting';
      continue;
    end if;
    v_free := (select coalesce(s.capacity, 0) from public.event_sessions s where s.id = v_t.id) - public.session_teams_taken(v_t.id);
    for v_id in
      select w.id from public.waitlist_entries w
      where w.session_id = v_t.id and w.status = 'waiting'
      order by w.created_at limit greatest(v_free, 0)
      for update skip locked
    loop
      update public.waitlist_entries
      set status = 'offered', offered_at = now(), offer_expires_at = least(now() + interval '2 hours', v_end)
      where id = v_id;
      return next v_id;
    end loop;
  end loop;
  return;
end;
$$;

-- Organizer: how many are waiting / offered, per ticket type or competition
create or replace function public.event_waitlist_counts(p_event_id uuid)
returns table (ticket_type_id uuid, session_id uuid, waiting integer, offered integer)
language sql
stable
security definer
set search_path = ''
as $$
  select w.ticket_type_id, w.session_id,
         count(*) filter (where w.status = 'waiting')::int,
         count(*) filter (where w.status = 'offered' and w.offer_expires_at > now())::int
  from public.waitlist_entries w
  join public.events e on e.id = w.event_id
  where w.event_id = p_event_id and (public.is_org_staff(e.org_id) or public.is_admin())
  group by w.ticket_type_id, w.session_id;
$$;

revoke all on function public.ticket_type_free(uuid) from public, anon, authenticated;
revoke all on function public.waitlist_process() from public, anon, authenticated;
revoke all on function public.waitlist_close_on_order() from public, anon, authenticated;
revoke all on function public.waitlist_close_on_registration() from public, anon, authenticated;
grant execute on function public.ticket_type_free(uuid), public.waitlist_process() to service_role;
revoke all on function public.join_waitlist(uuid, uuid) from public, anon;
revoke all on function public.leave_waitlist(uuid) from public, anon;
revoke all on function public.my_waitlist() from public, anon;
revoke all on function public.event_waitlist_counts(uuid) from public, anon;
grant execute on function public.join_waitlist(uuid, uuid), public.leave_waitlist(uuid), public.my_waitlist(), public.event_waitlist_counts(uuid)
  to authenticated, service_role;

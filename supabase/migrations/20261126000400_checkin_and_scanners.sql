-- =============================================================================
-- TickLO v1 – check-in (SCN-03, SCN-06, SCN-10, ORG-13), scanners, live stats
-- =============================================================================

-- ---------------------------------------------------------------------------
-- perform_check_in – SERVICE ROLE ONLY (called by the scan-verify Edge
-- Function after it has verified the QR token signature and freshness).
-- One atomic UPDATE ... WHERE status = 'valid' guarantees a ticket can be
-- checked in once, even if two phones scan it at the same moment.
-- Every attempt (pass or fail) is written to checkins.
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
  v_holder text;
  v_code text;
  v_type_name text;
  v_requires_card boolean;
  v_checked_at timestamptz;
  v_result public.checkin_result;
begin
  if not public.can_scan_event(p_event_id, p_actor) then
    insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
    values (p_event_id, null, p_actor, p_method, 'not_allowed', v_device);
    return jsonb_build_object('result', 'not_allowed');
  end if;

  with updated as (
    update public.tickets t
    set status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor, checkin_method = p_method
    where t.id = p_ticket_id and t.event_id = p_event_id and t.status = 'valid'
    returning t.id, t.holder_name, t.code, t.ticket_type_id, t.checked_in_at
  )
  select u.id, u.holder_name, u.code, tt.name, tt.requires_student_card, u.checked_in_at
  into v_ticket_id, v_holder, v_code, v_type_name, v_requires_card, v_checked_at
  from updated u
  join public.ticket_types tt on tt.id = u.ticket_type_id;

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
      'checked_in_at', v_checked_at
    );
  end if;

  -- Not checked in: find out why
  select t.id, t.event_id, t.status, t.holder_name, t.code, tt.name, tt.requires_student_card, t.checked_in_at
  into v_ticket_id, v_ticket_event, v_status, v_holder, v_code, v_type_name, v_requires_card, v_checked_at
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  where t.id = p_ticket_id;

  if v_ticket_id is null then
    v_result := 'not_found';
  elsif v_ticket_event <> p_event_id then
    v_result := 'wrong_event';
  elsif v_status = 'checked_in' then
    v_result := 'already_used';
  elsif v_status = 'cancelled' then
    v_result := 'cancelled';
  else
    v_result := 'invalid';
  end if;

  insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
  values (p_event_id, v_ticket_id, p_actor, p_method, v_result, v_device);

  if v_result = 'already_used' then
    return jsonb_build_object(
      'result', v_result, 'ticket_id', v_ticket_id, 'holder_name', v_holder,
      'ticket_type', v_type_name, 'checked_in_at', v_checked_at
    );
  end if;
  return jsonb_build_object('result', v_result);
end;
$$;

-- Log a failed scan that never reached perform_check_in (bad signature, expired
-- QR code). SERVICE ROLE ONLY.
create or replace function public.log_checkin_attempt(
  p_event_id uuid,
  p_ticket_id uuid,
  p_actor uuid,
  p_result public.checkin_result,
  p_device text default null,
  p_detail text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device, detail)
  values (
    p_event_id,
    (select t.id from public.tickets t where t.id = p_ticket_id),
    p_actor, 'scan', p_result, left(p_device, 200), left(p_detail, 300)
  );
$$;

-- Manual check-in from the attendee list (ORG-13) – organizers and scanners.
create or replace function public.manual_check_in(p_ticket_id uuid, p_device text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  select t.event_id into v_event_id from public.tickets t where t.id = p_ticket_id;
  if v_event_id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  return public.perform_check_in(p_ticket_id, v_event_id, v_uid, 'manual', coalesce(p_device, 'manual'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Scanner assignment (ORG-10)
-- ---------------------------------------------------------------------------
create or replace function public.assign_scanner(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can assign scanners.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  if not exists (
    select 1 from public.organization_members m where m.org_id = v_event.org_id and m.user_id = p_user_id
  ) then
    raise exception using message = 'TL:NOT_A_MEMBER', detail = 'Invite this person to your team first.';
  end if;

  insert into public.event_staff (event_id, user_id, role, assigned_by, expires_at)
  values (p_event_id, p_user_id, 'scanner', auth.uid(), v_event.ends_at + interval '6 hours')
  on conflict (event_id, user_id) do update
    set expires_at = excluded.expires_at, assigned_by = excluded.assigned_by;
end;
$$;

create or replace function public.unassign_scanner(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_event_staff(p_event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers can change scanners.';
  end if;
  delete from public.event_staff where event_id = p_event_id and user_id = p_user_id;
end;
$$;

-- Events the caller can scan right now (SCN-01 event picker)
create or replace function public.my_scan_events()
returns table (
  event_id uuid,
  event_name text,
  event_slug text,
  org_name text,
  org_slug text,
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  access text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.slug, o.name, o.slug, e.venue, e.starts_at, e.ends_at,
         case when exists (
           select 1 from public.event_staff s
           where s.event_id = e.id and s.user_id = auth.uid() and s.expires_at > now()
         ) then 'scanner' else 'organizer' end
  from public.events e
  join public.organizations o on o.id = e.org_id
  where public.can_scan_event(e.id, auth.uid())
  order by e.starts_at;
$$;

-- Lightweight attendee list for scanners (manual check-in / offline lookup,
-- SCN-09). No phone or email (NFR-07).
create or replace function public.scanner_attendees(p_event_id uuid)
returns table (
  ticket_id uuid,
  code text,
  holder_name text,
  ticket_type text,
  requires_student_card boolean,
  status public.ticket_status,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.can_scan_event(p_event_id, auth.uid()) or public.is_event_staff(p_event_id)) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'You are not a scanner for this event.';
  end if;
  return query
    select t.id, t.code, t.holder_name, tt.name, tt.requires_student_card, t.status, t.checked_in_at
    from public.tickets t
    join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.event_id = p_event_id and t.status <> 'cancelled'
    order by t.holder_name, t.code;
end;
$$;

-- ---------------------------------------------------------------------------
-- event_stats – live event dashboard (ORG-08, PAY-14) and scanner count (SCN-08)
-- ---------------------------------------------------------------------------
create or replace function public.event_stats(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_checked_in int;
  v_total int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;

  select count(*) filter (where t.status = 'checked_in'),
         count(*) filter (where t.status in ('valid', 'checked_in'))
  into v_checked_in, v_total
  from public.tickets t
  where t.event_id = p_event_id;

  if not (public.is_org_staff(v_event.org_id) or public.is_admin()) then
    if public.can_scan_event(p_event_id, auth.uid()) then
      return jsonb_build_object('checked_in', v_checked_in, 'total_tickets', v_total);
    end if;
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;

  return jsonb_build_object(
    'capacity', v_event.capacity,
    'checked_in', v_checked_in,
    'total_tickets', v_total,
    'pending_review', (select count(*) from public.orders o where o.event_id = p_event_id and o.status = 'under_review'),
    'awaiting_payment', (
      select count(*) from public.orders o
      where o.event_id = p_event_id and o.status = 'awaiting_payment' and o.hold_expires_at > now()
    ),
    'approved_orders', (select count(*) from public.orders o where o.event_id = p_event_id and o.status = 'approved'),
    'collected_paisa', (
      select coalesce(sum(o.total_paisa), 0) from public.orders o
      where o.event_id = p_event_id and o.status = 'approved'
    ),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ticket_type_id', tt.id,
        'name', tt.name,
        'price_paisa', tt.price_paisa,
        'quantity', tt.quantity,
        'sold', (
          select coalesce(sum(oi.quantity), 0) from public.order_items oi
          join public.orders o on o.id = oi.order_id
          where oi.ticket_type_id = tt.id and o.status = 'approved'
        ),
        'held', (
          select coalesce(sum(oi.quantity), 0) from public.order_items oi
          join public.orders o on o.id = oi.order_id
          where oi.ticket_type_id = tt.id
            and (o.status = 'under_review' or (o.status = 'awaiting_payment' and o.hold_expires_at > now()))
        ),
        'checked_in', (
          select count(*) from public.tickets t where t.ticket_type_id = tt.id and t.status = 'checked_in'
        )
      ) order by tt.sort_order, tt.created_at)
      from public.ticket_types tt where tt.event_id = p_event_id
    ), '[]'::jsonb)
  );
end;
$$;

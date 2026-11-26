-- =============================================================================
-- TickLO – gate sales of printed tickets (D-042)
-- When a volunteer at the gate sells a paper ticket and scans it in, the scanner
-- can record how it was paid ("Gate sale: Cash"). perform_check_in now says when
-- a scan counted an unsold printed ticket as sold, and record_gate_sale fills in
-- the payment method. The money was taken at the gate, so the ticket moves to the
-- organizer's desk (no seller).
-- =============================================================================

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
    set status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor, checkin_method = p_method,
        sale_status = case when t.sale_status = 'in_stock' then 'sold' else t.sale_status end,
        sale_source = case when t.sale_status = 'in_stock' then 'scan' else t.sale_source end,
        sold_at = case when t.sale_status = 'in_stock' then now() else t.sold_at end,
        sale_price_paisa = case
          when t.sale_status = 'in_stock' then (select tt.price_paisa from public.ticket_types tt where tt.id = t.ticket_type_id)
          else t.sale_price_paisa end
    where t.id = p_ticket_id and t.event_id = p_event_id and t.status = 'valid'
      and not (t.sale_status = 'in_stock'
               and exists (select 1 from public.print_batches pb where pb.id = t.batch_id and pb.require_sale))
    returning t.id, t.holder_name, t.code, t.ticket_type_id, t.checked_in_at, t.batch_id, t.serial_no,
              (t.sale_source = 'scan' and t.sold_at = now()) as gate_sold, t.sale_price_paisa
  )
  select u.id, u.holder_name, u.code, tt.name, tt.requires_student_card, u.checked_in_at,
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
      -- an unsold paper ticket was just counted as sold by this scan (gate sale, D-042)
      'gate_sold', v_gate_sold,
      'sale_price_paisa', case when v_gate_sold then v_sale_price end
    );
  end if;

  -- Not checked in: find out why
  select t.id, t.event_id, t.status, t.sale_status, coalesce(pb.require_sale, false), t.holder_name, t.code, tt.name,
         tt.requires_student_card, t.checked_in_at, public.print_serial_label(pb.prefix, t.serial_no)
  into v_ticket_id, v_ticket_event, v_status, v_sale, v_require_sale, v_holder, v_code, v_type_name,
       v_requires_card, v_checked_at, v_serial
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.print_batches pb on pb.id = t.batch_id
  where t.id = p_ticket_id;

  if v_ticket_id is null then
    v_result := 'not_found';
  elsif v_ticket_event <> p_event_id then
    v_result := 'wrong_event';
  elsif v_status = 'checked_in' then
    v_result := 'already_used';
  elsif v_status = 'cancelled' then
    v_result := 'cancelled';
  elsif v_status = 'valid' and v_sale = 'in_stock' and v_require_sale then
    v_result := 'not_sold';
  else
    v_result := 'invalid';
  end if;

  insert into public.checkins (event_id, ticket_id, scanned_by, method, result, device)
  values (p_event_id, v_ticket_id, p_actor, p_method, v_result, v_device);

  if v_result = 'already_used' then
    return jsonb_build_object(
      'result', v_result, 'ticket_id', v_ticket_id, 'holder_name', v_holder,
      'ticket_type', v_type_name, 'checked_in_at', v_checked_at, 'serial', v_serial
    );
  end if;
  if v_result in ('cancelled', 'not_sold') then
    return jsonb_build_object('result', v_result, 'serial', v_serial, 'returned', v_sale = 'returned');
  end if;
  return jsonb_build_object('result', v_result);
end;
$$;

create or replace function public.record_gate_sale(p_ticket_id uuid, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if coalesce(p_method, '') not in ('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'other') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose how it was paid.';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found or v_ticket.source <> 'printed' or not public.can_scan_event(v_ticket.event_id, v_uid) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  -- Only the ticket this person just let in, counted as sold by that scan
  if v_ticket.status <> 'checked_in' or v_ticket.checked_in_by is distinct from v_uid
     or v_ticket.sale_status <> 'sold' or v_ticket.sale_source <> 'scan' or v_ticket.sale_method is not null
     or v_ticket.checked_in_at < now() - interval '15 minutes' then
    return jsonb_build_object('result', 'skipped');
  end if;
  if v_ticket.seller_id is not null and exists (select 1 from public.print_sellers s where s.id = v_ticket.seller_id and s.settled_at is not null) then
    return jsonb_build_object('result', 'skipped');
  end if;
  update public.tickets set sale_method = p_method, sold_by = v_uid, seller_id = null where id = p_ticket_id;
  perform public.audit('print_tickets.gate_sale', 'event', v_ticket.event_id::text,
    jsonb_build_object('ticket_id', p_ticket_id, 'method', p_method, 'from_seller', v_ticket.seller_id));
  return jsonb_build_object('result', 'ok');
end;
$$;

-- Does this event have printed tickets? (scanner shows the gate-sale switch)
create or replace function public.event_has_printed(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.can_scan_event(p_event_id, auth.uid()) or public.is_event_staff(p_event_id))
     and exists (select 1 from public.print_batches pb where pb.event_id = p_event_id);
$$;

revoke execute on function public.record_gate_sale(uuid, text), public.event_has_printed(uuid) from public, anon;
grant execute on function public.record_gate_sale(uuid, text), public.event_has_printed(uuid) to authenticated, service_role;

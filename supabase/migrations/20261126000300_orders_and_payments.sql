-- =============================================================================
-- TickLO v1 – guards, availability, orders, manual payments, holds
--
-- Error convention: functions raise `TL:<CODE>` in the message and a human
-- readable sentence in DETAIL. The web app maps codes to friendly text.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Small generators
-- ---------------------------------------------------------------------------
create or replace function public.generate_ref_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := 'TL-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.orders o where o.ref_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.generate_ticket_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
      if i = 4 then
        v_code := v_code || '-';
      end if;
    end loop;
    exit when not exists (select 1 from public.tickets t where t.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.audit(
  p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Availability (rule 1): remaining = quantity − approved − active holds.
-- Active hold = under_review, or awaiting_payment whose 60 min hold has not ended.
-- ---------------------------------------------------------------------------
create or replace function public.ticket_type_taken(p_ticket_type_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.ticket_type_id = p_ticket_type_id
    and (
      o.status in ('approved', 'under_review')
      or (o.status = 'awaiting_payment' and o.hold_expires_at > now())
    );
$$;

-- Public: remaining tickets per type for a visible event (EVT-03)
create or replace function public.event_availability(p_event_id uuid)
returns table (ticket_type_id uuid, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  select tt.id, greatest(tt.quantity - public.ticket_type_taken(tt.id), 0)
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  where tt.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin());
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Ticket types: capacity (rule 2), price/eligibility lock after booking (rule 7, ORG-07)
create or replace function public.ticket_types_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_status public.event_status;
  v_capacity int;
  v_booked boolean;
  v_taken int;
  v_total int;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select e.status, e.capacity into v_event_status, v_capacity from public.events e where e.id = v_event_id;

  if tg_op = 'UPDATE' and new.event_id <> old.event_id then
    raise exception using message = 'TL:INVALID_STATE', detail = 'A ticket type cannot move to another event.';
  end if;

  if v_event_status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event is cancelled.';
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_booked := exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.ticket_type_id = old.id and o.status <> 'expired'
    );
    if v_booked then
      if tg_op = 'DELETE' then
        raise exception using message = 'TL:HAS_BOOKINGS',
          detail = 'This ticket type already has bookings and cannot be deleted.';
      end if;
      if new.price_paisa <> old.price_paisa or new.requires_student_card <> old.requires_student_card then
        raise exception using message = 'TL:PRICE_LOCKED',
          detail = 'Price and student-card requirement cannot change after the first booking.';
      end if;
      v_taken := public.ticket_type_taken(old.id);
      if new.quantity < v_taken then
        raise exception using message = 'TL:QUANTITY_TOO_LOW',
          detail = format('%s tickets are already sold or on hold; quantity cannot go below that.', v_taken);
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select coalesce(sum(tt.quantity), 0) into v_total
  from public.ticket_types tt
  where tt.event_id = new.event_id and tt.id <> new.id;

  if v_capacity is not null and v_total + new.quantity > v_capacity then
    raise exception using message = 'TL:CAPACITY_EXCEEDED',
      detail = format('Ticket quantities (%s) cannot be more than the event capacity (%s).', v_total + new.quantity, v_capacity);
  end if;

  return new;
end;
$$;

create trigger ticket_types_guard
  before insert or update or delete on public.ticket_types
  for each row execute function public.ticket_types_guard();

-- Events: org cannot change; capacity must cover ticket quantities
create or replace function public.events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  if new.org_id <> old.org_id then
    raise exception using message = 'TL:INVALID_STATE', detail = 'An event cannot move to another society.';
  end if;
  if new.capacity <> old.capacity then
    select coalesce(sum(tt.quantity), 0) into v_total from public.ticket_types tt where tt.event_id = new.id;
    if new.capacity < v_total then
      raise exception using message = 'TL:CAPACITY_EXCEEDED',
        detail = format('Capacity cannot be less than the total ticket quantity (%s).', v_total);
    end if;
  end if;
  return new;
end;
$$;

create trigger events_guard
  before update on public.events
  for each row execute function public.events_guard();

-- Scanner roles expire 6 h after the event ends (ORG-10, rule 11): keep in sync
create or replace function public.events_sync_staff_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_at <> old.ends_at then
    update public.event_staff set expires_at = new.ends_at + interval '6 hours' where event_id = new.id;
  end if;
  return new;
end;
$$;

create trigger events_sync_staff_expiry
  after update of ends_at on public.events
  for each row execute function public.events_sync_staff_expiry();

-- ---------------------------------------------------------------------------
-- Hold expiry (PAY-10). Called by pg_cron every minute and lazily.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with expired as (
    update public.orders
    set status = 'expired'
    where status = 'awaiting_payment' and hold_expires_at <= now()
    returning 1
  )
  select count(*) into v_count from expired;

  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ticket issuing (internal). Idempotent: never creates tickets twice (NFR-13).
-- ---------------------------------------------------------------------------
create or replace function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item record;
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

  for v_item in
    select oi.ticket_type_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id
  loop
    for i in 1..v_item.quantity loop
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, code)
      values (p_order_id, v_order.event_id, v_item.ticket_type_id, v_order.user_id, v_order.buyer_name,
              public.generate_ticket_code());
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order (PAY-01, PAY-02, PAY-12, AUTH-06, rules 1-3)
-- p_items: [{"ticket_type_id": "...", "quantity": 2}, ...]
-- Locks the ticket type rows so two buyers can never oversell.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null
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

  -- D-007: one unpaid booking per event per user
  select * into v_existing
  from public.orders o
  where o.user_id = v_uid and o.event_id = p_event_id
    and o.status = 'awaiting_payment' and o.hold_expires_at > now()
  order by o.created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id, 'ref_code', v_existing.ref_code, 'status', v_existing.status,
      'total_paisa', v_existing.total_paisa, 'existing', true
    );
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose at least one ticket.';
  end if;

  select array_agg(x.id order by x.id) into v_type_ids
  from (select distinct (elem ->> 'ticket_type_id')::uuid as id from jsonb_array_elements(p_items) elem) x;
  if coalesce(array_length(v_type_ids, 1), 0) <> jsonb_array_length(p_items) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each ticket type can appear only once.';
  end if;

  -- Lock in a stable order to avoid deadlocks between concurrent buyers
  perform 1 from public.ticket_types tt where tt.id = any (v_type_ids) order by tt.id for update;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Quantity must be at least 1.';
    end if;

    select * into v_type from public.ticket_types tt
    where tt.id = (v_item ->> 'ticket_type_id')::uuid and tt.event_id = p_event_id;
    if not found then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'That ticket type does not belong to this event.';
    end if;

    if v_type.sale_starts_at is not null and now() < v_type.sale_starts_at then
      raise exception using message = 'TL:SALE_NOT_STARTED', detail = format('Sale for "%s" has not started yet.', v_type.name);
    end if;
    -- rule 3: no end date → booking closes when the event starts
    v_sale_end := coalesce(v_type.sale_ends_at, v_event.starts_at);
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

  if v_total_qty > v_event.max_tickets_per_order then
    raise exception using message = 'TL:MAX_PER_ORDER',
      detail = format('You can book at most %s tickets in one order.', v_event.max_tickets_per_order);
  end if;

  -- PAY-12 free tickets are issued at once (D-009: unless a student card must be checked)
  v_status := case
    when v_total = 0 and not v_requires_card then 'approved'::public.order_status
    else 'awaiting_payment'::public.order_status
  end;

  v_ref := public.generate_ref_code();
  insert into public.orders (
    ref_code, event_id, user_id, status, total_paisa, ticket_count, requires_student_card,
    hold_expires_at, buyer_name, buyer_email, buyer_phone, approved_at, decided_at
  )
  values (
    v_ref, p_event_id, v_uid, v_status, v_total, v_total_qty, v_requires_card,
    case when v_status = 'awaiting_payment' then now() + interval '60 minutes' end,
    v_profile.full_name, v_profile.email, v_profile.phone,
    case when v_status = 'approved' then now() end,
    case when v_status = 'approved' then now() end
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, ticket_type_id, quantity, unit_price_paisa)
  select v_order_id, tt.id, (e ->> 'quantity')::int, tt.price_paisa
  from jsonb_array_elements(p_items) e
  join public.ticket_types tt on tt.id = (e ->> 'ticket_type_id')::uuid;

  if v_status = 'approved' then
    perform public.issue_tickets(v_order_id);
  end if;

  return jsonb_build_object(
    'order_id', v_order_id, 'ref_code', v_ref, 'status', v_status,
    'total_paisa', v_total, 'existing', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_payment_proof (PAY-04, PAY-05, PAY-08, PAY-09) – SERVICE ROLE ONLY.
-- The server computes the image hash; browsers cannot call this directly.
-- ---------------------------------------------------------------------------
create or replace function public.submit_payment_proof(
  p_user_id uuid,
  p_order_id uuid,
  p_screenshot_path text,
  p_image_hash text,
  p_transaction_id text,
  p_sender_name text,
  p_student_card_path text,
  p_payment_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_event public.events;
  v_item record;
  v_taken int;
  v_sale_end timestamptz;
  v_norm text;
  v_hash text := nullif(lower(trim(coalesce(p_image_hash, ''))), '');
  v_dupes uuid[];
  v_reasons text[] := '{}';
  v_proof_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id <> p_user_id then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_suspended) then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;

  select * into v_event from public.events where id = v_order.event_id;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;

  if v_order.status = 'awaiting_payment' then
    if v_order.hold_expires_at <= now() then
      raise exception using message = 'TL:ORDER_EXPIRED',
        detail = 'Your 60 minute hold has ended. Please book again.';
    end if;
  elsif v_order.status = 'rejected' then
    -- PAY-08 / D-008: allowed while the sale is open and the tickets are still available
    perform 1 from public.ticket_types tt
    where tt.id in (select oi.ticket_type_id from public.order_items oi where oi.order_id = p_order_id)
    order by tt.id
    for update;

    for v_item in
      select oi.ticket_type_id, oi.quantity, tt.quantity as type_quantity, tt.name, tt.sale_ends_at
      from public.order_items oi
      join public.ticket_types tt on tt.id = oi.ticket_type_id
      where oi.order_id = p_order_id
    loop
      v_sale_end := coalesce(v_item.sale_ends_at, v_event.starts_at);
      if now() >= v_sale_end then
        raise exception using message = 'TL:SALE_CLOSED', detail = format('Sale for "%s" is closed.', v_item.name);
      end if;
      v_taken := public.ticket_type_taken(v_item.ticket_type_id);
      if v_item.type_quantity - v_taken < v_item.quantity then
        raise exception using message = 'TL:SOLD_OUT',
          detail = format('Not enough "%s" tickets are left any more.', v_item.name);
      end if;
    end loop;
  else
    raise exception using message = 'TL:INVALID_STATE',
      detail = 'A payment screenshot cannot be uploaded for this order right now.';
  end if;

  if v_order.total_paisa > 0 then
    if coalesce(p_screenshot_path, '') = '' or v_hash is null then
      raise exception using message = 'TL:PROOF_REQUIRED', detail = 'Please upload the payment screenshot.';
    end if;
    if coalesce(char_length(trim(p_transaction_id)), 0) < 4 then
      raise exception using message = 'TL:PROOF_REQUIRED', detail = 'Please enter the transaction ID.';
    end if;
    if coalesce(char_length(trim(p_sender_name)), 0) < 2 then
      raise exception using message = 'TL:PROOF_REQUIRED', detail = 'Please enter the sender''s name.';
    end if;
  end if;
  if v_order.requires_student_card and coalesce(p_student_card_path, '') = '' then
    raise exception using message = 'TL:CARD_REQUIRED', detail = 'Please upload a photo of your student card.';
  end if;
  if p_payment_account_id is not null and not exists (
    select 1 from public.event_payment_accounts epa
    where epa.event_id = v_order.event_id and epa.payment_account_id = p_payment_account_id
  ) then
    raise exception using message = 'TL:INVALID_ACCOUNT', detail = 'Choose one of the accounts shown for this event.';
  end if;

  v_norm := nullif(upper(regexp_replace(coalesce(p_transaction_id, ''), '[^A-Za-z0-9]', '', 'g')), '');

  -- PAY-09 / rule 6: same transaction ID or same screenshot in another order of this event
  select coalesce(array_agg(distinct pp.order_id), '{}') into v_dupes
  from public.payment_proofs pp
  where pp.event_id = v_order.event_id
    and pp.order_id <> p_order_id
    and ((v_norm is not null and pp.transaction_id_norm = v_norm) or (v_hash is not null and pp.image_hash = v_hash));

  if v_norm is not null and exists (
    select 1 from public.payment_proofs pp
    where pp.event_id = v_order.event_id and pp.order_id <> p_order_id and pp.transaction_id_norm = v_norm
  ) then
    v_reasons := array_append(v_reasons, 'transaction_id');
  end if;
  if v_hash is not null and exists (
    select 1 from public.payment_proofs pp
    where pp.event_id = v_order.event_id and pp.order_id <> p_order_id and pp.image_hash = v_hash
  ) then
    v_reasons := array_append(v_reasons, 'screenshot');
  end if;

  insert into public.payment_proofs (
    order_id, event_id, user_id, payment_account_id, screenshot_path, image_hash, transaction_id,
    transaction_id_norm, sender_name, student_card_path, is_possible_duplicate, duplicate_order_ids,
    duplicate_reasons
  )
  values (
    p_order_id, v_order.event_id, p_user_id, p_payment_account_id, nullif(p_screenshot_path, ''), v_hash,
    nullif(trim(coalesce(p_transaction_id, '')), ''), v_norm, nullif(trim(coalesce(p_sender_name, '')), ''),
    nullif(p_student_card_path, ''), cardinality(v_dupes) > 0, v_dupes, v_reasons
  )
  returning id into v_proof_id;

  update public.orders
  set status = 'under_review', submitted_at = now(), hold_expires_at = null,
      reject_reason = null, decided_at = null, decided_by = null
  where id = p_order_id;

  return jsonb_build_object(
    'proof_id', v_proof_id,
    'is_possible_duplicate', cardinality(v_dupes) > 0,
    'duplicate_order_ids', to_jsonb(v_dupes),
    'duplicate_reasons', to_jsonb(v_reasons)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_order (PAY-07, NFR-13). Idempotent: a second click returns
-- already_approved=true and creates no extra tickets.
-- ---------------------------------------------------------------------------
create or replace function public.approve_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_count int;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if not public.is_event_staff(v_order.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the event''s organizers can approve payments.';
  end if;

  if v_order.status = 'approved' then
    return jsonb_build_object('order_id', p_order_id, 'already_approved', true, 'tickets_created', 0);
  end if;
  if v_order.status <> 'under_review' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only orders under review can be approved.';
  end if;
  if exists (select 1 from public.events e where e.id = v_order.event_id and e.status = 'cancelled') then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;

  update public.orders
  set status = 'approved', approved_at = now(), decided_at = now(), decided_by = v_uid, reject_reason = null
  where id = p_order_id;

  update public.payment_proofs
  set status = 'approved', reviewed_by = v_uid, reviewed_at = now()
  where order_id = p_order_id and status = 'pending';

  v_count := public.issue_tickets(p_order_id);

  perform public.audit('order.approve', 'order', p_order_id::text,
    jsonb_build_object('ref_code', v_order.ref_code, 'event_id', v_order.event_id, 'tickets', v_count));

  return jsonb_build_object('order_id', p_order_id, 'already_approved', false, 'tickets_created', v_count);
end;
$$;

-- reject_order (PAY-06, PAY-07): reason required; tickets go back to stock
create or replace function public.reject_order(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Please give a reason for rejecting.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if not public.is_event_staff(v_order.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the event''s organizers can reject payments.';
  end if;
  if v_order.status = 'rejected' then
    return jsonb_build_object('order_id', p_order_id, 'already_rejected', true);
  end if;
  if v_order.status <> 'under_review' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Only orders under review can be rejected.';
  end if;

  update public.orders
  set status = 'rejected', decided_at = now(), decided_by = v_uid, reject_reason = left(v_reason, 500)
  where id = p_order_id;

  update public.payment_proofs
  set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), reject_reason = left(v_reason, 500)
  where order_id = p_order_id and status = 'pending';

  perform public.audit('order.reject', 'order', p_order_id::text,
    jsonb_build_object('ref_code', v_order.ref_code, 'event_id', v_order.event_id, 'reason', left(v_reason, 500)));

  return jsonb_build_object('order_id', p_order_id, 'already_rejected', false);
end;
$$;

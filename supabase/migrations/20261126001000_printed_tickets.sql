-- =============================================================================
-- TickLO – printed (physical) tickets (PRT-01 .. PRT-10, D-039)
--
-- An organizer designs a ticket (template + editor), chooses a ticket type and
-- a quantity, and TickLO creates that many real tickets – each with its own
-- serial number (e.g. QWL-0042) and its own signed QR (same T2 token as online
-- tickets). They print the PDF and sell the paper tickets for cash.
--
--  * Printed tickets live in public.tickets (source = 'printed') so the scanner,
--    "Already used", live counts, attendee list and event cancellation all work
--    unchanged. They have no order and no owner.
--  * They use up the ticket type's quantity (online + printed can never oversell).
--    Voided (lost/stolen) printed tickets give their place back.
--  * The design (JSON) is stored on the batch so the same PDF can be downloaded
--    again; it must contain the QR and the "Ticket partner: TickLO" logo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.print_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  label text,
  prefix text not null,
  first_serial integer not null,
  quantity integer not null,
  template_key text,
  design jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_batches_prefix_format check (prefix ~ '^[A-Z0-9]{1,6}$'),
  constraint print_batches_quantity_range check (quantity between 1 and 2000),
  constraint print_batches_first_serial_pos check (first_serial >= 1),
  constraint print_batches_label_len check (label is null or char_length(label) <= 80),
  constraint print_batches_template_key_len check (template_key is null or char_length(template_key) <= 60),
  constraint print_batches_design_size check (octet_length(design::text) <= 400000)
);
create index print_batches_event_idx on public.print_batches (event_id, created_at desc);
create index print_batches_type_idx on public.print_batches (ticket_type_id);
create trigger print_batches_updated_at before update on public.print_batches
  for each row execute function public.set_updated_at();

-- Designs a society saved for re-use ("My templates")
create table public.ticket_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text not null default 'custom',
  design jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_templates_name_len check (char_length(name) between 1 and 60),
  constraint ticket_templates_category_len check (char_length(category) between 1 and 30),
  constraint ticket_templates_design_size check (octet_length(design::text) <= 400000)
);
create index ticket_templates_org_idx on public.ticket_templates (org_id, updated_at desc);
create trigger ticket_templates_updated_at before update on public.ticket_templates
  for each row execute function public.set_updated_at();

alter table public.tickets
  add column source text not null default 'online',
  add column batch_id uuid references public.print_batches (id) on delete restrict,
  add column serial_no integer,
  add column holder_phone text,
  alter column order_id drop not null,
  alter column owner_id drop not null;

alter table public.tickets
  add constraint tickets_source_check check (source in ('online', 'printed')),
  add constraint tickets_source_shape check (
    (source = 'online' and order_id is not null and owner_id is not null and batch_id is null and serial_no is null)
    or (source = 'printed' and order_id is null and owner_id is null and batch_id is not null and serial_no is not null)
  ),
  add constraint tickets_holder_phone_len check (holder_phone is null or char_length(holder_phone) <= 20);

create unique index tickets_event_serial_idx on public.tickets (event_id, serial_no) where serial_no is not null;
create index tickets_batch_idx on public.tickets (batch_id, serial_no) where batch_id is not null;
create index tickets_printed_type_idx on public.tickets (ticket_type_id) where source = 'printed';

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.print_batches enable row level security;
alter table public.ticket_templates enable row level security;

create policy print_batches_read on public.print_batches
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin());

create policy ticket_templates_read on public.ticket_templates
  for select to authenticated
  using (public.is_org_staff(org_id) or public.is_admin());
create policy ticket_templates_insert on public.ticket_templates
  for insert to authenticated
  with check (public.is_org_staff(org_id) and created_by = (select auth.uid()));
create policy ticket_templates_update on public.ticket_templates
  for update to authenticated
  using (public.is_org_staff(org_id))
  with check (public.is_org_staff(org_id));
create policy ticket_templates_delete on public.ticket_templates
  for delete to authenticated
  using (public.is_org_staff(org_id));

grant all on public.print_batches, public.ticket_templates to service_role;
grant select on public.print_batches to authenticated;
grant select, delete on public.ticket_templates to authenticated;
grant insert (org_id, name, category, design, created_by) on public.ticket_templates to authenticated;
grant update (name, category, design) on public.ticket_templates to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- "QWL" + 42 → "QWL-0042" (never truncates long numbers)
create or replace function public.print_serial_label(p_prefix text, p_serial integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_serial is null then null
    else p_prefix || '-' || lpad(p_serial::text, greatest(4, char_length(p_serial::text)), '0') end;
$$;

-- Server-side check of a ticket design (the browser editor checks the same
-- rules, but the browser can be bypassed). Returns null when the design is OK,
-- otherwise a sentence for the organizer.
--   * exactly one visible QR layer, square, at least 20 mm, not rotated, fully on the ticket
--   * at least one visible "Ticket partner: TickLO" layer, at least 18 mm wide,
--     at least 60 % opacity, fully on the ticket
-- (Design units are 0.1 mm. The renderer always draws QR and logo on top.)
create or replace function public.print_design_problem(p_design jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_w numeric;
  v_h numeric;
  v_qr jsonb;
  v_qr_count int;
  v_brand_ok boolean;
begin
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    return 'The ticket design is missing.';
  end if;
  if octet_length(p_design::text) > 400000 then
    return 'The ticket design is too large. Remove some images or shapes.';
  end if;
  if coalesce(p_design ->> 'version', '') <> '1' then
    return 'Unknown design version. Reload the editor and try again.';
  end if;
  if jsonb_typeof(p_design -> 'width') <> 'number' or jsonb_typeof(p_design -> 'height') <> 'number'
     or jsonb_typeof(p_design -> 'layers') <> 'array' then
    return 'The ticket design is damaged. Reload the editor and try again.';
  end if;
  v_w := (p_design ->> 'width')::numeric;
  v_h := (p_design ->> 'height')::numeric;
  if v_w < 400 or v_w > 3000 or v_h < 300 or v_h > 3000 then
    return 'Ticket size must be between 40 × 30 mm and 300 × 300 mm.';
  end if;
  if jsonb_array_length(p_design -> 'layers') > 300 then
    return 'Too many layers in the design (max 300).';
  end if;

  select count(*), (array_agg(l))[1]
  into v_qr_count, v_qr
  from jsonb_array_elements(p_design -> 'layers') l
  where l ->> 'type' = 'qr';
  if v_qr_count <> 1 then
    return 'The ticket must have exactly one QR code.';
  end if;
  if coalesce((v_qr ->> 'hidden')::boolean, false) then
    return 'The QR code cannot be hidden.';
  end if;
  if jsonb_typeof(v_qr -> 'size') <> 'number' or jsonb_typeof(v_qr -> 'x') <> 'number' or jsonb_typeof(v_qr -> 'y') <> 'number' then
    return 'The QR code layer is damaged.';
  end if;
  if (v_qr ->> 'size')::numeric < 200 then
    return 'The QR code must be at least 20 mm wide so phones can scan it.';
  end if;
  if coalesce((v_qr ->> 'rotation')::numeric, 0) <> 0 then
    return 'The QR code cannot be rotated.';
  end if;
  if (v_qr ->> 'x')::numeric < 0 or (v_qr ->> 'y')::numeric < 0
     or (v_qr ->> 'x')::numeric + (v_qr ->> 'size')::numeric > v_w
     or (v_qr ->> 'y')::numeric + (v_qr ->> 'size')::numeric > v_h then
    return 'The QR code must be fully on the ticket.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_design -> 'layers') l
    where l ->> 'type' = 'brand'
      and not coalesce((l ->> 'hidden')::boolean, false)
      and jsonb_typeof(l -> 'width') = 'number' and jsonb_typeof(l -> 'height') = 'number'
      and jsonb_typeof(l -> 'x') = 'number' and jsonb_typeof(l -> 'y') = 'number'
      and (l ->> 'width')::numeric >= 180
      and coalesce((l ->> 'opacity')::numeric, 1) >= 0.6
      and coalesce((l ->> 'rotation')::numeric, 0) = 0
      and (l ->> 'x')::numeric >= 0 and (l ->> 'y')::numeric >= 0
      and (l ->> 'x')::numeric + (l ->> 'width')::numeric <= v_w
      and (l ->> 'y')::numeric + (l ->> 'height')::numeric <= v_h
  ) into v_brand_ok;
  if not v_brand_ok then
    return 'The "Ticket partner: TickLO" logo must be on the ticket (at least 18 mm wide, fully visible).';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability now counts printed tickets (rule 1 extended, PRT-03)
-- remaining = quantity − approved − active holds − printed (not voided)
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
  )::int;
$$;

-- Ticket types: price is printed on paper tickets, so printed tickets lock the
-- price and block deleting the type, exactly like online bookings.
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
    ) or exists (
      select 1 from public.tickets t where t.ticket_type_id = old.id and t.source = 'printed'
    );
    if v_booked then
      if tg_op = 'DELETE' then
        raise exception using message = 'TL:HAS_BOOKINGS',
          detail = 'This ticket type already has bookings or printed tickets and cannot be deleted.';
      end if;
      if new.price_paisa <> old.price_paisa or new.requires_student_card <> old.requires_student_card then
        raise exception using message = 'TL:PRICE_LOCKED',
          detail = 'Price and student-card requirement cannot change after the first booking or printed ticket.';
      end if;
      v_taken := public.ticket_type_taken(old.id);
      if new.quantity < v_taken then
        raise exception using message = 'TL:QUANTITY_TOO_LOW',
          detail = format('%s tickets are already sold, printed or on hold; quantity cannot go below that.', v_taken);
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

-- ---------------------------------------------------------------------------
-- create_print_batch (PRT-02, PRT-03, PRT-04)
-- Creates p_quantity printed tickets with consecutive serial numbers for one
-- ticket type. All or nothing; locks the ticket type like create_order so
-- online buyers and printed batches can never oversell together.
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

  -- Same lock as create_order: no overselling between buyers and printers
  select * into v_type from public.ticket_types where id = p_ticket_type_id and event_id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose a ticket type of this event.';
  end if;

  v_taken := public.ticket_type_taken(v_type.id);
  v_remaining := greatest(v_type.quantity - v_taken, 0);
  if p_quantity > v_remaining then
    raise exception using message = 'TL:SOLD_OUT',
      detail = format('Only %s "%s" tickets are left. Lower the number or raise the quantity on Edit & tickets.', v_remaining, v_type.name);
  end if;

  -- Serial numbers run on per event (batch 2 starts after batch 1)
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

-- Fix a typo in the design after generating: the QR codes stay the same
-- (they belong to the tickets), only the artwork changes.
create or replace function public.update_print_batch_design(p_batch_id uuid, p_design jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.print_batches;
  v_event public.events;
  v_problem text;
begin
  select * into v_batch from public.print_batches where id = p_batch_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Batch not found.';
  end if;
  select * into v_event from public.events where id = v_batch.event_id;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change printed tickets.';
  end if;
  if v_event.status = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  v_problem := public.print_design_problem(p_design);
  if v_problem is not null then
    raise exception using message = 'TL:INVALID_DESIGN', detail = v_problem;
  end if;
  update public.print_batches set design = p_design where id = p_batch_id;
  perform public.audit('print_batch.design', 'event', v_batch.event_id::text, jsonb_build_object('batch_id', p_batch_id));
end;
$$;

-- Void lost or stolen printed tickets (PRT-07). Scanning them then shows
-- "cancelled"; their places go back to the ticket type.
create or replace function public.void_printed_tickets(p_batch_id uuid, p_from integer, p_to integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.print_batches;
  v_event public.events;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_count int;
begin
  select * into v_batch from public.print_batches where id = p_batch_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Batch not found.';
  end if;
  select * into v_event from public.events where id = v_batch.event_id;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can void printed tickets.';
  end if;
  if v_reason is null then
    raise exception using message = 'TL:REASON_REQUIRED', detail = 'Please say why these tickets are voided.';
  end if;
  if p_from is null or p_to is null or p_from > p_to
     or p_from < v_batch.first_serial or p_to > v_batch.first_serial + v_batch.quantity - 1 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = format(
      'Choose serial numbers between %s and %s.',
      public.print_serial_label(v_batch.prefix, v_batch.first_serial),
      public.print_serial_label(v_batch.prefix, v_batch.first_serial + v_batch.quantity - 1));
  end if;

  with voided as (
    update public.tickets
    set status = 'cancelled', cancelled_at = now()
    where batch_id = p_batch_id and serial_no between p_from and p_to and status = 'valid'
    returning 1
  )
  select count(*) into v_count from voided;

  perform public.audit('print_batch.void', 'event', v_batch.event_id::text, jsonb_build_object(
    'batch_id', p_batch_id,
    'from', public.print_serial_label(v_batch.prefix, p_from),
    'to', public.print_serial_label(v_batch.prefix, p_to),
    'voided', v_count, 'reason', left(v_reason, 300)
  ));
  return v_count;
end;
$$;

-- Note who bought a printed ticket (optional, PRT-08). Empty name resets it.
create or replace function public.set_printed_ticket_buyer(p_ticket_id uuid, p_name text, p_phone text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found or v_ticket.source <> 'printed' then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Printed ticket not found.';
  end if;
  if not public.is_event_staff(v_ticket.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change printed tickets.';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Name must be 80 characters or fewer.';
  end if;
  if v_phone is not null and char_length(v_phone) > 20 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Phone number is too long.';
  end if;
  update public.tickets
  set holder_name = coalesce(v_name, 'Printed ticket'), holder_phone = case when v_name is null then null else v_phone end
  where id = p_ticket_id;
end;
$$;

-- Every PDF download is counted and logged (a re-download means more paper copies exist).
create or replace function public.record_print_download(p_batch_id uuid, p_layout text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.print_batches;
begin
  select * into v_batch from public.print_batches where id = p_batch_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Batch not found.';
  end if;
  if not public.is_event_staff(v_batch.event_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  update public.print_batches
  set download_count = download_count + 1, last_downloaded_at = now()
  where id = p_batch_id;
  perform public.audit('print_batch.download', 'event', v_batch.event_id::text,
    jsonb_build_object('batch_id', p_batch_id, 'layout', left(p_layout, 40), 'download', v_batch.download_count + 1));
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in: the result also says the printed serial (PRT-09)
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
  v_serial text;
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
    returning t.id, t.holder_name, t.code, t.ticket_type_id, t.checked_in_at, t.batch_id, t.serial_no
  )
  select u.id, u.holder_name, u.code, tt.name, tt.requires_student_card, u.checked_in_at,
         public.print_serial_label(pb.prefix, u.serial_no)
  into v_ticket_id, v_holder, v_code, v_type_name, v_requires_card, v_checked_at, v_serial
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
      'serial', v_serial
    );
  end if;

  -- Not checked in: find out why
  select t.id, t.event_id, t.status, t.holder_name, t.code, tt.name, tt.requires_student_card, t.checked_in_at,
         public.print_serial_label(pb.prefix, t.serial_no)
  into v_ticket_id, v_ticket_event, v_status, v_holder, v_code, v_type_name, v_requires_card, v_checked_at, v_serial
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
  if v_result = 'cancelled' then
    return jsonb_build_object('result', v_result, 'serial', v_serial);
  end if;
  return jsonb_build_object('result', v_result);
end;
$$;

-- Scanner list: also the printed serial, so a damaged paper ticket can be
-- found by its number (PRT-09). Return type changes → drop + create.
drop function public.scanner_attendees(uuid);
create function public.scanner_attendees(p_event_id uuid)
returns table (
  ticket_id uuid,
  code text,
  holder_name text,
  ticket_type text,
  requires_student_card boolean,
  status public.ticket_status,
  checked_in_at timestamptz,
  serial text
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
    select t.id, t.code, t.holder_name, tt.name, tt.requires_student_card, t.status, t.checked_in_at,
           public.print_serial_label(pb.prefix, t.serial_no)
    from public.tickets t
    join public.ticket_types tt on tt.id = t.ticket_type_id
    left join public.print_batches pb on pb.id = t.batch_id
    where t.event_id = p_event_id and t.status <> 'cancelled'
    order by t.holder_name, t.serial_no nulls first, t.code;
end;
$$;

-- ---------------------------------------------------------------------------
-- event_stats: printed tickets per type (PRT-10)
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
  v_printed int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;

  select count(*) filter (where t.status = 'checked_in'),
         count(*) filter (where t.status in ('valid', 'checked_in')),
         count(*) filter (where t.source = 'printed' and t.status in ('valid', 'checked_in'))
  into v_checked_in, v_total, v_printed
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
    'printed_tickets', v_printed,
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
        'printed', (
          select count(*) from public.tickets t
          where t.ticket_type_id = tt.id and t.source = 'printed' and t.status <> 'cancelled'
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

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.print_serial_label(text, integer),
  public.print_design_problem(jsonb),
  public.create_print_batch(uuid, uuid, integer, text, jsonb, text, text),
  public.update_print_batch_design(uuid, jsonb),
  public.void_printed_tickets(uuid, integer, integer, text),
  public.set_printed_ticket_buyer(uuid, text, text),
  public.record_print_download(uuid, text),
  public.scanner_attendees(uuid)
from public, anon;

grant execute on function
  public.print_serial_label(text, integer),
  public.print_design_problem(jsonb),
  public.create_print_batch(uuid, uuid, integer, text, jsonb, text, text),
  public.update_print_batch_design(uuid, jsonb),
  public.void_printed_tickets(uuid, integer, integer, text),
  public.set_printed_ticket_buyer(uuid, text, text),
  public.record_print_download(uuid, text),
  public.scanner_attendees(uuid)
to authenticated, service_role;

-- ticket_type_taken, perform_check_in, ticket_types_guard and event_stats keep
-- their earlier grants (create or replace keeps privileges).

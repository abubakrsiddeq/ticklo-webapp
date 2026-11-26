-- =============================================================================
-- TickLO – sales and cash for printed tickets (SAL-01 .. SAL-09, D-041)
--
-- Printed ≠ sold. Every printed ticket now has a sale status:
--   in_stock  printed, with the organizer or a seller
--   sold      sold (cash / JazzCash / EasyPaisa / bank / card / other)
--   comp      free pass (guest, sponsor, team) – no revenue
--   returned  seller gave it back unsold → ticket is dead, its place goes back on sale
-- (voided tickets keep sale status in_stock with status = cancelled)
--
-- Sellers (team members or outside people with just a name/phone) get serial
-- ranges. They mark sales on their phone (scan the QR) or the organizer marks
-- ranges. A printed ticket that is scanned at the gate without being marked is
-- counted as sold automatically ("sold – found at gate"). Each seller has a
-- settlement: expected = sold × price, cash received (entries), difference,
-- and a lock.
--
-- Optional per batch: "require sale" – an unsold ticket is refused at the gate
-- ("not sold"), so stolen stock is worthless.
-- =============================================================================

alter type public.checkin_result add value if not exists 'not_sold';

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------
create table public.print_sellers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  phone text,
  settled_at timestamptz,
  settled_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_sellers_name_len check (char_length(name) between 1 and 80),
  constraint print_sellers_phone_len check (phone is null or char_length(phone) <= 20)
);
create index print_sellers_event_idx on public.print_sellers (event_id, created_at);
create unique index print_sellers_event_user_idx on public.print_sellers (event_id, user_id) where user_id is not null;
create trigger print_sellers_updated_at before update on public.print_sellers
  for each row execute function public.set_updated_at();

create table public.print_cash_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  seller_id uuid references public.print_sellers (id) on delete restrict,
  amount_paisa bigint not null,
  method text not null default 'cash',
  note text,
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint print_cash_amount check (amount_paisa <> 0 and abs(amount_paisa) <= 1000000000),
  constraint print_cash_method check (method in ('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'other')),
  constraint print_cash_note_len check (note is null or char_length(note) <= 200)
);
create index print_cash_entries_event_idx on public.print_cash_entries (event_id, created_at);
create index print_cash_entries_seller_idx on public.print_cash_entries (seller_id);

alter table public.print_batches
  add column require_sale boolean not null default false,
  add column printing_cost_paisa bigint not null default 0,
  add constraint print_batches_printing_cost check (printing_cost_paisa between 0 and 1000000000);

alter table public.tickets
  add column sale_status text,
  add column seller_id uuid references public.print_sellers (id) on delete set null,
  add column sold_at timestamptz,
  add column sold_by uuid references public.profiles (id) on delete set null,
  add column sale_method text,
  add column sale_source text,
  add column sale_price_paisa integer;

update public.tickets set sale_status = 'in_stock' where source = 'printed';

alter table public.tickets
  add constraint tickets_sale_status_check check (
    (source = 'online' and sale_status is null and seller_id is null)
    or (source = 'printed' and sale_status in ('in_stock', 'sold', 'comp', 'returned'))
  ),
  add constraint tickets_sale_method_check check (sale_method is null or sale_method in ('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'other')),
  add constraint tickets_sale_source_check check (sale_source is null or sale_source in ('marked', 'scan'));

create index tickets_seller_idx on public.tickets (seller_id) where seller_id is not null;

-- Printed tickets are created in_stock (create_print_batch inserts source = 'printed')
create or replace function public.tickets_default_sale_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'printed' and new.sale_status is null then
    new.sale_status := 'in_stock';
  end if;
  return new;
end;
$$;
create trigger tickets_default_sale_status before insert on public.tickets
  for each row execute function public.tickets_default_sale_status();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.print_sellers enable row level security;
alter table public.print_cash_entries enable row level security;

create policy print_sellers_read on public.print_sellers
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin() or user_id = (select auth.uid()));
create policy print_cash_entries_read on public.print_cash_entries
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin());

grant all on public.print_sellers, public.print_cash_entries to service_role;
grant select on public.print_sellers, public.print_cash_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Organizer of the event, or a (not settled) seller of the event who has an account
create or replace function public.can_sell_printed(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user(p_user_id) and (
    public.is_org_staff(public.event_org_id(p_event_id))
    or exists (
      select 1 from public.print_sellers s
      where s.event_id = p_event_id and s.user_id = p_user_id and s.settled_at is null
    )
  );
$$;

create or replace function public.print_staff_event(p_event_id uuid)
returns public.events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if auth.uid() is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can do that.';
  end if;
  return v_event;
end;
$$;

create or replace function public.print_check_range(p_from integer, p_to integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from < 1 or p_to < p_from or p_to - p_from >= 5000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid serial range (up to 5000 tickets at once).';
  end if;
end;
$$;

-- Seller locked after settlement?
create or replace function public.print_range_has_settled(p_event_id uuid, p_from integer, p_to integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tickets t
    join public.print_sellers s on s.id = t.seller_id
    where t.event_id = p_event_id and t.serial_no between p_from and p_to and s.settled_at is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- Sellers (SAL-01)
-- ---------------------------------------------------------------------------
create or replace function public.save_print_seller(
  p_event_id uuid,
  p_seller_id uuid,
  p_name text,
  p_phone text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_id uuid;
begin
  if p_user_id is not null then
    if not exists (select 1 from public.organization_members m where m.org_id = v_event.org_id and m.user_id = p_user_id) then
      raise exception using message = 'TL:NOT_A_MEMBER', detail = 'Only people in your team can sell with their own account. Add outside sellers by name.';
    end if;
    if v_name is null then
      select coalesce(p.full_name, p.email) into v_name from public.profiles p where p.id = p_user_id;
    end if;
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give the seller a name (up to 80 characters).';
  end if;
  if v_phone is not null and char_length(v_phone) > 20 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Phone number is too long.';
  end if;

  if p_seller_id is null then
    insert into public.print_sellers (event_id, user_id, name, phone, created_by)
    values (p_event_id, p_user_id, v_name, v_phone, auth.uid())
    returning id into v_id;
    perform public.audit('print_seller.create', 'event', p_event_id::text, jsonb_build_object('seller_id', v_id, 'name', v_name));
  else
    update public.print_sellers set name = v_name, phone = v_phone, user_id = p_user_id
    where id = p_seller_id and event_id = p_event_id
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Seller not found.';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'This team member is already a seller for this event.';
end;
$$;

create or replace function public.delete_print_seller(p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller public.print_sellers;
begin
  select * into v_seller from public.print_sellers where id = p_seller_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Seller not found.';
  end if;
  perform public.print_staff_event(v_seller.event_id);
  if exists (select 1 from public.tickets t where t.seller_id = p_seller_id)
     or exists (select 1 from public.print_cash_entries c where c.seller_id = p_seller_id) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This seller has tickets or cash entries. Move their tickets to someone else first.';
  end if;
  delete from public.print_sellers where id = p_seller_id;
  perform public.audit('print_seller.delete', 'event', v_seller.event_id::text, jsonb_build_object('name', v_seller.name));
end;
$$;

-- Give a serial range to a seller (or back to the organizer with p_seller_id = null).
-- Only unsold, valid tickets move (sold ones stay in their seller's settlement).
create or replace function public.assign_printed_tickets(p_event_id uuid, p_seller_id uuid, p_from integer, p_to integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_seller public.print_sellers;
  v_count int;
begin
  perform public.print_check_range(p_from, p_to);
  if p_seller_id is not null then
    select * into v_seller from public.print_sellers where id = p_seller_id and event_id = p_event_id;
    if not found then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Seller not found.';
    end if;
    if v_seller.settled_at is not null then
      raise exception using message = 'TL:SETTLED', detail = 'This seller''s account is closed. Reopen it first.';
    end if;
  end if;
  if public.print_range_has_settled(p_event_id, p_from, p_to) then
    raise exception using message = 'TL:SETTLED', detail = 'Some of these tickets belong to a seller whose account is closed.';
  end if;

  with moved as (
    update public.tickets
    set seller_id = p_seller_id
    where event_id = p_event_id and source = 'printed' and serial_no between p_from and p_to
      and status = 'valid' and sale_status = 'in_stock'
    returning 1
  )
  select count(*) into v_count from moved;

  perform public.audit('print_tickets.assign', 'event', p_event_id::text,
    jsonb_build_object('seller_id', p_seller_id, 'from', p_from, 'to', p_to, 'moved', v_count));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales (SAL-02, SAL-03)
-- ---------------------------------------------------------------------------

-- Internal: mark tickets of a range as sold / free pass. Organizers: any ticket.
-- Sellers: only tickets given to them. Tickets found sold at the gate get their
-- payment method filled in.
create or replace function public.printed_sale_apply(
  p_event_id uuid,
  p_from integer,
  p_to integer,
  p_method text,
  p_comp boolean,
  p_buyer_name text,
  p_buyer_phone text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean;
  v_method text := case when coalesce(p_comp, false) then null else coalesce(nullif(p_method, ''), 'cash') end;
  v_name text := nullif(btrim(coalesce(p_buyer_name, '')), '');
  v_phone text := nullif(btrim(coalesce(p_buyer_phone, '')), '');
  v_count int;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if not public.can_sell_printed(p_event_id, v_uid) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'You are not a seller for this event.';
  end if;
  if (select e.status from public.events e where e.id = p_event_id) = 'cancelled' then
    raise exception using message = 'TL:EVENT_CANCELLED', detail = 'This event has been cancelled.';
  end if;
  perform public.print_check_range(p_from, p_to);
  if v_method is not null and v_method not in ('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'other') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose how it was paid.';
  end if;
  if (v_name is not null and char_length(v_name) > 80) or (v_phone is not null and char_length(v_phone) > 20) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Name up to 80 and phone up to 20 characters.';
  end if;
  if public.print_range_has_settled(p_event_id, p_from, p_to) then
    raise exception using message = 'TL:SETTLED', detail = 'Some of these tickets belong to a seller whose account is closed.';
  end if;
  v_staff := public.is_org_staff(public.event_org_id(p_event_id));

  with sold as (
    update public.tickets t
    set sale_status = case when coalesce(p_comp, false) then 'comp' else 'sold' end,
        sale_method = v_method,
        sale_source = 'marked',
        sold_at = coalesce(t.sold_at, now()),
        sold_by = v_uid,
        sale_price_paisa = case when coalesce(p_comp, false) then 0 else tt.price_paisa end,
        holder_name = coalesce(v_name, t.holder_name),
        holder_phone = coalesce(v_phone, t.holder_phone)
    from public.ticket_types tt
    where tt.id = t.ticket_type_id
      and t.event_id = p_event_id and t.source = 'printed' and t.serial_no between p_from and p_to
      and t.status <> 'cancelled'
      and (t.sale_status = 'in_stock' or (t.sale_status = 'sold' and t.sale_source = 'scan'))
      and (v_staff or t.seller_id in (select s.id from public.print_sellers s where s.event_id = p_event_id and s.user_id = v_uid))
    returning 1
  )
  select count(*) into v_count from sold;

  perform public.audit(case when coalesce(p_comp, false) then 'print_tickets.comp' else 'print_tickets.sell' end, 'event', p_event_id::text,
    jsonb_build_object('from', p_from, 'to', p_to, 'count', v_count, 'method', v_method));
  return v_count;
end;
$$;

create or replace function public.mark_printed_sold(
  p_event_id uuid,
  p_from integer,
  p_to integer,
  p_method text default 'cash',
  p_comp boolean default false,
  p_buyer_name text default null,
  p_buyer_phone text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.printed_sale_apply(p_event_id, p_from, p_to, p_method, p_comp, p_buyer_name, p_buyer_phone);
$$;

-- Sell one ticket by its id (the seller scanned the QR; the server checked the signature).
-- Returns what the seller sees.
create or replace function public.sell_printed_ticket(
  p_ticket_id uuid,
  p_method text default 'cash',
  p_comp boolean default false,
  p_buyer_name text default null,
  p_buyer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_type public.ticket_types;
  v_prefix text;
  v_count int;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found or v_ticket.source <> 'printed' then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not public.can_sell_printed(v_ticket.event_id, auth.uid()) then
    return jsonb_build_object('result', 'not_allowed');
  end if;
  select * into v_type from public.ticket_types where id = v_ticket.ticket_type_id;
  select pb.prefix into v_prefix from public.print_batches pb where pb.id = v_ticket.batch_id;
  if v_ticket.status = 'cancelled' then
    return jsonb_build_object('result', case when v_ticket.sale_status = 'returned' then 'returned' else 'voided' end,
      'serial', public.print_serial_label(v_prefix, v_ticket.serial_no));
  end if;
  if v_ticket.sale_status in ('sold', 'comp') and coalesce(v_ticket.sale_source, '') <> 'scan' then
    return jsonb_build_object('result', 'already_sold', 'serial', public.print_serial_label(v_prefix, v_ticket.serial_no),
      'sale_status', v_ticket.sale_status, 'sold_at', v_ticket.sold_at);
  end if;
  v_count := public.printed_sale_apply(v_ticket.event_id, v_ticket.serial_no, v_ticket.serial_no, p_method, p_comp, p_buyer_name, p_buyer_phone);
  if v_count = 0 then
    return jsonb_build_object('result', 'not_yours', 'serial', public.print_serial_label(v_prefix, v_ticket.serial_no));
  end if;
  return jsonb_build_object(
    'result', 'ok',
    'serial', public.print_serial_label(v_prefix, v_ticket.serial_no),
    'ticket_type', v_type.name,
    'price_paisa', case when coalesce(p_comp, false) then 0 else v_type.price_paisa end,
    'comp', coalesce(p_comp, false)
  );
end;
$$;

-- Undo a sale/free pass that was marked by mistake (not for tickets already used at the gate).
create or replace function public.undo_printed_sale(p_event_id uuid, p_from integer, p_to integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_count int;
begin
  perform public.print_check_range(p_from, p_to);
  if public.print_range_has_settled(p_event_id, p_from, p_to) then
    raise exception using message = 'TL:SETTLED', detail = 'Some of these tickets belong to a seller whose account is closed.';
  end if;
  with undone as (
    update public.tickets
    set sale_status = 'in_stock', sale_method = null, sale_source = null, sold_at = null, sold_by = null, sale_price_paisa = null
    where event_id = p_event_id and source = 'printed' and serial_no between p_from and p_to
      and status = 'valid' and sale_status in ('sold', 'comp')
    returning 1
  )
  select count(*) into v_count from undone;
  perform public.audit('print_tickets.undo_sale', 'event', p_event_id::text, jsonb_build_object('from', p_from, 'to', p_to, 'count', v_count));
  return v_count;
end;
$$;

-- Seller gives unsold tickets back (SAL-04): the paper ticket stops working
-- and its place goes back on sale.
create or replace function public.return_printed_tickets(p_event_id uuid, p_from integer, p_to integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_count int;
begin
  perform public.print_check_range(p_from, p_to);
  if public.print_range_has_settled(p_event_id, p_from, p_to) then
    raise exception using message = 'TL:SETTLED', detail = 'Some of these tickets belong to a seller whose account is closed.';
  end if;
  with returned as (
    update public.tickets
    set sale_status = 'returned', status = 'cancelled', cancelled_at = now()
    where event_id = p_event_id and source = 'printed' and serial_no between p_from and p_to
      and status = 'valid' and sale_status = 'in_stock'
    returning 1
  )
  select count(*) into v_count from returned;
  perform public.audit('print_tickets.return', 'event', p_event_id::text,
    jsonb_build_object('from', p_from, 'to', p_to, 'count', v_count, 'note', left(p_note, 200)));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cash and settlement (SAL-05, SAL-06)
-- ---------------------------------------------------------------------------
create or replace function public.add_print_cash(p_event_id uuid, p_seller_id uuid, p_amount_paisa bigint, p_method text default 'cash', p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_seller public.print_sellers;
  v_id uuid;
begin
  if p_seller_id is not null then
    select * into v_seller from public.print_sellers where id = p_seller_id and event_id = p_event_id;
    if not found then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Seller not found.';
    end if;
    if v_seller.settled_at is not null then
      raise exception using message = 'TL:SETTLED', detail = 'This seller''s account is closed. Reopen it first.';
    end if;
  end if;
  if p_amount_paisa is null or p_amount_paisa = 0 or abs(p_amount_paisa) > 1000000000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter an amount (a minus amount corrects a mistake).';
  end if;
  if coalesce(p_method, 'cash') not in ('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'other') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose how the money came in.';
  end if;
  insert into public.print_cash_entries (event_id, seller_id, amount_paisa, method, note, received_by)
  values (p_event_id, p_seller_id, p_amount_paisa, coalesce(p_method, 'cash'), nullif(left(btrim(coalesce(p_note, '')), 200), ''), auth.uid())
  returning id into v_id;
  perform public.audit('print_cash.add', 'event', p_event_id::text,
    jsonb_build_object('seller_id', p_seller_id, 'amount_paisa', p_amount_paisa, 'method', coalesce(p_method, 'cash')));
  return v_id;
end;
$$;

create or replace function public.delete_print_cash(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.print_cash_entries;
begin
  select * into v_entry from public.print_cash_entries where id = p_entry_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Entry not found.';
  end if;
  perform public.print_staff_event(v_entry.event_id);
  if v_entry.seller_id is not null and exists (select 1 from public.print_sellers s where s.id = v_entry.seller_id and s.settled_at is not null) then
    raise exception using message = 'TL:SETTLED', detail = 'This seller''s account is closed. Reopen it first.';
  end if;
  delete from public.print_cash_entries where id = p_entry_id;
  perform public.audit('print_cash.delete', 'event', v_entry.event_id::text,
    jsonb_build_object('seller_id', v_entry.seller_id, 'amount_paisa', v_entry.amount_paisa));
end;
$$;

-- Close (lock) or reopen a seller's account.
create or replace function public.settle_print_seller(p_seller_id uuid, p_close boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller public.print_sellers;
begin
  select * into v_seller from public.print_sellers where id = p_seller_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Seller not found.';
  end if;
  perform public.print_staff_event(v_seller.event_id);
  update public.print_sellers
  set settled_at = case when p_close then now() else null end,
      settled_by = case when p_close then auth.uid() else null end
  where id = p_seller_id;
  perform public.audit(case when p_close then 'print_seller.settle' else 'print_seller.reopen' end, 'event', v_seller.event_id::text,
    jsonb_build_object('seller_id', p_seller_id, 'name', v_seller.name));
end;
$$;

create or replace function public.set_print_batch_options(p_batch_id uuid, p_require_sale boolean, p_printing_cost_paisa bigint)
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
  perform public.print_staff_event(v_batch.event_id);
  if p_printing_cost_paisa is null or p_printing_cost_paisa < 0 or p_printing_cost_paisa > 1000000000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid printing cost.';
  end if;
  update public.print_batches set require_sale = coalesce(p_require_sale, false), printing_cost_paisa = p_printing_cost_paisa where id = p_batch_id;
  perform public.audit('print_batch.options', 'event', v_batch.event_id::text,
    jsonb_build_object('batch_id', p_batch_id, 'require_sale', p_require_sale, 'printing_cost_paisa', p_printing_cost_paisa));
end;
$$;

-- ---------------------------------------------------------------------------
-- Seller's own view (SAL-03): events I can sell for, and my stock
-- ---------------------------------------------------------------------------
create or replace function public.my_sell_events()
returns table (event_id uuid, event_name text, event_slug text, org_name text, org_slug text, starts_at timestamptz, access text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.slug, o.name, o.slug, e.starts_at,
         case when public.is_org_staff(e.org_id) then 'organizer' else 'seller' end
  from public.events e
  join public.organizations o on o.id = e.org_id
  where e.status = 'published' and now() <= e.ends_at + interval '6 hours'
    and exists (select 1 from public.print_batches pb where pb.event_id = e.id)
    and public.can_sell_printed(e.id, auth.uid())
  order by e.starts_at;
$$;

create or replace function public.my_print_stock(p_event_id uuid)
returns table (serial text, serial_no integer, ticket_type text, price_paisa integer, sale_status text, status public.ticket_status, sale_method text, sold_at timestamptz, seller_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff boolean;
begin
  if not public.can_sell_printed(p_event_id, auth.uid()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'You are not a seller for this event.';
  end if;
  v_staff := public.is_org_staff(public.event_org_id(p_event_id));
  return query
    select public.print_serial_label(pb.prefix, t.serial_no), t.serial_no, tt.name, tt.price_paisa, t.sale_status, t.status, t.sale_method, t.sold_at, s.name
    from public.tickets t
    join public.print_batches pb on pb.id = t.batch_id
    join public.ticket_types tt on tt.id = t.ticket_type_id
    left join public.print_sellers s on s.id = t.seller_id
    where t.event_id = p_event_id and t.source = 'printed'
      and (case when v_staff then true else s.user_id = auth.uid() end)
    order by t.serial_no;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in: "require sale" batches refuse unsold tickets; a scanned unsold
-- ticket of a normal batch counts as sold (found at the gate)
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

-- ---------------------------------------------------------------------------
-- event_stats: printed sales and cash (SAL-08)
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
  v_printed_sold int;
  v_printed_comp int;
  v_printed_revenue bigint;
  v_online int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;

  select count(*) filter (where t.status = 'checked_in'),
         count(*) filter (where t.status in ('valid', 'checked_in')),
         count(*) filter (where t.source = 'printed' and t.status in ('valid', 'checked_in')),
         -- a sold ticket that was voided later (buyer lost it) was still paid for
         count(*) filter (where t.source = 'printed' and t.sale_status = 'sold'),
         count(*) filter (where t.source = 'printed' and t.sale_status = 'comp'),
         coalesce(sum(t.sale_price_paisa) filter (where t.source = 'printed' and t.sale_status = 'sold'), 0),
         count(*) filter (where t.source = 'online' and t.status in ('valid', 'checked_in'))
  into v_checked_in, v_total, v_printed, v_printed_sold, v_printed_comp, v_printed_revenue, v_online
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
    'online_tickets', v_online,
    'printed_tickets', v_printed,
    'printed_sold', v_printed_sold,
    'printed_comp', v_printed_comp,
    'printed_revenue_paisa', v_printed_revenue,
    'printed_cash_paisa', (select coalesce(sum(c.amount_paisa), 0) from public.print_cash_entries c where c.event_id = p_event_id),
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
        'printed_sold', (
          select count(*) from public.tickets t
          where t.ticket_type_id = tt.id and t.source = 'printed' and t.sale_status in ('sold', 'comp')
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
  public.tickets_default_sale_status(),
  public.print_staff_event(uuid),
  public.print_check_range(integer, integer),
  public.print_range_has_settled(uuid, integer, integer),
  public.printed_sale_apply(uuid, integer, integer, text, boolean, text, text)
from public, anon, authenticated;

revoke execute on function
  public.can_sell_printed(uuid, uuid),
  public.save_print_seller(uuid, uuid, text, text, uuid),
  public.delete_print_seller(uuid),
  public.assign_printed_tickets(uuid, uuid, integer, integer),
  public.mark_printed_sold(uuid, integer, integer, text, boolean, text, text),
  public.sell_printed_ticket(uuid, text, boolean, text, text),
  public.undo_printed_sale(uuid, integer, integer),
  public.return_printed_tickets(uuid, integer, integer, text),
  public.add_print_cash(uuid, uuid, bigint, text, text),
  public.delete_print_cash(uuid),
  public.settle_print_seller(uuid, boolean),
  public.set_print_batch_options(uuid, boolean, bigint),
  public.my_sell_events(),
  public.my_print_stock(uuid)
from public, anon;

grant execute on function
  public.can_sell_printed(uuid, uuid),
  public.save_print_seller(uuid, uuid, text, text, uuid),
  public.delete_print_seller(uuid),
  public.assign_printed_tickets(uuid, uuid, integer, integer),
  public.mark_printed_sold(uuid, integer, integer, text, boolean, text, text),
  public.sell_printed_ticket(uuid, text, boolean, text, text),
  public.undo_printed_sale(uuid, integer, integer),
  public.return_printed_tickets(uuid, integer, integer, text),
  public.add_print_cash(uuid, uuid, bigint, text, text),
  public.delete_print_cash(uuid),
  public.settle_print_seller(uuid, boolean),
  public.set_print_batch_options(uuid, boolean, bigint),
  public.my_sell_events(),
  public.my_print_stock(uuid)
to authenticated, service_role;

grant execute on function
  public.print_staff_event(uuid),
  public.print_check_range(integer, integer),
  public.print_range_has_settled(uuid, integer, integer),
  public.printed_sale_apply(uuid, integer, integer, text, boolean, text, text)
to service_role;

-- =============================================================================
-- TickLO – ambassadors, referral links, promo codes, rewards (AMB-01 .. AMB-14, D-043)
--
-- One person = one seller row (print_sellers) per event. The same person sells
-- paper tickets (D-041) AND brings online buyers with a personal link / code:
--   /e/<society>/<event>?ref=ALI   or the code ALI typed at checkout.
--
-- * Credit: an order is linked to the ambassador when it is created and never
--   changes. It counts only when the order is approved (or, if the organizer
--   chooses, only for tickets scanned at the gate). Rejected / expired /
--   cancelled orders drop out on their own because every number is computed
--   from the live order and ticket status.
-- * Rewards are calculated by TickLO but paid by the society (TickLO never
--   holds money): fixed rupees per ticket or a percent of the money, plus
--   milestones ("10 tickets → free ticket"). Payouts are recorded entries.
-- * Discounts: an ambassador link/code can give the buyer a discount, and the
--   organizer can make promo codes (fixed off each ticket or percent, limits,
--   dates, ticket types, minimum tickets for group deals). One discount per
--   order – the bigger one wins.
-- * Students can apply to become ambassadors; organizers approve.
-- * TickLO campus ambassadors (platform level) bring new societies with a code.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Last 10 digits of a Pakistani number, so 0300…, +92300… and 92300… match
create or replace function public.phone_key(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10), '');
$$;

-- Codes are upper case letters and digits only ("ali-10" → "ALI10")
create or replace function public.normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

-- Ambassador code on the seller row
alter table public.print_sellers
  add column ref_code text,
  add column joined_via text not null default 'organizer',
  add constraint print_sellers_ref_code_format check (ref_code ~ '^[A-Z0-9]{3,16}$'),
  add constraint print_sellers_joined_via check (joined_via in ('organizer', 'application'));

-- Program settings per event (no row = defaults)
create table public.referral_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
  reward_type text not null default 'none',
  reward_value integer not null default 0,          -- paisa per ticket, or whole percent
  discount_type text not null default 'none',
  discount_value integer not null default 0,        -- paisa off each ticket, or whole percent
  credit_on text not null default 'approved',
  leaderboard boolean not null default true,
  applications_open boolean not null default false,
  milestones jsonb not null default '[]'::jsonb,    -- [{"tickets": 10, "reward": "Free ticket"}]
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint referral_settings_reward_type check (reward_type in ('none', 'fixed', 'percent')),
  constraint referral_settings_discount_type check (discount_type in ('none', 'fixed', 'percent')),
  constraint referral_settings_reward_value check (
    reward_value >= 0 and (reward_type <> 'percent' or reward_value <= 100) and reward_value <= 100000000
  ),
  constraint referral_settings_discount_value check (
    discount_value >= 0 and (discount_type <> 'percent' or discount_value <= 100) and discount_value <= 100000000
  ),
  constraint referral_settings_credit_on check (credit_on in ('approved', 'checked_in')),
  constraint referral_settings_milestones check (jsonb_typeof(milestones) = 'array')
);
create trigger referral_settings_updated_at before update on public.referral_settings
  for each row execute function public.set_updated_at();

-- Promo codes
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null,
  discount_type text not null,
  discount_value integer not null,
  max_uses integer,
  min_tickets integer not null default 1,
  ticket_type_ids uuid[],
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_code_format check (code ~ '^[A-Z0-9]{3,16}$'),
  constraint promo_codes_discount_type check (discount_type in ('fixed', 'percent')),
  constraint promo_codes_discount_value check (
    discount_value > 0 and (discount_type <> 'percent' or discount_value <= 100) and discount_value <= 100000000
  ),
  constraint promo_codes_max_uses check (max_uses is null or max_uses between 1 and 100000),
  constraint promo_codes_min_tickets check (min_tickets between 1 and 50),
  constraint promo_codes_dates check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint promo_codes_note_len check (note is null or char_length(note) <= 120)
);
create unique index promo_codes_event_code_idx on public.promo_codes (event_id, code);
create trigger promo_codes_updated_at before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- Orders remember who brought them and which discount was used
alter table public.orders
  add column seller_id uuid references public.print_sellers (id) on delete set null,
  add column referral_source text,
  add column promo_code_id uuid references public.promo_codes (id) on delete set null,
  add column discount_paisa bigint not null default 0,
  add constraint orders_referral_source check (referral_source is null or referral_source in ('link', 'code')),
  add constraint orders_discount_nonneg check (discount_paisa >= 0);
create index orders_seller_idx on public.orders (seller_id) where seller_id is not null;
create index orders_promo_idx on public.orders (promo_code_id) where promo_code_id is not null;

-- Link opens per ambassador per day (one row per day keeps the free tier small)
create table public.referral_clicks (
  seller_id uuid not null references public.print_sellers (id) on delete cascade,
  day date not null,
  clicks integer not null default 0,
  primary key (seller_id, day)
);

-- Rewards handed over by the society (amount can be 0 for a pass / gift)
create table public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  seller_id uuid not null references public.print_sellers (id) on delete restrict,
  amount_paisa bigint not null default 0,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint referral_payouts_amount check (abs(amount_paisa) <= 1000000000),
  constraint referral_payouts_note_len check (note is null or char_length(note) <= 200),
  constraint referral_payouts_something check (amount_paisa <> 0 or note is not null)
);
create index referral_payouts_event_idx on public.referral_payouts (event_id, created_at);
create index referral_payouts_seller_idx on public.referral_payouts (seller_id);

-- "Become an ambassador" applications
create table public.ambassador_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text,
  status text not null default 'pending',
  seller_id uuid references public.print_sellers (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ambassador_applications_status check (status in ('pending', 'approved', 'rejected')),
  constraint ambassador_applications_message_len check (message is null or char_length(message) <= 500)
);
create unique index ambassador_applications_event_user_idx on public.ambassador_applications (event_id, user_id);
create index ambassador_applications_event_status_idx on public.ambassador_applications (event_id, status);

-- TickLO campus ambassadors (bring new societies to TickLO)
create table public.campus_ambassadors (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null,
  university_id uuid references public.universities (id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campus_ambassadors_code_format check (code ~ '^[A-Z0-9]{3,16}$')
);
create unique index campus_ambassadors_code_idx on public.campus_ambassadors (code);

alter table public.organizations
  add column referred_by uuid references public.campus_ambassadors (user_id) on delete set null,
  add column referred_at timestamptz;
create index organizations_referred_by_idx on public.organizations (referred_by) where referred_by is not null;

-- ---------------------------------------------------------------------------
-- Ambassador codes for sellers: made from the name, unique per event and never
-- the same as a promo code of that event
-- ---------------------------------------------------------------------------
create or replace function public.event_code_taken(p_event_id uuid, p_code text, p_except_seller uuid default null, p_except_promo uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.print_sellers s
    where s.event_id = p_event_id and s.ref_code = p_code and s.id is distinct from p_except_seller
  ) or exists (
    select 1 from public.promo_codes pc
    where pc.event_id = p_event_id and pc.code = p_code and pc.id is distinct from p_except_promo
  );
$$;

create or replace function public.generate_seller_code(p_event_id uuid, p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_code text;
  i int := 0;
begin
  -- first word of the name, letters/digits only, at most 8 characters
  v_base := left(coalesce(public.normalize_code(split_part(btrim(coalesce(p_name, '')), ' ', 1)), ''), 8);
  if char_length(v_base) < 3 then
    v_base := left(coalesce(public.normalize_code(p_name), '') || 'AMB', 8);
  end if;
  v_code := v_base;
  while public.event_code_taken(p_event_id, v_code) loop
    i := i + 1;
    v_code := v_base || (case when i < 20 then (i + 1)::text else lpad((floor(random() * 10000))::int::text, 4, '0') end);
  end loop;
  return v_code;
end;
$$;

create or replace function public.print_sellers_default_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ref_code is null then
    new.ref_code := public.generate_seller_code(new.event_id, new.name);
  end if;
  return new;
end;
$$;
create trigger print_sellers_default_code before insert on public.print_sellers
  for each row execute function public.print_sellers_default_code();

-- Existing sellers get their codes now
do $$
declare
  r record;
begin
  for r in select id, event_id, name from public.print_sellers where ref_code is null order by created_at loop
    update public.print_sellers set ref_code = public.generate_seller_code(r.event_id, r.name) where id = r.id;
  end loop;
end;
$$;

alter table public.print_sellers alter column ref_code set not null;
create unique index print_sellers_event_code_idx on public.print_sellers (event_id, ref_code);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.referral_settings enable row level security;
alter table public.promo_codes enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.referral_payouts enable row level security;
alter table public.ambassador_applications enable row level security;
alter table public.campus_ambassadors enable row level security;

create policy referral_settings_read on public.referral_settings
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin());
create policy promo_codes_read on public.promo_codes
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin());
create policy referral_clicks_read on public.referral_clicks
  for select to authenticated
  using (exists (
    select 1 from public.print_sellers s
    where s.id = seller_id and (public.is_event_staff(s.event_id) or s.user_id = (select auth.uid()) or public.is_admin())
  ));
create policy referral_payouts_read on public.referral_payouts
  for select to authenticated
  using (
    public.is_event_staff(event_id) or public.is_admin()
    or exists (select 1 from public.print_sellers s where s.id = seller_id and s.user_id = (select auth.uid()))
  );
create policy ambassador_applications_read on public.ambassador_applications
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_staff(event_id) or public.is_admin());
create policy campus_ambassadors_read on public.campus_ambassadors
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

grant all on public.referral_settings, public.promo_codes, public.referral_clicks, public.referral_payouts,
  public.ambassador_applications, public.campus_ambassadors to service_role;
grant select on public.referral_settings, public.promo_codes, public.referral_clicks, public.referral_payouts,
  public.ambassador_applications, public.campus_ambassadors to authenticated;

-- ---------------------------------------------------------------------------
-- Discount maths (AMB-07). Fixed = rupees off EACH ticket (never more than the
-- ticket price); percent = whole percent of the ticket price, rounded per ticket.
-- p_items: [{"ticket_type_id": "...", "quantity": 2}], prices from ticket_types.
-- ---------------------------------------------------------------------------
create or replace function public.discount_for(p_items jsonb, p_type text, p_value integer, p_type_ids uuid[] default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    (e ->> 'quantity')::int::bigint * case p_type
      when 'fixed' then least(p_value, tt.price_paisa)
      when 'percent' then round(tt.price_paisa::numeric * p_value / 100)::bigint
      else 0
    end
  ), 0)::bigint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  join public.ticket_types tt on tt.id = (e ->> 'ticket_type_id')::uuid
  where p_type in ('fixed', 'percent') and (p_type_ids is null or tt.id = any (p_type_ids));
$$;

-- How many orders use a promo code right now (held, in review or approved)
create or replace function public.promo_code_uses(p_promo_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.orders o
  where o.promo_code_id = p_promo_id
    and (o.status in ('approved', 'under_review') or (o.status = 'awaiting_payment' and o.hold_expires_at > now()));
$$;

-- ---------------------------------------------------------------------------
-- Public: what does this code / link give? (AMB-03) – used before booking to
-- show "Ali sent you · Rs 100 off" and to check a typed code.
-- ---------------------------------------------------------------------------
create or replace function public.referral_preview(p_event_id uuid, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := public.normalize_code(p_code);
  v_event public.events;
  v_promo public.promo_codes;
  v_seller public.print_sellers;
  v_cfg public.referral_settings;
begin
  if v_code is null then
    return null;
  end if;
  select * into v_event from public.events where id = p_event_id and status = 'published';
  if not found then
    return null;
  end if;

  select * into v_promo from public.promo_codes where event_id = p_event_id and code = v_code;
  if found then
    if not v_promo.active then
      return jsonb_build_object('kind', 'promo', 'code', v_code, 'valid', false, 'reason', 'This code is turned off.');
    end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then
      return jsonb_build_object('kind', 'promo', 'code', v_code, 'valid', false, 'reason', 'This code is not active yet.');
    end if;
    if v_promo.ends_at is not null and now() >= v_promo.ends_at then
      return jsonb_build_object('kind', 'promo', 'code', v_code, 'valid', false, 'reason', 'This code has expired.');
    end if;
    if v_promo.max_uses is not null and public.promo_code_uses(v_promo.id) >= v_promo.max_uses then
      return jsonb_build_object('kind', 'promo', 'code', v_code, 'valid', false, 'reason', 'This code has been used up.');
    end if;
    return jsonb_build_object(
      'kind', 'promo', 'code', v_code, 'valid', true,
      'discount_type', v_promo.discount_type, 'discount_value', v_promo.discount_value,
      'min_tickets', v_promo.min_tickets, 'ticket_type_ids', to_jsonb(v_promo.ticket_type_ids)
    );
  end if;

  select * into v_seller from public.print_sellers where event_id = p_event_id and ref_code = v_code;
  if found then
    if v_seller.settled_at is not null then
      return jsonb_build_object('kind', 'ambassador', 'code', v_code, 'valid', false, 'reason', 'This ambassador code is no longer active.');
    end if;
    select * into v_cfg from public.referral_settings where event_id = p_event_id;
    return jsonb_build_object(
      'kind', 'ambassador', 'code', v_code, 'valid', true,
      'name', split_part(btrim(v_seller.name), ' ', 1),
      'discount_type', coalesce(v_cfg.discount_type, 'none'), 'discount_value', coalesce(v_cfg.discount_value, 0),
      'min_tickets', 1, 'ticket_type_ids', null
    );
  end if;

  return jsonb_build_object('kind', null, 'code', v_code, 'valid', false, 'reason', 'This code is not valid for this event.');
end;
$$;

-- Count a link open (AMB-03). Best effort; returns nothing useful on purpose.
create or replace function public.track_referral_click(p_event_id uuid, p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_seller_id uuid;
begin
  select s.id into v_seller_id
  from public.print_sellers s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event_id and s.ref_code = public.normalize_code(p_code)
    and s.settled_at is null and e.status = 'published';
  if v_seller_id is null then
    return;
  end if;
  insert into public.referral_clicks (seller_id, day, clicks)
  values (v_seller_id, (now() at time zone 'Asia/Karachi')::date, 1)
  on conflict (seller_id, day) do update
    set clicks = least(public.referral_clicks.clicks + 1, 100000);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order with codes (PAY-01, PAY-02, PAY-12, AUTH-06, rules 1-3, AMB-04,
-- AMB-07, AMB-12). p_code = what the buyer typed (promo or ambassador code),
-- p_ref = ambassador code remembered from a link (7 days, in a cookie).
-- ---------------------------------------------------------------------------
drop function public.create_order(uuid, jsonb, text, text);

create or replace function public.create_order(
  p_event_id uuid,
  p_items jsonb,
  p_buyer_name text default null,
  p_buyer_phone text default null,
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
      'total_paisa', v_existing.total_paisa, 'discount_paisa', v_existing.discount_paisa, 'existing', true
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
      from jsonb_array_elements(p_items) e
      where v_promo.ticket_type_ids is null or (e ->> 'ticket_type_id')::uuid = any (v_promo.ticket_type_ids);
      if v_eligible_qty = 0 then
        raise exception using message = 'TL:INVALID_CODE', detail = 'This code does not work for the tickets you chose.';
      end if;
      if v_eligible_qty < v_promo.min_tickets then
        raise exception using message = 'TL:INVALID_CODE',
          detail = format('Choose at least %s tickets to use this code.', v_promo.min_tickets);
      end if;
      v_promo_discount := public.discount_for(p_items, v_promo.discount_type, v_promo.discount_value, v_promo.ticket_type_ids);
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

  -- A remembered link counts when no ambassador code was typed (silently ignored if it is not valid)
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
      v_seller_discount := public.discount_for(p_items, v_cfg.discount_type, v_cfg.discount_value, null);
    end if;
  end if;

  -- One discount per order: the bigger one
  if v_promo.id is not null and v_promo_discount >= v_seller_discount then
    v_discount := v_promo_discount;
    v_promo_id := v_promo.id;
  else
    v_discount := v_seller_discount;
  end if;
  v_discount := least(v_discount, v_total);
  v_total := v_total - v_discount;

  -- PAY-12 free tickets are issued at once (D-009: unless a student card must be checked)
  v_status := case
    when v_total = 0 and not v_requires_card then 'approved'::public.order_status
    else 'awaiting_payment'::public.order_status
  end;

  v_ref := public.generate_ref_code();
  insert into public.orders (
    ref_code, event_id, user_id, status, total_paisa, ticket_count, requires_student_card,
    hold_expires_at, buyer_name, buyer_email, buyer_phone, approved_at, decided_at,
    seller_id, referral_source, promo_code_id, discount_paisa
  )
  values (
    v_ref, p_event_id, v_uid, v_status, v_total, v_total_qty, v_requires_card,
    case when v_status = 'awaiting_payment' then now() + interval '60 minutes' end,
    v_profile.full_name, v_profile.email, v_profile.phone,
    case when v_status = 'approved' then now() end,
    case when v_status = 'approved' then now() end,
    v_seller.id, v_source, v_promo_id, v_discount
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
    'total_paisa', v_total, 'discount_paisa', v_discount, 'existing', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The numbers per ambassador (AMB-05, AMB-06, AMB-08, AMB-12). Internal –
-- callers below check who is asking.
-- ---------------------------------------------------------------------------
create or replace function public.ambassador_rows(p_event_id uuid)
returns table (
  seller_id uuid,
  name text,
  phone text,
  user_id uuid,
  ref_code text,
  joined_via text,
  settled_at timestamptz,
  clicks integer,
  pending_tickets integer,
  online_orders integer,
  online_tickets integer,
  online_checked_in integer,
  online_revenue_paisa bigint,
  discount_paisa bigint,
  paper_sold integer,
  paper_used integer,
  paper_revenue_paisa bigint,
  credited_tickets integer,
  credited_revenue_paisa bigint,
  reward_paisa bigint,
  paid_paisa bigint,
  max_orders_same_phone integer,
  rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select coalesce(r.reward_type, 'none') as reward_type,
           coalesce(r.reward_value, 0) as reward_value,
           coalesce(r.credit_on, 'approved') as credit_on
    from (select 1) one
    left join public.referral_settings r on r.event_id = p_event_id
  ),
  s as (
    select * from public.print_sellers ps where ps.event_id = p_event_id
  ),
  clk as (
    select c.seller_id, sum(c.clicks)::int as clicks
    from public.referral_clicks c join s on s.id = c.seller_id
    group by c.seller_id
  ),
  ord as (
    select o.seller_id,
           coalesce(sum(o.ticket_count) filter (
             where o.status = 'under_review' or (o.status = 'awaiting_payment' and o.hold_expires_at > now())
           ), 0)::int as pending_tickets,
           count(*) filter (where o.status = 'approved')::int as online_orders,
           coalesce(sum(o.ticket_count) filter (where o.status = 'approved'), 0)::int as online_tickets,
           coalesce(sum(o.total_paisa) filter (where o.status = 'approved'), 0)::bigint as online_revenue,
           coalesce(sum(o.discount_paisa) filter (where o.status = 'approved'), 0)::bigint as discount
    from public.orders o
    where o.event_id = p_event_id and o.seller_id is not null
    group by o.seller_id
  ),
  oin as (
    select o.seller_id, count(*)::int as n,
           round(coalesce(sum(o.total_paisa::numeric / o.ticket_count), 0))::bigint as rev
    from public.tickets t
    join public.orders o on o.id = t.order_id
    where o.event_id = p_event_id and o.seller_id is not null and o.status = 'approved' and t.status = 'checked_in'
    group by o.seller_id
  ),
  pap as (
    select t.seller_id,
           count(*) filter (where t.sale_status = 'sold')::int as sold,
           count(*) filter (where t.sale_status = 'sold' and t.status = 'checked_in')::int as used,
           coalesce(sum(t.sale_price_paisa) filter (where t.sale_status = 'sold'), 0)::bigint as rev,
           coalesce(sum(t.sale_price_paisa) filter (where t.sale_status = 'sold' and t.status = 'checked_in'), 0)::bigint as used_rev
    from public.tickets t
    where t.event_id = p_event_id and t.source = 'printed' and t.seller_id is not null
    group by t.seller_id
  ),
  ph as (
    select x.seller_id, max(x.n)::int as mx
    from (
      select o.seller_id, public.phone_key(o.buyer_phone) as k, count(*) as n
      from public.orders o
      where o.event_id = p_event_id and o.seller_id is not null and o.status in ('approved', 'under_review')
        and public.phone_key(o.buyer_phone) is not null
      group by o.seller_id, public.phone_key(o.buyer_phone)
    ) x
    group by x.seller_id
  ),
  pay as (
    select rp.seller_id, coalesce(sum(rp.amount_paisa), 0)::bigint as paid
    from public.referral_payouts rp
    where rp.event_id = p_event_id
    group by rp.seller_id
  ),
  base as (
    select s.id, s.name, s.phone, s.user_id, s.ref_code, s.joined_via, s.settled_at, s.created_at,
           coalesce(clk.clicks, 0) as clicks,
           coalesce(ord.pending_tickets, 0) as pending_tickets,
           coalesce(ord.online_orders, 0) as online_orders,
           coalesce(ord.online_tickets, 0) as online_tickets,
           coalesce(oin.n, 0) as online_checked_in,
           coalesce(ord.online_revenue, 0)::bigint as online_revenue,
           coalesce(ord.discount, 0)::bigint as discount,
           coalesce(pap.sold, 0) as paper_sold,
           coalesce(pap.used, 0) as paper_used,
           coalesce(pap.rev, 0)::bigint as paper_revenue,
           case when cfg.credit_on = 'checked_in'
             then coalesce(oin.n, 0) + coalesce(pap.used, 0)
             else coalesce(ord.online_tickets, 0) + coalesce(pap.sold, 0)
           end as credited_tickets,
           case when cfg.credit_on = 'checked_in'
             then coalesce(oin.rev, 0) + coalesce(pap.used_rev, 0)
             else coalesce(ord.online_revenue, 0) + coalesce(pap.rev, 0)
           end::bigint as credited_revenue,
           cfg.reward_type, cfg.reward_value,
           coalesce(pay.paid, 0)::bigint as paid,
           coalesce(ph.mx, 0) as mx
    from s
    cross join cfg
    left join clk on clk.seller_id = s.id
    left join ord on ord.seller_id = s.id
    left join oin on oin.seller_id = s.id
    left join pap on pap.seller_id = s.id
    left join ph on ph.seller_id = s.id
    left join pay on pay.seller_id = s.id
  )
  select b.id, b.name, b.phone, b.user_id, b.ref_code, b.joined_via, b.settled_at,
         b.clicks, b.pending_tickets, b.online_orders, b.online_tickets, b.online_checked_in,
         b.online_revenue, b.discount, b.paper_sold, b.paper_used, b.paper_revenue,
         b.credited_tickets, b.credited_revenue,
         (case b.reward_type
            when 'fixed' then b.credited_tickets::bigint * b.reward_value
            when 'percent' then round(b.credited_revenue::numeric * b.reward_value / 100)::bigint
            else 0
          end)::bigint,
         b.paid, b.mx,
         (rank() over (order by b.credited_tickets desc))::int
  from base b
  order by b.credited_tickets desc, b.created_at;
$$;

-- Organizer view (AMB-08)
create or replace function public.ambassador_summary(p_event_id uuid)
returns table (
  seller_id uuid, name text, phone text, user_id uuid, ref_code text, joined_via text, settled_at timestamptz,
  clicks integer, pending_tickets integer, online_orders integer, online_tickets integer, online_checked_in integer,
  online_revenue_paisa bigint, discount_paisa bigint, paper_sold integer, paper_used integer, paper_revenue_paisa bigint,
  credited_tickets integer, credited_revenue_paisa bigint, reward_paisa bigint, paid_paisa bigint,
  max_orders_same_phone integer, rank integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_event_staff(p_event_id) or public.is_admin()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this event can see ambassadors.';
  end if;
  return query select * from public.ambassador_rows(p_event_id);
end;
$$;

-- Leaderboard names: first name + initial ("Ali K.")
create or replace function public.short_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when position(' ' in btrim(coalesce(p_name, ''))) = 0 then btrim(coalesce(p_name, ''))
    else split_part(btrim(p_name), ' ', 1) || ' ' || upper(left(split_part(btrim(p_name), ' ', 2), 1)) || '.'
  end;
$$;

-- Ambassador's own screen (AMB-05, AMB-06)
create or replace function public.my_ambassador_stats(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_seller public.print_sellers;
  v_event public.events;
  v_org public.organizations;
  v_cfg public.referral_settings;
  v_me jsonb;
  v_board jsonb := '[]'::jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  select * into v_seller from public.print_sellers where event_id = p_event_id and user_id = v_uid;
  if not found then
    raise exception using message = 'TL:FORBIDDEN', detail = 'You are not an ambassador for this event.';
  end if;
  select * into v_event from public.events where id = p_event_id;
  select * into v_org from public.organizations where id = v_event.org_id;
  select * into v_cfg from public.referral_settings where event_id = p_event_id;

  select to_jsonb(r) into v_me from public.ambassador_rows(p_event_id) r where r.seller_id = v_seller.id;
  select count(*) into v_count from public.print_sellers where event_id = p_event_id;

  if coalesce(v_cfg.leaderboard, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank, 'name', public.short_name(r.name), 'tickets', r.credited_tickets, 'me', r.seller_id = v_seller.id
    ) order by r.rank, r.name), '[]'::jsonb)
    into v_board
    from (
      select * from public.ambassador_rows(p_event_id) x
      where (x.credited_tickets > 0 and x.rank <= 10) or x.seller_id = v_seller.id
      order by x.rank, x.name
      limit 15
    ) r;
  end if;

  return jsonb_build_object(
    'me', v_me - 'phone' - 'max_orders_same_phone',
    'ambassadors', v_count,
    'board', v_board,
    'settings', jsonb_build_object(
      'reward_type', coalesce(v_cfg.reward_type, 'none'),
      'reward_value', coalesce(v_cfg.reward_value, 0),
      'discount_type', coalesce(v_cfg.discount_type, 'none'),
      'discount_value', coalesce(v_cfg.discount_value, 0),
      'credit_on', coalesce(v_cfg.credit_on, 'approved'),
      'leaderboard', coalesce(v_cfg.leaderboard, true),
      'milestones', coalesce(v_cfg.milestones, '[]'::jsonb)
    ),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object('amount_paisa', rp.amount_paisa, 'note', rp.note, 'created_at', rp.created_at) order by rp.created_at)
      from public.referral_payouts rp where rp.seller_id = v_seller.id
    ), '[]'::jsonb),
    'event', jsonb_build_object(
      'id', v_event.id, 'name', v_event.name, 'slug', v_event.slug, 'starts_at', v_event.starts_at,
      'ends_at', v_event.ends_at, 'status', v_event.status, 'poster_url', v_event.poster_url,
      'org_name', v_org.name, 'org_slug', v_org.slug
    ),
    'has_printed', exists (select 1 from public.print_batches pb where pb.event_id = p_event_id)
  );
end;
$$;

-- All my ambassador events (AMB-13 track record) – for /me/ambassador
create or replace function public.my_ambassador_events()
returns table (
  event_id uuid, event_name text, event_slug text, org_name text, org_slug text, starts_at timestamptz, ends_at timestamptz,
  event_status public.event_status, ref_code text, credited_tickets integer, pending_tickets integer, reward_paisa bigint,
  paid_paisa bigint, rank integer, ambassadors integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.slug, o.name, o.slug, e.starts_at, e.ends_at, e.status, s.ref_code,
         r.credited_tickets, r.pending_tickets, r.reward_paisa, r.paid_paisa, r.rank,
         (select count(*)::int from public.print_sellers x where x.event_id = e.id)
  from public.print_sellers s
  join public.events e on e.id = s.event_id
  join public.organizations o on o.id = e.org_id
  cross join lateral (select * from public.ambassador_rows(e.id) ar where ar.seller_id = s.id) r
  where s.user_id = auth.uid()
  order by e.starts_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Organizer settings and tools (AMB-01, AMB-02, AMB-06, AMB-07, AMB-09)
-- ---------------------------------------------------------------------------
create or replace function public.save_referral_settings(
  p_event_id uuid,
  p_reward_type text,
  p_reward_value integer,
  p_discount_type text,
  p_discount_value integer,
  p_credit_on text,
  p_leaderboard boolean,
  p_applications_open boolean,
  p_milestones jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_milestones jsonb;
  v_bad int;
begin
  if coalesce(p_reward_type, '') not in ('none', 'fixed', 'percent') or coalesce(p_discount_type, '') not in ('none', 'fixed', 'percent') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose a reward and discount type.';
  end if;
  if coalesce(p_reward_value, -1) < 0 or (p_reward_type = 'percent' and p_reward_value > 100) or p_reward_value > 100000000
     or (p_reward_type <> 'none' and p_reward_value = 0) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid reward (percent between 1 and 100).';
  end if;
  if coalesce(p_discount_value, -1) < 0 or (p_discount_type = 'percent' and p_discount_value > 100) or p_discount_value > 100000000
     or (p_discount_type <> 'none' and p_discount_value = 0) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid buyer discount (percent between 1 and 100).';
  end if;
  if coalesce(p_credit_on, '') not in ('approved', 'checked_in') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose when an ambassador gets credit.';
  end if;

  v_milestones := coalesce(p_milestones, '[]'::jsonb);
  if jsonb_typeof(v_milestones) <> 'array' or jsonb_array_length(v_milestones) > 10 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add at most 10 milestones.';
  end if;
  select count(*) into v_bad
  from jsonb_array_elements(v_milestones) m
  where jsonb_typeof(m) <> 'object'
     or jsonb_typeof(m -> 'tickets') <> 'number'
     or (m ->> 'tickets')::numeric <> floor((m ->> 'tickets')::numeric)
     or (m ->> 'tickets')::numeric not between 1 and 100000
     or char_length(btrim(coalesce(m ->> 'reward', ''))) not between 1 and 80;
  if v_bad > 0 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Each milestone needs a number of tickets and a reward (up to 80 characters).';
  end if;
  -- keep only tickets + reward, sorted, one per ticket count
  select coalesce(jsonb_agg(jsonb_build_object('tickets', t, 'reward', r) order by t), '[]'::jsonb) into v_milestones
  from (
    select distinct on ((m ->> 'tickets')::int) (m ->> 'tickets')::int as t, btrim(m ->> 'reward') as r
    from jsonb_array_elements(v_milestones) m
    order by (m ->> 'tickets')::int
  ) x;

  insert into public.referral_settings (
    event_id, reward_type, reward_value, discount_type, discount_value, credit_on, leaderboard, applications_open, milestones, updated_by
  )
  values (
    p_event_id, p_reward_type, case when p_reward_type = 'none' then 0 else p_reward_value end,
    p_discount_type, case when p_discount_type = 'none' then 0 else p_discount_value end,
    p_credit_on, coalesce(p_leaderboard, true), coalesce(p_applications_open, false), v_milestones, auth.uid()
  )
  on conflict (event_id) do update set
    reward_type = excluded.reward_type, reward_value = excluded.reward_value,
    discount_type = excluded.discount_type, discount_value = excluded.discount_value,
    credit_on = excluded.credit_on, leaderboard = excluded.leaderboard,
    applications_open = excluded.applications_open, milestones = excluded.milestones,
    updated_by = excluded.updated_by;

  perform public.audit('referral.settings', 'event', p_event_id::text, jsonb_build_object(
    'reward_type', p_reward_type, 'reward_value', p_reward_value, 'discount_type', p_discount_type,
    'discount_value', p_discount_value, 'credit_on', p_credit_on));
end;
$$;

create or replace function public.set_seller_code(p_seller_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller public.print_sellers;
  v_code text := public.normalize_code(p_code);
begin
  select * into v_seller from public.print_sellers where id = p_seller_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Ambassador not found.';
  end if;
  perform public.print_staff_event(v_seller.event_id);
  if v_code is null or v_code !~ '^[A-Z0-9]{3,16}$' then
    raise exception using message = 'TL:INVALID_CODE', detail = 'Use 3 to 16 letters or digits, e.g. ALI or SARA10.';
  end if;
  if v_code = v_seller.ref_code then
    return v_code;
  end if;
  if public.event_code_taken(v_seller.event_id, v_code, p_seller_id, null) then
    raise exception using message = 'TL:CODE_TAKEN', detail = 'Another ambassador or promo code of this event already uses this code.';
  end if;
  update public.print_sellers set ref_code = v_code where id = p_seller_id;
  perform public.audit('ambassador.code', 'event', v_seller.event_id::text,
    jsonb_build_object('seller_id', p_seller_id, 'from', v_seller.ref_code, 'to', v_code));
  return v_code;
end;
$$;

create or replace function public.save_promo_code(
  p_event_id uuid,
  p_promo_id uuid,
  p_code text,
  p_discount_type text,
  p_discount_value integer,
  p_max_uses integer,
  p_min_tickets integer,
  p_ticket_type_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_code text := public.normalize_code(p_code);
  v_types uuid[] := case when coalesce(cardinality(p_ticket_type_ids), 0) = 0 then null else p_ticket_type_ids end;
  v_id uuid;
begin
  if v_code is null or v_code !~ '^[A-Z0-9]{3,16}$' then
    raise exception using message = 'TL:INVALID_CODE', detail = 'Use 3 to 16 letters or digits, e.g. EARLYBIRD.';
  end if;
  if coalesce(p_discount_type, '') not in ('fixed', 'percent') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose rupees off or percent off.';
  end if;
  if coalesce(p_discount_value, 0) <= 0 or (p_discount_type = 'percent' and p_discount_value > 100) or p_discount_value > 100000000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid discount (percent between 1 and 100).';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 100000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Uses must be between 1 and 100000 (or empty for no limit).';
  end if;
  if coalesce(p_min_tickets, 1) not between 1 and 50 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Minimum tickets must be between 1 and 50.';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'The end must be after the start.';
  end if;
  if v_types is not null and exists (
    select 1 from unnest(v_types) x(id)
    where not exists (select 1 from public.ticket_types tt where tt.id = x.id and tt.event_id = p_event_id)
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose ticket types of this event.';
  end if;
  if public.event_code_taken(p_event_id, v_code, null, p_promo_id) then
    raise exception using message = 'TL:CODE_TAKEN', detail = 'An ambassador or another promo code of this event already uses this code.';
  end if;

  if p_promo_id is null then
    insert into public.promo_codes (
      event_id, code, discount_type, discount_value, max_uses, min_tickets, ticket_type_ids, starts_at, ends_at, active, note, created_by
    )
    values (
      p_event_id, v_code, p_discount_type, p_discount_value, p_max_uses, coalesce(p_min_tickets, 1), v_types,
      p_starts_at, p_ends_at, coalesce(p_active, true), nullif(left(btrim(coalesce(p_note, '')), 120), ''), auth.uid()
    )
    returning id into v_id;
  else
    update public.promo_codes set
      code = v_code, discount_type = p_discount_type, discount_value = p_discount_value, max_uses = p_max_uses,
      min_tickets = coalesce(p_min_tickets, 1), ticket_type_ids = v_types, starts_at = p_starts_at, ends_at = p_ends_at,
      active = coalesce(p_active, true), note = nullif(left(btrim(coalesce(p_note, '')), 120), '')
    where id = p_promo_id and event_id = p_event_id
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Promo code not found.';
    end if;
  end if;
  perform public.audit('promo_code.save', 'event', p_event_id::text,
    jsonb_build_object('promo_id', v_id, 'code', v_code, 'discount_type', p_discount_type, 'discount_value', p_discount_value));
  return v_id;
end;
$$;

create or replace function public.set_promo_code_active(p_promo_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes;
begin
  select * into v_promo from public.promo_codes where id = p_promo_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Promo code not found.';
  end if;
  perform public.print_staff_event(v_promo.event_id);
  update public.promo_codes set active = coalesce(p_active, false) where id = p_promo_id;
  perform public.audit('promo_code.active', 'event', v_promo.event_id::text,
    jsonb_build_object('promo_id', p_promo_id, 'code', v_promo.code, 'active', p_active));
end;
$$;

create or replace function public.delete_promo_code(p_promo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes;
begin
  select * into v_promo from public.promo_codes where id = p_promo_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Promo code not found.';
  end if;
  perform public.print_staff_event(v_promo.event_id);
  if exists (select 1 from public.orders o where o.promo_code_id = p_promo_id) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This code was already used. Turn it off instead of deleting it.';
  end if;
  delete from public.promo_codes where id = p_promo_id;
  perform public.audit('promo_code.delete', 'event', v_promo.event_id::text, jsonb_build_object('code', v_promo.code));
end;
$$;

create or replace function public.add_referral_payout(p_event_id uuid, p_seller_id uuid, p_amount_paisa bigint, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events := public.print_staff_event(p_event_id);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 200), '');
  v_id uuid;
begin
  if not exists (select 1 from public.print_sellers s where s.id = p_seller_id and s.event_id = p_event_id) then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Ambassador not found.';
  end if;
  if p_amount_paisa is null or abs(p_amount_paisa) > 1000000000 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter a valid amount.';
  end if;
  if p_amount_paisa = 0 and v_note is null then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Enter an amount or write what was given (e.g. VIP pass).';
  end if;
  insert into public.referral_payouts (event_id, seller_id, amount_paisa, note, created_by)
  values (p_event_id, p_seller_id, p_amount_paisa, v_note, auth.uid())
  returning id into v_id;
  perform public.audit('referral.payout', 'event', p_event_id::text,
    jsonb_build_object('seller_id', p_seller_id, 'amount_paisa', p_amount_paisa, 'note', v_note));
  return v_id;
end;
$$;

create or replace function public.delete_referral_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.referral_payouts;
begin
  select * into v_payout from public.referral_payouts where id = p_payout_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Entry not found.';
  end if;
  perform public.print_staff_event(v_payout.event_id);
  delete from public.referral_payouts where id = p_payout_id;
  perform public.audit('referral.payout_delete', 'event', v_payout.event_id::text,
    jsonb_build_object('seller_id', v_payout.seller_id, 'amount_paisa', v_payout.amount_paisa));
end;
$$;

-- Sellers who joined by application keep their own account when the organizer
-- edits their name/phone (they are not team members). Otherwise as D-041.
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
  v_keeps_own boolean := false;
  v_id uuid;
begin
  if p_user_id is not null then
    v_keeps_own := p_seller_id is not null and exists (
      select 1 from public.print_sellers s where s.id = p_seller_id and s.event_id = p_event_id and s.user_id = p_user_id
    );
    if not v_keeps_own and not exists (select 1 from public.organization_members m where m.org_id = v_event.org_id and m.user_id = p_user_id) then
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
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'This person is already a seller for this event.';
end;
$$;

-- A seller with online orders or rewards cannot be deleted (extends D-041)
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
  if exists (select 1 from public.orders o where o.seller_id = p_seller_id)
     or exists (select 1 from public.referral_payouts rp where rp.seller_id = p_seller_id) then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This ambassador already brought bookings or got rewards, so they stay in the list. Close their account instead.';
  end if;
  delete from public.print_sellers where id = p_seller_id;
  perform public.audit('print_seller.delete', 'event', v_seller.event_id::text, jsonb_build_object('name', v_seller.name));
end;
$$;

-- ---------------------------------------------------------------------------
-- Applications (AMB-11)
-- ---------------------------------------------------------------------------
create or replace function public.apply_ambassador(p_event_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_event public.events;
  v_open boolean;
  v_id uuid;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to apply.';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.is_suspended then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;
  if coalesce(char_length(btrim(v_profile.full_name)), 0) < 2 or coalesce(char_length(btrim(v_profile.phone)), 0) < 8 then
    raise exception using message = 'TL:PROFILE_INCOMPLETE', detail = 'Add your full name and phone number in your profile first.';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status <> 'published' or now() >= v_event.ends_at then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'This event is not taking ambassadors.';
  end if;
  select r.applications_open into v_open from public.referral_settings r where r.event_id = p_event_id;
  if not coalesce(v_open, false) then
    raise exception using message = 'TL:APPLICATIONS_CLOSED', detail = 'This event is not taking ambassador applications.';
  end if;
  if exists (select 1 from public.print_sellers s where s.event_id = p_event_id and s.user_id = v_uid) then
    raise exception using message = 'TL:ALREADY_AMBASSADOR', detail = 'You are already an ambassador for this event.';
  end if;
  if exists (select 1 from public.ambassador_applications a where a.event_id = p_event_id and a.user_id = v_uid) then
    raise exception using message = 'TL:ALREADY_APPLIED', detail = 'You have already applied for this event.';
  end if;
  if not public.rate_limit_hit('apply_ambassador:' || v_uid::text, 10, 3600) then
    raise exception using message = 'TL:RATE_LIMITED', detail = 'Too many applications. Please try again later.';
  end if;
  insert into public.ambassador_applications (event_id, user_id, message)
  values (p_event_id, v_uid, nullif(left(btrim(coalesce(p_message, '')), 500), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.decide_ambassador_application(p_application_id uuid, p_approve boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.ambassador_applications;
  v_profile public.profiles;
  v_seller_id uuid;
begin
  select * into v_app from public.ambassador_applications where id = p_application_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Application not found.';
  end if;
  perform public.print_staff_event(v_app.event_id);
  if v_app.status <> 'pending' then
    return v_app.seller_id;
  end if;

  if p_approve then
    select * into v_profile from public.profiles where id = v_app.user_id;
    select s.id into v_seller_id from public.print_sellers s where s.event_id = v_app.event_id and s.user_id = v_app.user_id;
    if v_seller_id is null then
      insert into public.print_sellers (event_id, user_id, name, phone, joined_via, created_by)
      values (v_app.event_id, v_app.user_id, left(coalesce(nullif(btrim(v_profile.full_name), ''), v_profile.email, 'Ambassador'), 80),
              left(v_profile.phone, 20), 'application', auth.uid())
      returning id into v_seller_id;
    end if;
  end if;

  update public.ambassador_applications
  set status = case when p_approve then 'approved' else 'rejected' end,
      seller_id = v_seller_id, decided_by = auth.uid(), decided_at = now()
  where id = p_application_id;

  perform public.audit(case when p_approve then 'ambassador.approve' else 'ambassador.reject' end, 'event', v_app.event_id::text,
    jsonb_build_object('application_id', p_application_id, 'user_id', v_app.user_id));
  return v_seller_id;
end;
$$;

-- Applicants with their name, phone and record at other events (AMB-11, AMB-13)
create or replace function public.ambassador_applications_for(p_event_id uuid)
returns table (
  id uuid, user_id uuid, full_name text, email text, phone text, university text, message text, status text,
  created_at timestamptz, past_events integer, past_tickets integer
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
    select a.id, a.user_id, p.full_name, p.email, p.phone, u.name, a.message, a.status, a.created_at,
           (select count(*)::int from public.print_sellers s where s.user_id = a.user_id and s.event_id <> p_event_id),
           (
             (select coalesce(sum(o.ticket_count), 0)::int from public.orders o
              join public.print_sellers s on s.id = o.seller_id
              where s.user_id = a.user_id and s.event_id <> p_event_id and o.status = 'approved')
             + (select count(*)::int from public.tickets t
                join public.print_sellers s on s.id = t.seller_id
                where s.user_id = a.user_id and s.event_id <> p_event_id and t.sale_status = 'sold')
           )
    from public.ambassador_applications a
    join public.profiles p on p.id = a.user_id
    left join public.universities u on u.id = p.university_id
    where a.event_id = p_event_id
    order by (a.status = 'pending') desc, a.created_at desc;
end;
$$;

-- Event page: is the program taking applications, and where do I stand?
create or replace function public.event_ambassador_info(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'applications_open', coalesce((select r.applications_open from public.referral_settings r where r.event_id = p_event_id), false),
    'reward_type', coalesce((select r.reward_type from public.referral_settings r where r.event_id = p_event_id), 'none'),
    'reward_value', coalesce((select r.reward_value from public.referral_settings r where r.event_id = p_event_id), 0),
    'has_milestones', coalesce((select jsonb_array_length(r.milestones) > 0 from public.referral_settings r where r.event_id = p_event_id), false),
    'my_status', case
      when auth.uid() is null then null
      when exists (select 1 from public.print_sellers s where s.event_id = p_event_id and s.user_id = auth.uid()) then 'ambassador'
      else (select a.status from public.ambassador_applications a where a.event_id = p_event_id and a.user_id = auth.uid())
    end
  )
  from public.events e
  where e.id = p_event_id and e.status = 'published';
$$;

-- ---------------------------------------------------------------------------
-- Ambassadors can open the Sell area even when the event has no paper tickets
-- (D-042 entry points). Return type changes → drop first.
-- ---------------------------------------------------------------------------
drop function public.my_sell_events();

create or replace function public.my_sell_events()
returns table (
  event_id uuid, event_name text, event_slug text, org_name text, org_slug text, starts_at timestamptz,
  access text, has_printed boolean, ref_code text
)
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
  order by e.starts_at;
$$;

-- ---------------------------------------------------------------------------
-- TickLO campus ambassadors (AMB-14)
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_campus_ambassador(p_user_id uuid, p_code text, p_university_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.normalize_code(p_code);
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only TickLO admins can do that.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9]{3,16}$' then
    raise exception using message = 'TL:INVALID_CODE', detail = 'Use 3 to 16 letters or digits.';
  end if;
  if exists (select 1 from public.campus_ambassadors c where c.code = v_code and c.user_id <> p_user_id) then
    raise exception using message = 'TL:CODE_TAKEN', detail = 'Another campus ambassador already has this code.';
  end if;
  insert into public.campus_ambassadors (user_id, code, university_id, active, created_by)
  values (p_user_id, v_code, p_university_id, coalesce(p_active, true), auth.uid())
  on conflict (user_id) do update set code = excluded.code, university_id = excluded.university_id, active = excluded.active;
  perform public.audit('campus_ambassador.save', 'user', p_user_id::text,
    jsonb_build_object('code', v_code, 'active', coalesce(p_active, true)));
end;
$$;

-- The society's owner says who told them about TickLO (once, within 30 days)
create or replace function public.set_org_referral(p_org_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organizations;
  v_amb public.campus_ambassadors;
begin
  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if not exists (
    select 1 from public.organization_members m where m.org_id = p_org_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can do that.';
  end if;
  if v_org.referred_by is not null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'A referral code was already added.';
  end if;
  if v_org.created_at < now() - interval '30 days' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Referral codes can only be added in the first 30 days.';
  end if;
  select * into v_amb from public.campus_ambassadors c where c.code = public.normalize_code(p_code) and c.active;
  if not found then
    raise exception using message = 'TL:INVALID_CODE', detail = 'This TickLO ambassador code is not valid.';
  end if;
  if v_amb.user_id = v_uid then
    raise exception using message = 'TL:OWN_CODE', detail = 'You cannot use your own ambassador code.';
  end if;
  update public.organizations set referred_by = v_amb.user_id, referred_at = now() where id = p_org_id;
  perform public.audit('org.referral', 'organization', p_org_id::text, jsonb_build_object('ambassador', v_amb.user_id, 'code', v_amb.code));
  return true;
end;
$$;

-- Societies brought by campus ambassadors, with what they did on TickLO
create or replace function public.campus_ambassador_stats(p_user_id uuid default null)
returns table (
  user_id uuid, full_name text, email text, code text, university text, active boolean, created_at timestamptz,
  societies integer, approved_societies integer, published_events integer, paid_tickets integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() and (p_user_id is null or p_user_id <> auth.uid()) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Not allowed.';
  end if;
  return query
    select c.user_id, p.full_name, p.email, c.code, u.name, c.active, c.created_at,
           (select count(*)::int from public.organizations o where o.referred_by = c.user_id),
           (select count(*)::int from public.organizations o where o.referred_by = c.user_id and o.status = 'approved'),
           (select count(*)::int from public.events e join public.organizations o on o.id = e.org_id
            where o.referred_by = c.user_id and e.status in ('published', 'cancelled')),
           (select coalesce(sum(oi.quantity), 0)::int from public.order_items oi
            join public.orders od on od.id = oi.order_id
            join public.events e on e.id = od.event_id
            join public.organizations o on o.id = e.org_id
            where o.referred_by = c.user_id and od.status = 'approved' and oi.unit_price_paisa > 0)
    from public.campus_ambassadors c
    join public.profiles p on p.id = c.user_id
    left join public.universities u on u.id = c.university_id
    where p_user_id is null or c.user_id = p_user_id
    order by c.created_at desc;
end;
$$;

create or replace function public.my_campus_societies()
returns table (org_name text, org_slug text, status public.org_status, referred_at timestamptz, events integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, o.slug, o.status, o.referred_at,
         (select count(*)::int from public.events e where e.org_id = o.id and e.status in ('published', 'cancelled'))
  from public.organizations o
  where o.referred_by = auth.uid()
  order by o.referred_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.phone_key(text),
  public.normalize_code(text),
  public.event_code_taken(uuid, text, uuid, uuid),
  public.generate_seller_code(uuid, text),
  public.print_sellers_default_code(),
  public.discount_for(jsonb, text, integer, uuid[]),
  public.promo_code_uses(uuid),
  public.ambassador_rows(uuid),
  public.short_name(text)
from public, anon, authenticated;

grant execute on function
  public.phone_key(text),
  public.normalize_code(text),
  public.event_code_taken(uuid, text, uuid, uuid),
  public.generate_seller_code(uuid, text),
  public.discount_for(jsonb, text, integer, uuid[]),
  public.promo_code_uses(uuid),
  public.ambassador_rows(uuid),
  public.short_name(text)
to service_role;

revoke execute on function
  public.referral_preview(uuid, text),
  public.track_referral_click(uuid, text),
  public.event_ambassador_info(uuid),
  public.create_order(uuid, jsonb, text, text, text, text),
  public.ambassador_summary(uuid),
  public.my_ambassador_stats(uuid),
  public.my_ambassador_events(),
  public.save_referral_settings(uuid, text, integer, text, integer, text, boolean, boolean, jsonb),
  public.set_seller_code(uuid, text),
  public.save_promo_code(uuid, uuid, text, text, integer, integer, integer, uuid[], timestamptz, timestamptz, boolean, text),
  public.set_promo_code_active(uuid, boolean),
  public.delete_promo_code(uuid),
  public.add_referral_payout(uuid, uuid, bigint, text),
  public.delete_referral_payout(uuid),
  public.delete_print_seller(uuid),
  public.apply_ambassador(uuid, text),
  public.decide_ambassador_application(uuid, boolean),
  public.ambassador_applications_for(uuid),
  public.my_sell_events(),
  public.admin_save_campus_ambassador(uuid, text, uuid, boolean),
  public.set_org_referral(uuid, text),
  public.campus_ambassador_stats(uuid),
  public.my_campus_societies()
from public, anon;

-- Anyone (also logged out) can see what a link/code gives and count a link open
grant execute on function
  public.referral_preview(uuid, text),
  public.track_referral_click(uuid, text),
  public.event_ambassador_info(uuid)
to anon, authenticated, service_role;

grant execute on function
  public.create_order(uuid, jsonb, text, text, text, text),
  public.ambassador_summary(uuid),
  public.my_ambassador_stats(uuid),
  public.my_ambassador_events(),
  public.save_referral_settings(uuid, text, integer, text, integer, text, boolean, boolean, jsonb),
  public.set_seller_code(uuid, text),
  public.save_promo_code(uuid, uuid, text, text, integer, integer, integer, uuid[], timestamptz, timestamptz, boolean, text),
  public.set_promo_code_active(uuid, boolean),
  public.delete_promo_code(uuid),
  public.add_referral_payout(uuid, uuid, bigint, text),
  public.delete_referral_payout(uuid),
  public.delete_print_seller(uuid),
  public.apply_ambassador(uuid, text),
  public.decide_ambassador_application(uuid, boolean),
  public.ambassador_applications_for(uuid),
  public.my_sell_events(),
  public.admin_save_campus_ambassador(uuid, text, uuid, boolean),
  public.set_org_referral(uuid, text),
  public.campus_ambassador_stats(uuid),
  public.my_campus_societies()
to authenticated, service_role;

-- =============================================================================
-- TickLO v1 – base schema: enums, tables, indexes, generic triggers
-- Money is stored in paisa (integer), time in UTC (timestamptz).  (rule 12)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_type as enum ('society', 'department');
create type public.org_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.org_role as enum ('owner', 'member', 'scanner');
create type public.event_status as enum ('draft', 'pending_review', 'published', 'rejected', 'cancelled');
create type public.event_visibility as enum ('public', 'link_only');
create type public.order_status as enum ('awaiting_payment', 'under_review', 'approved', 'rejected', 'expired');
create type public.ticket_status as enum ('valid', 'checked_in', 'cancelled');
create type public.proof_status as enum ('pending', 'approved', 'rejected');
create type public.payment_account_kind as enum ('bank', 'jazzcash', 'easypaisa');
create type public.checkin_method as enum ('scan', 'manual');
create type public.checkin_result as enum (
  'ok', 'invalid', 'expired_code', 'wrong_event', 'already_used', 'cancelled', 'not_allowed', 'not_found'
);
create type public.dispute_status as enum ('open', 'resolved');
create type public.email_status as enum ('sent', 'failed', 'logged');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Universities (ADM-07)
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  city text not null,
  email_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint universities_name_len check (char_length(name) between 2 and 150),
  constraint universities_city_len check (char_length(city) between 2 and 80)
);
create unique index universities_name_key on public.universities (lower(name));
create trigger universities_updated_at before update on public.universities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user) – AUTH-04, AUTH-08, AUTH-09
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  university_id uuid references public.universities (id) on delete set null,
  avatar_url text,
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_len check (full_name is null or char_length(full_name) <= 100),
  constraint profiles_phone_len check (phone is null or char_length(phone) between 8 and 20)
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_phone_idx on public.profiles (phone);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile whenever an auth user is created (email signup or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 100), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when the user changes their email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Organizations (societies / departments) – ORG-01
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  university_id uuid references public.universities (id) on delete set null,
  type public.org_type not null default 'society',
  about text,
  logo_url text,
  social_links jsonb not null default '{}'::jsonb,
  proof_path text,
  status public.org_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  constraint organizations_name_len check (char_length(name) between 2 and 120),
  constraint organizations_about_len check (about is null or char_length(about) <= 2000),
  constraint organizations_social_links_obj check (jsonb_typeof(social_links) = 'object')
);
create index organizations_status_idx on public.organizations (status);
create index organizations_university_idx on public.organizations (university_id);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);
-- At most one owner per organization.
create unique index organization_members_one_owner on public.organization_members (org_id) where role = 'owner';

-- Team invites by email (ORG-03, EML-09). The invitee may not have an account yet.
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null,
  token text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  constraint org_invites_role check (role <> 'owner'),
  constraint org_invites_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index org_invites_one_open_per_email on public.org_invites (org_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Payment accounts shown to students on the payment screen (ORG-02, PAY-03)
create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind public.payment_account_kind not null,
  bank_name text,
  account_title text not null,
  account_number text not null,
  iban text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_accounts_bank_name check (kind <> 'bank' or (bank_name is not null and char_length(bank_name) >= 2)),
  constraint payment_accounts_title_len check (char_length(account_title) between 2 and 120),
  constraint payment_accounts_number_len check (char_length(account_number) between 4 and 40),
  constraint payment_accounts_iban_len check (iban is null or char_length(iban) between 10 and 40)
);
create index payment_accounts_org_idx on public.payment_accounts (org_id);
create trigger payment_accounts_updated_at before update on public.payment_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Events and ticket types – ORG-04 .. ORG-07
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  poster_url text,
  venue text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null,
  visibility public.event_visibility not null default 'public',
  max_tickets_per_order integer not null default 5,
  status public.event_status not null default 'draft',
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  reminder_sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_org_slug_key unique (org_id, slug),
  constraint events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  constraint events_name_len check (char_length(name) between 3 and 150),
  constraint events_description_len check (description is null or char_length(description) <= 5000),
  constraint events_venue_len check (char_length(venue) between 2 and 200),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_capacity_range check (capacity between 1 and 100000),
  constraint events_max_per_order_range check (max_tickets_per_order between 1 and 20)
);
create index events_listing_idx on public.events (status, visibility, starts_at);
create index events_org_idx on public.events (org_id, starts_at desc);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- Which of the society's payment accounts are shown for an event (ORG-02)
create table public.event_payment_accounts (
  event_id uuid not null references public.events (id) on delete cascade,
  payment_account_id uuid not null references public.payment_accounts (id) on delete cascade,
  primary key (event_id, payment_account_id)
);
create index event_payment_accounts_account_idx on public.event_payment_accounts (payment_account_id);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  price_paisa integer not null,
  quantity integer not null,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  requires_student_card boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_types_name_len check (char_length(name) between 1 and 80),
  constraint ticket_types_description_len check (description is null or char_length(description) <= 500),
  constraint ticket_types_price_range check (price_paisa between 0 and 100000000),
  constraint ticket_types_quantity_range check (quantity between 1 and 100000),
  constraint ticket_types_sale_window check (sale_starts_at is null or sale_ends_at is null or sale_ends_at > sale_starts_at)
);
create index ticket_types_event_idx on public.ticket_types (event_id, sort_order);
create trigger ticket_types_updated_at before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders, items, payment proofs – PAY-01 .. PAY-14
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref_code text not null unique,
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  status public.order_status not null,
  total_paisa bigint not null,
  ticket_count integer not null,
  requires_student_card boolean not null default false,
  hold_expires_at timestamptz,
  buyer_name text not null,
  buyer_email text,
  buyer_phone text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  reject_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_nonneg check (total_paisa >= 0),
  constraint orders_ticket_count_pos check (ticket_count > 0),
  constraint orders_hold_when_awaiting check (status <> 'awaiting_payment' or hold_expires_at is not null)
);
create index orders_event_status_idx on public.orders (event_id, status);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_holds_idx on public.orders (hold_expires_at) where status = 'awaiting_payment';
create index orders_buyer_email_idx on public.orders (lower(buyer_email));
create index orders_buyer_phone_idx on public.orders (buyer_phone);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  quantity integer not null,
  unit_price_paisa integer not null,
  constraint order_items_quantity_pos check (quantity > 0),
  constraint order_items_price_nonneg check (unit_price_paisa >= 0),
  constraint order_items_one_row_per_type unique (order_id, ticket_type_id)
);
create index order_items_ticket_type_idx on public.order_items (ticket_type_id);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  payment_account_id uuid references public.payment_accounts (id) on delete set null,
  screenshot_path text,
  image_hash text,
  transaction_id text,
  transaction_id_norm text,
  sender_name text,
  student_card_path text,
  status public.proof_status not null default 'pending',
  is_possible_duplicate boolean not null default false,
  duplicate_order_ids uuid[] not null default '{}',
  duplicate_reasons text[] not null default '{}',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  constraint payment_proofs_hash_format check (image_hash is null or image_hash ~ '^[0-9a-f]{64}$')
);
create index payment_proofs_order_idx on public.payment_proofs (order_id, created_at desc);
create index payment_proofs_event_txn_idx on public.payment_proofs (event_id, transaction_id_norm);
create index payment_proofs_event_hash_idx on public.payment_proofs (event_id, image_hash);
create index payment_proofs_duplicates_idx on public.payment_proofs (created_at desc) where is_possible_duplicate;

-- ---------------------------------------------------------------------------
-- Tickets – created only from approved orders (business rule)
-- ---------------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  ticket_type_id uuid not null references public.ticket_types (id) on delete restrict,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  holder_name text not null,
  code text not null unique,
  status public.ticket_status not null default 'valid',
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  checkin_method public.checkin_method,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tickets_checked_in_fields check (status <> 'checked_in' or checked_in_at is not null)
);
create index tickets_event_status_idx on public.tickets (event_id, status);
create index tickets_owner_idx on public.tickets (owner_id, created_at desc);
create index tickets_order_idx on public.tickets (order_id);

-- ---------------------------------------------------------------------------
-- Scanner assignments (ORG-10) and check-in log (SCN-10)
-- ---------------------------------------------------------------------------
create table public.event_staff (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'scanner',
  assigned_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_staff_role check (role = 'scanner')
);
create index event_staff_user_idx on public.event_staff (user_id, expires_at);

create table public.checkins (
  id bigint generated always as identity primary key,
  event_id uuid references public.events (id) on delete cascade,
  ticket_id uuid references public.tickets (id) on delete set null,
  scanned_by uuid references public.profiles (id) on delete set null,
  method public.checkin_method not null,
  result public.checkin_result not null,
  device text,
  detail text,
  created_at timestamptz not null default now()
);
create index checkins_event_idx on public.checkins (event_id, created_at desc);
create index checkins_ticket_idx on public.checkins (ticket_id);

-- ---------------------------------------------------------------------------
-- Admin: audit log (ADM-08), email log, disputes (ADM-04)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_target_idx on public.audit_log (target_type, target_id);

create table public.email_log (
  id bigint generated always as identity primary key,
  to_email text not null,
  template text not null,
  subject text not null,
  status public.email_status not null,
  provider_id text,
  error text,
  related_type text,
  related_id text,
  created_at timestamptz not null default now()
);
create index email_log_created_idx on public.email_log (created_at desc);
create index email_log_failed_idx on public.email_log (created_at desc) where status = 'failed';

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  message text not null,
  status public.dispute_status not null default 'open',
  admin_note text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint disputes_message_len check (char_length(message) between 10 and 2000)
);
create unique index disputes_one_open_per_order on public.disputes (order_id) where status = 'open';
create index disputes_status_idx on public.disputes (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limiting buckets (NFR-05) – service role only
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

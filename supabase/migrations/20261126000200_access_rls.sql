-- =============================================================================
-- TickLO v1 – access helpers, Row Level Security (NFR-04) and table privileges
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can be used inside policies
-- without recursive RLS evaluation). All return false for suspended users.
-- ---------------------------------------------------------------------------
create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_active_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_user_id and not p.is_suspended);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin and not p.is_suspended from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Caller's role in an organization (null when not a member or suspended)
create or replace function public.org_role_of(p_org_id uuid, p_user_id uuid default auth.uid())
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  join public.profiles p on p.id = m.user_id and not p.is_suspended
  where m.org_id = p_org_id and m.user_id = p_user_id;
$$;

-- owner or member ("organizer")
create or replace function public.is_org_staff(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.org_role_of(p_org_id) in ('owner', 'member'), false);
$$;

create or replace function public.is_org_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.org_role_of(p_org_id) = 'owner', false);
$$;

-- any role, including scanner
create or replace function public.is_org_member_any(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.org_role_of(p_org_id) is not null;
$$;

create or replace function public.event_org_id(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.org_id from public.events e where e.id = p_event_id;
$$;

-- organizer (owner/member) of the society that owns the event
create or replace function public.is_event_staff(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_org_staff(public.event_org_id(p_event_id));
$$;

-- Can this user scan tickets for this event right now? (SCN-01, ORG-10, D-012)
create or replace function public.can_scan_event(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.profiles pr on pr.id = p_user_id and not pr.is_suspended
    where e.id = p_event_id
      and e.status = 'published'
      and now() <= e.ends_at + interval '6 hours'
      and (
        exists (
          select 1 from public.event_staff s
          where s.event_id = e.id and s.user_id = p_user_id and s.expires_at > now()
        )
        or exists (
          select 1 from public.organization_members m
          where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
        )
      )
  );
$$;

-- Is p_user a member of any organization where the caller is owner/member?
-- Lets organizers see their teammates' names (e.g. "checked in by Ali").
create or replace function public.shares_org_as_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members them on them.org_id = me.org_id
    join public.profiles p on p.id = me.user_id and not p.is_suspended
    where me.user_id = auth.uid()
      and me.role in ('owner', 'member')
      and them.user_id = p_user_id
  );
$$;

-- Does the caller have an order for this event? (to read the event's payment accounts)
create or replace function public.has_order_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o where o.event_id = p_event_id and o.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table
-- ---------------------------------------------------------------------------
alter table public.universities enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.events enable row level security;
alter table public.event_payment_accounts enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.tickets enable row level security;
alter table public.event_staff enable row level security;
alter table public.checkins enable row level security;
alter table public.audit_log enable row level security;
alter table public.email_log enable row level security;
alter table public.disputes enable row level security;
alter table public.rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- universities: everyone can read; writes only through admin functions
create policy universities_read on public.universities
  for select to anon, authenticated using (true);

-- profiles: self, admins, and teammates (organizers) can read; self can update
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.shares_org_as_staff(id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations: approved ones are public; members and admins see their own
create policy organizations_read on public.organizations
  for select to anon, authenticated
  using (status = 'approved' or public.is_org_member_any(id) or public.is_admin());
create policy organizations_update_staff on public.organizations
  for update to authenticated
  using (public.is_org_staff(id))
  with check (public.is_org_staff(id));

-- organization_members: visible to members of the same org and admins
create policy organization_members_read on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member_any(org_id) or public.is_admin());

-- org_invites: owners, admins, and the invited email
create policy org_invites_read on public.org_invites
  for select to authenticated
  using (
    public.is_org_owner(org_id)
    or public.is_admin()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- payment_accounts: organizers + admins; students with an order for an event
-- that shows this account (payment screen, PAY-03). Only owners can change (ORG-02).
create policy payment_accounts_read on public.payment_accounts
  for select to authenticated
  using (
    public.is_org_staff(org_id)
    or public.is_admin()
    or exists (
      select 1 from public.event_payment_accounts epa
      where epa.payment_account_id = payment_accounts.id
        and public.has_order_for_event(epa.event_id)
    )
  );
create policy payment_accounts_insert_owner on public.payment_accounts
  for insert to authenticated with check (public.is_org_owner(org_id));
create policy payment_accounts_update_owner on public.payment_accounts
  for update to authenticated using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));
create policy payment_accounts_delete_owner on public.payment_accounts
  for delete to authenticated using (public.is_org_owner(org_id));

-- events: published/cancelled events are public; drafts only for members/admins
create policy events_read on public.events
  for select to anon, authenticated
  using (status in ('published', 'cancelled') or public.is_org_member_any(org_id) or public.is_admin());
create policy events_insert_staff on public.events
  for insert to authenticated
  with check (public.is_org_staff(org_id) and created_by = auth.uid() and status = 'draft');
create policy events_update_staff on public.events
  for update to authenticated
  using (public.is_org_staff(org_id) and status <> 'cancelled')
  with check (public.is_org_staff(org_id));
create policy events_delete_draft on public.events
  for delete to authenticated
  using (public.is_org_staff(org_id) and status in ('draft', 'rejected'));

-- event_payment_accounts: organizers choose; students with an order can read
create policy event_payment_accounts_read on public.event_payment_accounts
  for select to authenticated
  using (public.is_event_staff(event_id) or public.is_admin() or public.has_order_for_event(event_id));
create policy event_payment_accounts_insert on public.event_payment_accounts
  for insert to authenticated
  with check (
    public.is_event_staff(event_id)
    and exists (
      select 1 from public.payment_accounts pa
      where pa.id = payment_account_id and pa.org_id = public.event_org_id(event_id)
    )
  );
create policy event_payment_accounts_delete on public.event_payment_accounts
  for delete to authenticated using (public.is_event_staff(event_id));

-- ticket_types: readable whenever the event is readable; organizers write
create policy ticket_types_read on public.ticket_types
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy ticket_types_insert on public.ticket_types
  for insert to authenticated with check (public.is_event_staff(event_id));
create policy ticket_types_update on public.ticket_types
  for update to authenticated using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));
create policy ticket_types_delete on public.ticket_types
  for delete to authenticated using (public.is_event_staff(event_id));

-- orders: buyer, the event's organizers, admins (writes only via functions)
create policy orders_read on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id) or public.is_admin());

create policy order_items_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- payment proofs: buyer, organizers of the event, admins (NFR-15)
create policy payment_proofs_read on public.payment_proofs
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id) or public.is_admin());

-- tickets: owner, organizers, admins
create policy tickets_read on public.tickets
  for select to authenticated
  using (owner_id = auth.uid() or public.is_event_staff(event_id) or public.is_admin());

-- event_staff: the scanner, organizers, admins
create policy event_staff_read on public.event_staff
  for select to authenticated
  using (user_id = auth.uid() or public.is_event_staff(event_id) or public.is_admin());

-- checkins: organizers, scanners of the event (live count), admins
create policy checkins_read on public.checkins
  for select to authenticated
  using (public.is_event_staff(event_id) or public.can_scan_event(event_id) or public.is_admin());

-- audit/email logs: admins only
create policy audit_log_read on public.audit_log
  for select to authenticated using (public.is_admin());
create policy email_log_read on public.email_log
  for select to authenticated using (public.is_admin());

-- disputes: the student who raised it and admins; student can open one
create policy disputes_read on public.disputes
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy disputes_insert_own on public.disputes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- rate_limits: no policies → only service role (bypasses RLS) can touch it

-- ---------------------------------------------------------------------------
-- Table privileges. Start from nothing, then grant exactly what the app needs.
-- RLS still applies on top of these grants.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Public read (anon + authenticated)
grant select on public.universities, public.organizations, public.events, public.ticket_types
  to anon, authenticated;

-- Authenticated read
grant select on
  public.profiles, public.organization_members, public.org_invites, public.payment_accounts,
  public.event_payment_accounts, public.orders, public.order_items, public.payment_proofs,
  public.tickets, public.event_staff, public.checkins, public.audit_log, public.email_log,
  public.disputes
  to authenticated;

-- Column-limited writes (status/admin columns can only change through functions)
grant update (full_name, phone, university_id, avatar_url) on public.profiles to authenticated;
grant update (name, university_id, type, about, logo_url, social_links, proof_path)
  on public.organizations to authenticated;
grant insert (org_id, slug, name, description, poster_url, venue, starts_at, ends_at, capacity,
              visibility, max_tickets_per_order, created_by)
  on public.events to authenticated;
grant update (name, description, poster_url, venue, starts_at, ends_at, capacity, visibility,
              max_tickets_per_order)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant insert, update, delete on public.payment_accounts to authenticated;
grant insert, delete on public.event_payment_accounts to authenticated;
grant insert, update, delete on public.ticket_types to authenticated;
grant insert (order_id, user_id, message) on public.disputes to authenticated;

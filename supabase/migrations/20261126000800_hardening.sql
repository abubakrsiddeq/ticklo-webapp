-- =============================================================================
-- TickLO v1 – hardening after the Supabase database advisors run
--  1. RLS policies use (select auth.uid()) so it is evaluated once per query,
--     not once per row (advisor: auth_rls_initplan).
--  2. Logged-out visitors can execute only the helpers their policies need
--     (advisor: anon_security_definer_function_executable).
--  3. can_scan_event only answers about the caller (or the service role).
-- =============================================================================

-- 1. Policies -----------------------------------------------------------------
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin() or public.shares_org_as_staff(id));

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy organization_members_read on public.organization_members;
create policy organization_members_read on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member_any(org_id) or public.is_admin());

drop policy org_invites_read on public.org_invites;
create policy org_invites_read on public.org_invites
  for select to authenticated
  using (
    public.is_org_owner(org_id)
    or public.is_admin()
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

drop policy events_insert_staff on public.events;
create policy events_insert_staff on public.events
  for insert to authenticated
  with check (public.is_org_staff(org_id) and created_by = (select auth.uid()) and status = 'draft');

drop policy orders_read on public.orders;
create policy orders_read on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_staff(event_id) or public.is_admin());

drop policy payment_proofs_read on public.payment_proofs;
create policy payment_proofs_read on public.payment_proofs
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_staff(event_id) or public.is_admin());

drop policy tickets_read on public.tickets;
create policy tickets_read on public.tickets
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_event_staff(event_id) or public.is_admin());

drop policy event_staff_read on public.event_staff;
create policy event_staff_read on public.event_staff
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_event_staff(event_id) or public.is_admin());

drop policy disputes_read on public.disputes;
create policy disputes_read on public.disputes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy disputes_insert_own on public.disputes;
create policy disputes_insert_own on public.disputes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'open'
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

-- 3. can_scan_event: callers may only ask about themselves ---------------------
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
            where s.event_id = e.id and s.user_id = p_user_id and s.expires_at > now()
          )
          or exists (
            select 1 from public.organization_members m
            where m.org_id = e.org_id and m.user_id = p_user_id and m.role in ('owner', 'member')
          )
        )
    );
$$;

-- 2. Function privileges --------------------------------------------------------
-- Anonymous visitors only need what the public read policies use.
revoke execute on function
  public.try_uuid(text),
  public.is_active_user(uuid),
  public.org_role_of(uuid, uuid),
  public.is_org_staff(uuid),
  public.is_org_owner(uuid),
  public.event_org_id(uuid),
  public.is_event_staff(uuid),
  public.can_scan_event(uuid, uuid),
  public.shares_org_as_staff(uuid),
  public.has_order_for_event(uuid)
from anon;

-- Internal helpers that no policy calls directly.
revoke execute on function
  public.is_active_user(uuid),
  public.org_role_of(uuid, uuid)
from authenticated;

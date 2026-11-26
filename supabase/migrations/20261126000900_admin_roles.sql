-- =============================================================================
-- TickLO – admins can change anyone's role (D-037)
--  * Platform admin on/off (profiles.is_admin). An admin cannot change their own
--    flag, so there is always at least one admin left.
--  * Society role (owner / member / scanner) for any user in any society,
--    including adding them to a society. Making someone owner moves the current
--    owner down to member (one owner per society).
--  * Remove someone from a society (not the owner – pick a new owner first).
-- Every change is written to the audit log (ADM-08).
-- =============================================================================

create or replace function public.admin_set_platform_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_user_id = auth.uid() then
    raise exception using message = 'TL:INVALID_STATE', detail = 'You cannot change your own admin access.';
  end if;
  update public.profiles set is_admin = p_is_admin where id = p_user_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;
  perform public.audit(case when p_is_admin then 'user.make_admin' else 'user.remove_admin' end, 'user', p_user_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_org_role(p_org_id uuid, p_user_id uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.org_role;
  v_old_owner uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org_id) then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Society not found.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception using message = 'TL:NOT_FOUND', detail = 'User not found.';
  end if;

  select m.role into v_old from public.organization_members m where m.org_id = p_org_id and m.user_id = p_user_id;
  if v_old = p_role then
    return;
  end if;
  if v_old = 'owner' then
    raise exception using message = 'TL:CANNOT_CHANGE_OWNER',
      detail = 'This person is the society owner. Make someone else the owner first.';
  end if;

  if p_role = 'owner' then
    select m.user_id into v_old_owner from public.organization_members m where m.org_id = p_org_id and m.role = 'owner';
    if v_old_owner is not null then
      update public.organization_members set role = 'member' where org_id = p_org_id and user_id = v_old_owner;
    end if;
  end if;

  insert into public.organization_members (org_id, user_id, role)
  values (p_org_id, p_user_id, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  perform public.audit('org.member_role', 'organization', p_org_id::text,
    jsonb_build_object('user_id', p_user_id, 'from', v_old, 'to', p_role, 'previous_owner', v_old_owner));
end;
$$;

create or replace function public.admin_remove_org_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.org_role;
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  select m.role into v_old from public.organization_members m where m.org_id = p_org_id and m.user_id = p_user_id;
  if v_old is null then
    raise exception using message = 'TL:NOT_A_MEMBER', detail = 'This person is not in that society.';
  end if;
  if v_old = 'owner' then
    raise exception using message = 'TL:CANNOT_CHANGE_OWNER',
      detail = 'The owner cannot be removed. Make someone else the owner first.';
  end if;
  delete from public.event_staff s
  where s.user_id = p_user_id and s.event_id in (select e.id from public.events e where e.org_id = p_org_id);
  delete from public.organization_members where org_id = p_org_id and user_id = p_user_id;
  perform public.audit('org.member_remove', 'organization', p_org_id::text,
    jsonb_build_object('user_id', p_user_id, 'role', v_old));
end;
$$;

revoke execute on function
  public.admin_set_platform_admin(uuid, boolean),
  public.admin_set_org_role(uuid, uuid, public.org_role),
  public.admin_remove_org_member(uuid, uuid)
from public, anon;

grant execute on function
  public.admin_set_platform_admin(uuid, boolean),
  public.admin_set_org_role(uuid, uuid, public.org_role),
  public.admin_remove_org_member(uuid, uuid)
to authenticated, service_role;

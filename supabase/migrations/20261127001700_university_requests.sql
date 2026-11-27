-- D-056: "Other" university. A student or society can type a university that
-- is not in the list. It is saved as a *pending* university that only the
-- requester (and people linked to it) can see. A TickLO admin approves it
-- (optionally fixing the name), merges it into an existing university, or
-- rejects it. Once approved, it shows everywhere like any other university.

alter table public.universities
  add column status text not null default 'approved',
  add column requested_by uuid references public.profiles (id) on delete set null,
  add constraint universities_status_check check (status in ('approved', 'pending'));

create index universities_pending_idx on public.universities (created_at) where status = 'pending';
create index universities_requested_by_idx on public.universities (requested_by) where requested_by is not null;

-- Pending universities stay out of public lists, filters and society pages.
-- Visible to: the requester, admins, anyone whose profile picked it, and
-- members of a society linked to it. Security definer so anon visitors never
-- touch profiles/organizations from inside the policy.
create or replace function public.can_see_pending_university(p_id uuid, p_requested_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    p_requested_by = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.university_id = p_id)
    or exists (
      select 1 from public.organizations o
      where o.university_id = p_id and public.is_org_member_any(o.id)
    )
  );
$$;

drop policy universities_read on public.universities;
create policy universities_read on public.universities
  for select to anon, authenticated
  using (status = 'approved' or public.can_see_pending_university(id, requested_by));

-- ---------------------------------------------------------------------------
-- request_university: returns the id to link to. Reuses an existing approved
-- university (same name or short name) or an existing pending request with
-- the same name, so the same "Other" typed twice becomes one request.
-- ---------------------------------------------------------------------------
create or replace function public.request_university(p_name text, p_city text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_city text := regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to continue.';
  end if;
  if char_length(v_name) not between 3 and 150 then
    raise exception using message = 'TL:INVALID_UNIVERSITY', detail = 'Enter your university''s full name.';
  end if;
  if char_length(v_city) not between 2 and 80 then
    raise exception using message = 'TL:INVALID_UNIVERSITY', detail = 'Enter the city of your university.';
  end if;

  select u.id into v_id
  from public.universities u
  where lower(u.name) = lower(v_name)
     or (u.status = 'approved' and lower(u.short_name) = lower(v_name))
  order by (u.status = 'approved') desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.universities u where u.requested_by = v_uid and u.status = 'pending') >= 3 then
    raise exception using message = 'TL:TOO_MANY_PENDING', detail = 'You already have 3 universities waiting for review.';
  end if;

  insert into public.universities (name, city, status, requested_by)
  values (v_name, v_city, 'pending', v_uid)
  returning id into v_id;
  perform public.audit('university.request', 'university', v_id::text, jsonb_build_object('name', v_name, 'city', v_city));
  return v_id;
end;
$$;

-- Approve a pending university, with the admin's corrections.
create or replace function public.admin_approve_university(
  p_id uuid, p_name text, p_short_name text, p_city text, p_email_domain text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  update public.universities
  set name = btrim(p_name), short_name = nullif(btrim(coalesce(p_short_name, '')), ''), city = btrim(p_city),
      email_domain = nullif(lower(btrim(coalesce(p_email_domain, ''))), ''), status = 'approved'
  where id = p_id and status = 'pending';
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'This request was already handled.';
  end if;
  perform public.audit('university.approve', 'university', p_id::text, jsonb_build_object('name', p_name));
end;
$$;

-- The typed university already exists (e.g. "Lahore Univ of Mgmt Sciences"):
-- move everyone linked to the request onto the real one, then drop the request.
create or replace function public.admin_merge_university(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Admins only.';
  end if;
  if p_from = p_into
     or not exists (select 1 from public.universities where id = p_from and status = 'pending')
     or not exists (select 1 from public.universities where id = p_into and status = 'approved') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Choose an approved university to merge into.';
  end if;
  update public.profiles set university_id = p_into where university_id = p_from;
  update public.organizations set university_id = p_into where university_id = p_from;
  update public.campus_ambassadors set university_id = p_into where university_id = p_from;
  delete from public.universities where id = p_from;
  perform public.audit('university.merge', 'university', p_from::text, jsonb_build_object('into', p_into));
end;
$$;

revoke all on function public.can_see_pending_university(uuid, uuid) from public;
grant execute on function public.can_see_pending_university(uuid, uuid) to anon, authenticated;
revoke all on function public.request_university(text, text) from public, anon;
revoke all on function public.admin_approve_university(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_merge_university(uuid, uuid) from public, anon;
grant execute on function
  public.request_university(text, text),
  public.admin_approve_university(uuid, text, text, text, text),
  public.admin_merge_university(uuid, uuid)
to authenticated;

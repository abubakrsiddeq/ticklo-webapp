-- D-060: who leads the society (president / chairperson / lead / head), so TickLO
-- can call or email them to verify a new society. Private: only TickLO admins
-- and the society's owners can read it. Written only through create_organization.
--
-- "I am the head": name and email come from the signed-in account (not from the
-- form), the phone is typed. "Someone else is the head": all three are typed.

create table public.organization_heads (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  is_submitter boolean not null,
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_heads_name_len check (char_length(btrim(name)) between 2 and 100),
  constraint organization_heads_phone_format check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint organization_heads_email_format check (
    char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create trigger organization_heads_updated_at before update on public.organization_heads
  for each row execute function public.set_updated_at();

alter table public.organization_heads enable row level security;

create policy organization_heads_read on public.organization_heads
  for select to authenticated
  using (public.is_admin() or public.is_org_owner(org_id));

revoke all on public.organization_heads from public, anon, authenticated;
grant select on public.organization_heads to authenticated;
grant all on public.organization_heads to service_role;

-- ---------------------------------------------------------------------------
-- create_organization gains the head details. They default to null so the
-- web build that is live while this migration runs keeps working; the new
-- build always sends them (and the app requires them).
-- ---------------------------------------------------------------------------
drop function public.create_organization(text, text, uuid, public.org_type, text, text, jsonb, text);

create function public.create_organization(
  p_name text,
  p_slug text,
  p_university_id uuid,
  p_type public.org_type,
  p_about text,
  p_logo_url text,
  p_social_links jsonb,
  p_proof_path text,
  p_head_is_submitter boolean default null,
  p_head_name text default null,
  p_head_phone text default null,
  p_head_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_head_name text;
  v_head_phone text := btrim(coalesce(p_head_phone, ''));
  v_head_email text;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if not public.is_active_user(v_uid) then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;
  if (select count(*) from public.organizations o where o.created_by = v_uid and o.status = 'pending') >= 3 then
    raise exception using message = 'TL:TOO_MANY_PENDING', detail = 'You already have 3 societies waiting for approval.';
  end if;
  if exists (select 1 from public.organizations o where o.slug = p_slug) then
    raise exception using message = 'TL:SLUG_TAKEN', detail = 'That society link is already taken.';
  end if;

  if p_head_is_submitter is not null then
    if p_head_is_submitter then
      -- Never trust a typed name/email here: use the account's own.
      select nullif(btrim(coalesce(p.full_name, '')), ''), lower(btrim(coalesce(p.email, u.email, '')))
        into v_head_name, v_head_email
      from public.profiles p
      left join auth.users u on u.id = p.id
      where p.id = v_uid;
      v_head_name := coalesce(v_head_name, btrim(coalesce(p_head_name, '')));
    else
      v_head_name := btrim(coalesce(p_head_name, ''));
      v_head_email := lower(btrim(coalesce(p_head_email, '')));
    end if;
    v_head_name := regexp_replace(v_head_name, '\s+', ' ', 'g');
    if char_length(v_head_name) not between 2 and 100 then
      raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter the full name of the society head.';
    end if;
    if v_head_phone !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter a valid mobile number for the society head.';
    end if;
    if char_length(v_head_email) > 254 or v_head_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter a valid email address for the society head.';
    end if;
  end if;

  insert into public.organizations (slug, name, university_id, type, about, logo_url, social_links, proof_path, created_by)
  values (
    p_slug, trim(p_name), p_university_id, coalesce(p_type, 'society'), nullif(trim(coalesce(p_about, '')), ''),
    p_logo_url, coalesce(p_social_links, '{}'::jsonb), p_proof_path, v_uid
  )
  returning id into v_org_id;

  insert into public.organization_members (org_id, user_id, role) values (v_org_id, v_uid, 'owner');

  if p_head_is_submitter is not null then
    insert into public.organization_heads (org_id, is_submitter, name, phone, email)
    values (v_org_id, p_head_is_submitter, v_head_name, v_head_phone, v_head_email);
  end if;
  return v_org_id;
end;
$$;

revoke all on function public.create_organization(text, text, uuid, public.org_type, text, text, jsonb, text, boolean, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, uuid, public.org_type, text, text, jsonb, text, boolean, text, text, text) to authenticated, service_role;

-- D-061: society owners can change the society head (president / chairperson /
-- lead) from Settings, or add it when the society was registered without one.
-- Same rules as create_organization (D-060): "I am the head" takes name and
-- email from the caller's account; "someone else" uses the typed details.

create or replace function public.set_organization_head(
  p_org_id uuid,
  p_is_submitter boolean,
  p_name text,
  p_phone text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in.';
  end if;
  if not public.is_org_owner(p_org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only the society owner can change this.';
  end if;
  if p_is_submitter is null then
    raise exception using message = 'TL:INVALID_HEAD', detail = 'Tell us who leads the society.';
  end if;

  if p_is_submitter then
    select nullif(btrim(coalesce(p.full_name, '')), ''), lower(btrim(coalesce(p.email, u.email, '')))
      into v_name, v_email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.id = v_uid;
    v_name := coalesce(v_name, btrim(coalesce(p_name, '')));
  else
    v_name := btrim(coalesce(p_name, ''));
    v_email := lower(btrim(coalesce(p_email, '')));
  end if;
  v_name := regexp_replace(v_name, '\s+', ' ', 'g');

  if char_length(v_name) not between 2 and 100 then
    raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter the full name of the society head.';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter a valid mobile number for the society head.';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using message = 'TL:INVALID_HEAD', detail = 'Enter a valid email address for the society head.';
  end if;

  insert into public.organization_heads (org_id, is_submitter, name, phone, email)
  values (p_org_id, p_is_submitter, v_name, v_phone, v_email)
  on conflict (org_id) do update
    set is_submitter = excluded.is_submitter, name = excluded.name, phone = excluded.phone, email = excluded.email;

  perform public.audit('organization.head_change', 'organization', p_org_id::text,
    jsonb_build_object('is_submitter', p_is_submitter, 'name', v_name));
end;
$$;

revoke all on function public.set_organization_head(uuid, boolean, text, text, text) from public, anon;
grant execute on function public.set_organization_head(uuid, boolean, text, text, text) to authenticated, service_role;

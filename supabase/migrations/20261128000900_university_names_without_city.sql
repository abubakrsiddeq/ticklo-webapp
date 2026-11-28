-- D-089: a university's name is stored without its city; lists show "Name (City)".
-- "Bahria University Islamabad", "Bahria University (Islamabad)" and
-- "Bahria University, Islamabad" (city Islamabad) are all saved as "Bahria University".
-- A city that is part of the real name stays: "University of Karachi",
-- "Lahore University of Management Sciences".
-- Campuses of one university in different cities now share a name, so a name
-- only has to be unique within its city.

-- Name with a city at its end taken off (plain, after a comma or dash, or in brackets).
create or replace function public.university_clean_name(p_name text, p_city text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_city text := regexp_replace(btrim(coalesce(p_city, '')), '\s+', ' ', 'g');
  v_esc text;
  v_base text;
begin
  if v_city = '' then
    return v_name;
  end if;
  v_esc := regexp_replace(v_city, '([.*+?^${}()|\[\]\\])', '\\\1', 'g');
  if v_name ~* ('\(\s*' || v_esc || '\s*\)$') then
    v_base := regexp_replace(v_name, '\s*\(\s*' || v_esc || '\s*\)$', '', 'i');
  elsif v_name ~* ('[^[:alpha:]]' || v_esc || '$') then
    v_base := regexp_replace(v_name, v_esc || '$', '', 'i');
  else
    return v_name;
  end if;
  v_base := btrim(v_base, ' ,-–');
  -- "University of Karachi": the city finishes the real name.
  if char_length(v_base) < 2 or v_base ~* '(^|\s)(of|the|at|in|for|and|&)$' then
    return v_name;
  end if;
  return v_base;
end;
$$;

-- Every insert or update (admin form, approval, "Other" request) saves the clean name,
-- and an all-lowercase city gets capitals ("dera ismail khan" -> "Dera Ismail Khan").
create or replace function public.universities_clean_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.city := regexp_replace(btrim(new.city), '\s+', ' ', 'g');
  if new.city = lower(new.city) then
    new.city := initcap(new.city);
  end if;
  new.name := public.university_clean_name(new.name, new.city);
  return new;
end;
$$;

drop index public.universities_name_key;
create unique index universities_name_city_key on public.universities (lower(name), lower(city));

create trigger universities_clean_name before insert or update of name, city on public.universities
  for each row execute function public.universities_clean_name();

-- Clean the names already saved.
update public.universities set name = name;

-- request_university: same as D-057, but a typed name is matched after cleaning and
-- within its city, so "Bahria University Karachi" finds the Karachi campus.
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
  v_clean text;
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
  v_clean := public.university_clean_name(v_name, v_city);

  select u.id into v_id
  from public.universities u
  where (lower(u.name) = lower(v_clean) and lower(u.city) = lower(v_city))
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
  values (v_clean, v_city, 'pending', v_uid)
  returning id into v_id;
  perform public.audit('university.request', 'university', v_id::text, jsonb_build_object('name', v_clean, 'city', v_city));
  return v_id;
end;
$$;

revoke all on function public.university_clean_name(text, text) from public, anon;
revoke all on function public.universities_clean_name() from public, anon, authenticated;

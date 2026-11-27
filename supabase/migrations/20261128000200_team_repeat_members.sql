-- =============================================================================
-- TickLO – the same person cannot be listed twice in one team (D-074)
--
-- clean_members_form already refused the same mobile number or email twice. It now also
-- refuses the same roll number at the same university, and two members with every detail
-- the same, and says which members repeat ("Member 2 has the same email as member 1.").
-- Same rule as repeatedMembers() in web/lib/registration-form.ts.
-- =============================================================================

create or replace function public.clean_members_form(p_members jsonb, p_fields jsonb, p_context text default 'Member')
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_m jsonb;
  v_flat jsonb;
  v_clean jsonb;
  v_out jsonb := '[]'::jsonb;
  v_builtin text[] := array['name', 'phone', 'email', 'roll_no', 'university'];
  v_name text;
  n int := 0;
  v_repeat text;
begin
  if p_members is null or jsonb_typeof(p_members) <> 'array' then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Add your team members.';
  end if;
  for v_m in select * from jsonb_array_elements(p_members) loop
    n := n + 1;
    v_name := regexp_replace(btrim(coalesce(v_m ->> 'name', '')), '\s+', ' ', 'g');
    if char_length(v_name) not between 2 and 80 then
      raise exception using message = 'TL:INVALID_ITEMS', detail = 'Every member needs a name.';
    end if;
    v_flat := (case when jsonb_typeof(v_m -> 'answers') = 'object' then v_m -> 'answers' else '{}'::jsonb end)
      || jsonb_strip_nulls(jsonb_build_object(
        'name', v_name, 'phone', v_m -> 'phone', 'email', v_m -> 'email', 'roll_no', v_m -> 'roll_no', 'university', v_m -> 'university'));
    v_clean := public.validate_form_answers(p_fields, v_flat, v_name);
    -- the name is always kept, even if a form hid it
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(
      jsonb_build_object(
        'name', v_name,
        'phone', v_clean -> 'phone', 'email', v_clean -> 'email', 'roll_no', v_clean -> 'roll_no', 'university', v_clean -> 'university',
        'answers', nullif(v_clean - v_builtin, '{}'::jsonb)
      )
    ));
  end loop;

  -- D-074: the same person twice: same mobile, email, roll number at the same university, or every detail
  select format('Member %s has the same %s as member %s. Each member must be a different person.', b.n, w.what, a.n)
  into v_repeat
  from jsonb_array_elements(v_out) with ordinality a(m, n)
  join jsonb_array_elements(v_out) with ordinality b(m, n) on b.n > a.n
  cross join lateral (
    select case
      when a.m ? 'phone' and a.m ->> 'phone' = b.m ->> 'phone' then 'mobile number'
      when a.m ? 'email' and lower(a.m ->> 'email') = lower(b.m ->> 'email') then 'email'
      when a.m ? 'roll_no' and lower(btrim(a.m ->> 'roll_no')) = lower(btrim(b.m ->> 'roll_no'))
           and lower(btrim(coalesce(a.m ->> 'university', ''))) = lower(btrim(coalesce(b.m ->> 'university', ''))) then 'roll number'
      when lower(a.m::text) = lower(b.m::text) then 'details'
    end as what
  ) w
  where w.what is not null
  order by b.n, a.n
  limit 1;
  if v_repeat is not null then
    raise exception using message = 'TL:INVALID_ITEMS', detail = v_repeat;
  end if;
  return v_out;
end;
$$;

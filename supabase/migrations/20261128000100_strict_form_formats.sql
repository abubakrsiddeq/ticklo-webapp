-- =============================================================================
-- TickLO – strict formats in registration and ticket forms (D-073)
--
-- Form answers (competition registrations, ticket holder details):
--   mobile number: Pakistani mobiles only, +92 followed by 10 digits (+923XXXXXXXXX)
--   email:         name@domain.tld (same pattern as the app)
--   link:          http(s) with a real domain, no spaces
--   date:          a real date between 1900 and 2100
-- Society heads: the same mobile rule for new or changed numbers (older rows stay).
-- =============================================================================

create or replace function public.validate_form_answers(p_fields jsonb, p_answers jsonb, p_context text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_f jsonb;
  v_id text;
  v_type text;
  v_raw jsonb;
  v_val text;
  v_arr jsonb;
  v_out jsonb := '{}'::jsonb;
  v_answers jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
  v_cond jsonb;
  v_cond_val jsonb;
  v_max int;
  v_min numeric;
  v_maxn numeric;
  v_num numeric;
  v_label text;
  v_shown boolean;
  v_date date;
begin
  for v_f in select * from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) loop
    v_id := v_f ->> 'id';
    v_type := v_f ->> 'type';
    v_label := coalesce(v_f ->> 'label', v_id);
    if coalesce((v_f ->> 'hidden')::boolean, false) then
      continue;
    end if;
    -- condition: show only when an earlier field has this answer
    v_cond := v_f -> 'show_if';
    v_shown := true;
    if v_cond is not null and jsonb_typeof(v_cond) = 'object' then
      v_cond_val := v_out -> (v_cond ->> 'field');
      v_shown := case
        when v_cond_val is null then false
        when jsonb_typeof(v_cond_val) = 'array' then v_cond_val ? (v_cond ->> 'equals')
        else v_cond_val #>> '{}' = v_cond ->> 'equals'
      end;
    end if;
    if not v_shown then
      continue;
    end if;

    v_raw := v_answers -> v_id;
    if v_type = 'multi' then
      v_arr := case when jsonb_typeof(v_raw) = 'array' then v_raw else '[]'::jsonb end;
      select coalesce(jsonb_agg(distinct btrim(x)), '[]'::jsonb) into v_arr
      from jsonb_array_elements_text(v_arr) x where btrim(x) <> '';
      if jsonb_array_length(v_arr) = 0 then
        if coalesce((v_f ->> 'required')::boolean, false) then
          raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: please answer "%s".', p_context, v_label);
        end if;
        continue;
      end if;
      if exists (select 1 from jsonb_array_elements_text(v_arr) x where not (coalesce(v_f -> 'options', '[]'::jsonb) ? x)) then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: choose from the list for "%s".', p_context, v_label);
      end if;
      v_out := v_out || jsonb_build_object(v_id, v_arr);
      continue;
    end if;

    v_val := btrim(coalesce(case when jsonb_typeof(v_raw) in ('string', 'number', 'boolean') then v_raw #>> '{}' end, ''));
    if v_val = '' then
      if coalesce((v_f ->> 'required')::boolean, false) then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: please answer "%s".', p_context, v_label);
      end if;
      continue;
    end if;

    v_max := case
      when v_id = 'name' then 80 when v_id = 'roll_no' then 40 when v_id = 'university' then 120
      when v_type = 'long_text' then least(coalesce(nullif(v_f ->> 'max', '')::int, 2000), 2000)
      when v_type in ('short_text') then least(coalesce(nullif(v_f ->> 'max', '')::int, 200), 300)
      else 300
    end;
    if v_type in ('short_text', 'long_text') then
      if char_length(v_val) > v_max then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" can be at most %s characters.', p_context, v_label, v_max);
      end if;
      if v_id = 'name' and char_length(v_val) < 2 then
        raise exception using message = 'TL:INVALID_ITEMS', detail = 'Every member needs a name.';
      end if;
      if nullif(v_f ->> 'min', '') is not null and char_length(v_val) < (v_f ->> 'min')::int then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" needs at least %s characters.', p_context, v_label, v_f ->> 'min');
      end if;
    elsif v_type = 'number' then
      if v_val !~ '^-?[0-9]{1,12}(\.[0-9]{1,4})?$' then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" must be a number.', p_context, v_label);
      end if;
      v_num := v_val::numeric;
      v_min := nullif(v_f ->> 'min', '')::numeric;
      v_maxn := nullif(v_f ->> 'max', '')::numeric;
      if (v_min is not null and v_num < v_min) or (v_maxn is not null and v_num > v_maxn) then
        raise exception using message = 'TL:ANSWERS_REQUIRED',
          detail = format('%s: "%s" must be between %s and %s.', p_context, v_label, coalesce(v_min::text, '…'), coalesce(v_maxn::text, '…'));
      end if;
    elsif v_type = 'select' then
      if not (coalesce(v_f -> 'options', '[]'::jsonb) ? v_val) then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: choose from the list for "%s".', p_context, v_label);
      end if;
    elsif v_type = 'yes_no' then
      if v_val not in ('yes', 'no') then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: answer yes or no for "%s".', p_context, v_label);
      end if;
    elsif v_type = 'email' then
      v_val := lower(v_val);
      if char_length(v_val) > 120 or v_val !~ '^[a-z0-9_''+.-]*[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$' or v_val ~ '^\.' or v_val ~ '\.\.' then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('%s: check the email for "%s".', p_context, v_label);
      end if;
    elsif v_type = 'phone' then
      if v_val !~ '^\+923[0-9]{9}$' then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('%s: "%s" must be a Pakistani mobile number (+92 3XX XXXXXXX).', p_context, v_label);
      end if;
    elsif v_type = 'url' then
      if char_length(v_val) > 300 or v_val !~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" must be a full link starting with https://.', p_context, v_label);
      end if;
    elsif v_type = 'date' then
      begin
        v_date := v_val::date;
      exception when others then
        v_date := null;
      end;
      if v_date is null or v_val !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_date not between date '1900-01-01' and date '2100-12-31' then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" must be a date.', p_context, v_label);
      end if;
    elsif v_type = 'file' then
      if v_val !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: upload the file again for "%s".', p_context, v_label);
      end if;
    end if;
    v_out := v_out || jsonb_build_object(v_id, v_val);
  end loop;
  return v_out;
end;
$$;

alter table public.organization_heads
  add constraint organization_heads_phone_pk check (phone ~ '^\+923[0-9]{9}$') not valid;

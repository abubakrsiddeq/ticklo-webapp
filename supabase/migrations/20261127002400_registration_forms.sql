-- =============================================================================
-- TickLO – registration form builder for competitions (D-068)
--
-- Each competition has a form with two parts:
--   member: asked for every participant (built-in name / phone / email /
--           roll_no / university plus the organizer's own fields)
--   team:   asked once per registration
-- Field: {id, type, label, help?, required, hidden, options?, min?, max?,
--         show_if?: {field, equals}, builtin?}
-- Types: short_text, long_text, number, select, multi, yes_no, email, phone,
--        url, date, file. Built-in member fields keep their keys on the member
--        object; other answers go to member.answers / team_registrations.answers.
-- After registrations exist: no new required field, no removing a field (hide
-- it instead), no changing a field's type.
-- =============================================================================

alter table public.event_sessions
  add column form jsonb not null default '{"member": [], "team": []}'::jsonb,
  add constraint event_sessions_form_object check (jsonb_typeof(form) = 'object');

-- Files people attach to a registration (CV, student card…): private, read by
-- organizers / session managers through signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-files', 'registration-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Default form (also used when a competition has no form saved)
-- ---------------------------------------------------------------------------
create or replace function public.default_registration_form(p_required text[] default array['phone', 'university'])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'member', jsonb_build_array(
      jsonb_build_object('id', 'name', 'type', 'short_text', 'label', 'Full name', 'required', true, 'hidden', false, 'builtin', true),
      jsonb_build_object('id', 'phone', 'type', 'phone', 'label', 'Mobile number', 'required', 'phone' = any (p_required), 'hidden', false, 'builtin', true),
      jsonb_build_object('id', 'university', 'type', 'short_text', 'label', 'University', 'required', 'university' = any (p_required), 'hidden', false, 'builtin', true),
      jsonb_build_object('id', 'email', 'type', 'email', 'label', 'Email', 'required', 'email' = any (p_required), 'hidden', false, 'builtin', true),
      jsonb_build_object('id', 'roll_no', 'type', 'short_text', 'label', 'Roll / student ID', 'required', 'roll_no' = any (p_required), 'hidden', false, 'builtin', true),
      jsonb_build_object('id', 'department', 'type', 'short_text', 'label', 'Department / semester', 'required', false, 'hidden', true)
    ),
    'team', '[]'::jsonb
  );
$$;

-- The form in use: the saved one, or the default when none was saved yet
create or replace function public.session_form(p_session public.event_sessions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_array_length(coalesce(p_session.form -> 'member', '[]'::jsonb)) = 0 then
      public.default_registration_form(p_session.member_required)
      || jsonb_build_object('team', coalesce((
           select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', q ->> 'id',
             'type', case q ->> 'type' when 'text' then 'short_text' else q ->> 'type' end,
             'label', q ->> 'label',
             'required', coalesce((q ->> 'required')::boolean, false),
             'hidden', false,
             'options', case when q ->> 'type' = 'select' then q -> 'options' end
           )))
           from jsonb_array_elements(coalesce(p_session.questions, '[]'::jsonb)) q
         ), '[]'::jsonb))
    else p_session.form
  end;
$$;

-- Existing competitions get their form now (member details + questions)
update public.event_sessions s set form = public.session_form(s) where s.kind = 'competition';

-- ---------------------------------------------------------------------------
-- Answers: one flat object {field id: value} checked against fields.
-- Hidden fields and fields whose condition is not met are dropped.
-- ---------------------------------------------------------------------------
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
      if char_length(v_val) > 120 or v_val !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('%s: check the email for "%s".', p_context, v_label);
      end if;
    elsif v_type = 'phone' then
      if v_val !~ '^\+[1-9][0-9]{7,14}$' then
        raise exception using message = 'TL:INVALID_ITEMS', detail = format('%s: check the mobile number for "%s".', p_context, v_label);
      end if;
    elsif v_type = 'url' then
      if char_length(v_val) > 300 or v_val !~ '^https?://[^\s]+\.[^\s]+' then
        raise exception using message = 'TL:ANSWERS_REQUIRED', detail = format('%s: "%s" must be a full link starting with https://.', p_context, v_label);
      end if;
    elsif v_type = 'date' then
      begin
        v_date := v_val::date;
      exception when others then
        v_date := null;
      end;
      if v_date is null or v_val !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
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

-- Members: built-in details stay on the member object, the rest in answers.
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

  if exists (
    select 1 from jsonb_array_elements(v_out) m where m ? 'phone' group by m ->> 'phone' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(v_out) m where m ? 'email' group by m ->> 'email' having count(*) > 1
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'The same person is listed twice (same mobile number or email).';
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer saves the form (structure checks + rules once people registered)
-- ---------------------------------------------------------------------------
create or replace function public.set_session_form(p_session_id uuid, p_form jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.event_sessions;
  v_org uuid;
  v_old jsonb;
  v_scope text;
  v_f jsonb;
  v_old_f jsonb;
  v_ids text[] := '{}';
  v_scope_ids text[];
  v_types text[] := array['short_text', 'long_text', 'number', 'select', 'multi', 'yes_no', 'email', 'phone', 'url', 'date', 'file'];
  v_builtin_types jsonb := '{"name": "short_text", "phone": "phone", "email": "email", "roll_no": "short_text", "university": "short_text"}'::jsonb;
  v_total int := 0;
  v_has_regs boolean;
  v_opt text;
  v_cond jsonb;
  v_target jsonb;
begin
  select * into v_session from public.event_sessions where id = p_session_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  select e.org_id into v_org from public.events e where e.id = v_session.event_id;
  if not public.is_org_staff(v_org) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change this.';
  end if;
  if v_session.kind <> 'competition' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Registration forms are for competitions.';
  end if;
  if jsonb_typeof(p_form) <> 'object' or jsonb_typeof(p_form -> 'member') <> 'array' or jsonb_typeof(p_form -> 'team') <> 'array' then
    raise exception using message = 'TL:INVALID_FORM', detail = 'The form is not valid.';
  end if;

  foreach v_scope in array array['member', 'team'] loop
    v_scope_ids := '{}';
    for v_f in select * from jsonb_array_elements(p_form -> v_scope) loop
      v_total := v_total + 1;
      if coalesce(v_f ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (v_f ->> 'id') = any (v_ids) then
        raise exception using message = 'TL:INVALID_FORM', detail = 'Every field needs its own id.';
      end if;
      if not ((v_f ->> 'type') = any (v_types)) then
        raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" has an unknown type.', v_f ->> 'label');
      end if;
      if char_length(btrim(coalesce(v_f ->> 'label', ''))) not between 1 and 120 or char_length(coalesce(v_f ->> 'help', '')) > 300 then
        raise exception using message = 'TL:INVALID_FORM', detail = 'Every field needs a label (up to 120 characters) and a short help text (up to 300).';
      end if;
      if v_builtin_types ? (v_f ->> 'id') and (v_scope <> 'member' or v_builtin_types ->> (v_f ->> 'id') <> v_f ->> 'type') then
        raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" is a built-in member detail and keeps its type.', v_f ->> 'label');
      end if;
      if (v_f ->> 'type') in ('select', 'multi') then
        if jsonb_typeof(v_f -> 'options') <> 'array' or jsonb_array_length(v_f -> 'options') not between 1 and 20 then
          raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" needs 1 to 20 options.', v_f ->> 'label');
        end if;
        for v_opt in select * from jsonb_array_elements_text(v_f -> 'options') loop
          if char_length(btrim(v_opt)) not between 1 and 100 then
            raise exception using message = 'TL:INVALID_FORM', detail = format('Options of "%s" must be 1 to 100 characters.', v_f ->> 'label');
          end if;
        end loop;
      end if;
      v_cond := v_f -> 'show_if';
      if v_cond is not null and jsonb_typeof(v_cond) <> 'null' then
        select f into v_target from jsonb_array_elements(p_form -> v_scope) f where f ->> 'id' = v_cond ->> 'field';
        if not ((v_cond ->> 'field') = any (v_scope_ids)) or (v_target ->> 'type') not in ('select', 'multi', 'yes_no')
           or coalesce(v_cond ->> 'equals', '') = '' then
          raise exception using message = 'TL:INVALID_FORM',
            detail = format('"%s" can only depend on an earlier choice question in the same part.', v_f ->> 'label');
        end if;
      end if;
      v_ids := v_ids || (v_f ->> 'id');
      v_scope_ids := v_scope_ids || (v_f ->> 'id');
    end loop;
  end loop;
  if v_total > 25 then
    raise exception using message = 'TL:INVALID_FORM', detail = 'A form can have at most 25 fields.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_form -> 'member') f
    where f ->> 'id' = 'name' and coalesce((f ->> 'required')::boolean, false) and not coalesce((f ->> 'hidden')::boolean, false)
  ) then
    raise exception using message = 'TL:INVALID_FORM', detail = 'Full name is always asked and required.';
  end if;

  -- once people registered: keep their answers meaningful
  v_has_regs := exists (select 1 from public.team_registrations r where r.session_id = p_session_id and r.status in ('pending', 'approved'));
  if v_has_regs then
    v_old := public.session_form(v_session);
    foreach v_scope in array array['member', 'team'] loop
      for v_old_f in select * from jsonb_array_elements(v_old -> v_scope) loop
        select f into v_f from jsonb_array_elements(p_form -> v_scope) f where f ->> 'id' = v_old_f ->> 'id';
        if v_f is null then
          raise exception using message = 'TL:FORM_LOCKED',
            detail = format('People have registered, so "%s" cannot be removed. Hide it instead.', v_old_f ->> 'label');
        end if;
        if v_f ->> 'type' <> v_old_f ->> 'type' then
          raise exception using message = 'TL:FORM_LOCKED',
            detail = format('People have registered, so the type of "%s" cannot change.', v_old_f ->> 'label');
        end if;
        if coalesce((v_f ->> 'required')::boolean, false) and not coalesce((v_f ->> 'hidden')::boolean, false)
           and (not coalesce((v_old_f ->> 'required')::boolean, false) or coalesce((v_old_f ->> 'hidden')::boolean, false)) then
          raise exception using message = 'TL:FORM_LOCKED',
            detail = format('People have registered, so "%s" cannot become required now.', v_f ->> 'label');
        end if;
        v_f := null;
      end loop;
      for v_f in select * from jsonb_array_elements(p_form -> v_scope) loop
        if not exists (select 1 from jsonb_array_elements(v_old -> v_scope) o where o ->> 'id' = v_f ->> 'id')
           and coalesce((v_f ->> 'required')::boolean, false) and not coalesce((v_f ->> 'hidden')::boolean, false) then
          raise exception using message = 'TL:FORM_LOCKED',
            detail = format('People have registered, so the new field "%s" must be optional.', v_f ->> 'label');
        end if;
      end loop;
    end loop;
  end if;

  update public.event_sessions
  set form = jsonb_build_object('member', p_form -> 'member', 'team', p_form -> 'team'),
      member_required = coalesce((
        select array_agg(f ->> 'id' order by f ->> 'id') from jsonb_array_elements(p_form -> 'member') f
        where f ->> 'id' in ('phone', 'email', 'roll_no', 'university')
          and coalesce((f ->> 'required')::boolean, false) and not coalesce((f ->> 'hidden')::boolean, false)
      ), '{}')
  where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registering and editing follow the form
-- ---------------------------------------------------------------------------
create or replace function public.register_team(
  p_session_id uuid,
  p_team_name text,
  p_members jsonb,
  p_answers jsonb default null,
  p_code text default null,
  p_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_session public.event_sessions;
  v_event public.events;
  v_type public.ticket_types;
  v_members jsonb;
  v_conflict text;
  v_count int;
  v_team text := btrim(coalesce(p_team_name, ''));
  v_answers jsonb;
  v_id uuid;
  v_order jsonb;
begin
  if v_uid is null then
    raise exception using message = 'TL:NOT_AUTHENTICATED', detail = 'Please log in to register.';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.is_suspended then
    raise exception using message = 'TL:SUSPENDED', detail = 'Your account is suspended.';
  end if;
  if coalesce(char_length(btrim(v_profile.full_name)), 0) < 2 or coalesce(char_length(btrim(v_profile.phone)), 0) < 8 then
    raise exception using message = 'TL:PROFILE_INCOMPLETE', detail = 'Please add your full name and phone number first.';
  end if;

  select * into v_session from public.event_sessions where id = p_session_id for update;
  if not found or v_session.kind <> 'competition' then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Competition not found.';
  end if;
  select * into v_event from public.events where id = v_session.event_id;
  if v_event.status <> 'published' then
    raise exception using message = 'TL:EVENT_NOT_ON_SALE', detail = 'Registration is not open.';
  end if;
  select * into v_type from public.ticket_types where registration_session_id = p_session_id;
  if v_type.id is null then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Registration for this competition is not set up.';
  end if;
  if v_type.sale_starts_at is not null and now() < v_type.sale_starts_at then
    raise exception using message = 'TL:SALE_NOT_STARTED', detail = 'Registration has not opened yet.';
  end if;
  if now() >= coalesce(v_type.sale_ends_at, v_session.starts_at) then
    raise exception using message = 'TL:SALE_CLOSED', detail = 'Registration is closed.';
  end if;

  -- D-064: organizer-chosen required details; individuals enter under their own name
  v_members := public.clean_members_form(p_members, public.session_form(v_session) -> 'member');
  if v_session.team_max = 1 then
    v_team := v_members -> 0 ->> 'name';
  end if;
  if char_length(v_team) not between 2 and 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give your team a name (2 to 80 characters).';
  end if;
  v_count := jsonb_array_length(v_members);
  if v_count not between v_session.team_min and v_session.team_max then
    raise exception using message = 'TL:INVALID_ITEMS',
      detail = case when v_session.team_min = v_session.team_max then format('Teams must have exactly %s members.', v_session.team_min)
                    else format('Teams must have %s to %s members.', v_session.team_min, v_session.team_max) end;
  end if;
  if exists (
    select 1 from public.team_registrations r
    where r.session_id = p_session_id and r.user_id = v_uid and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:ALREADY_REGISTERED', detail = 'You have already registered a team for this competition.';
  end if;
  if v_session.team_max > 1 and exists (
    select 1 from public.team_registrations r
    where r.session_id = p_session_id and lower(r.team_name) = lower(v_team) and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Another team already uses this name.';
  end if;
  if not v_session.needs_approval and public.session_teams_taken(p_session_id) >= coalesce(v_session.capacity, 0) then
    raise exception using message = 'TL:SOLD_OUT', detail = format('"%s" is full – no places left.', v_session.name);
  end if;
  v_conflict := public.team_member_conflict(p_session_id, v_members, null);
  if v_conflict is not null then
    raise exception using message = 'TL:MEMBER_TAKEN', detail = v_conflict;
  end if;
  v_answers := public.validate_form_answers(public.session_form(v_session) -> 'team', p_answers, v_session.name);
  if not public.rate_limit_hit('register_team:' || v_uid::text, 20, 3600) then
    raise exception using message = 'TL:RATE_LIMITED', detail = 'Too many registrations. Please try again later.';
  end if;

  insert into public.team_registrations (event_id, session_id, user_id, team_name, members, member_count, answers, status)
  values (v_session.event_id, p_session_id, v_uid, v_team, v_members, v_count, v_answers,
          case when v_session.needs_approval then 'pending' else 'approved' end)
  returning id into v_id;

  if not v_session.needs_approval then
    v_order := public.create_order(v_session.event_id, null, null, null, p_code, p_ref, null, v_id);
  end if;

  return jsonb_build_object(
    'registration_id', v_id,
    'status', case when v_session.needs_approval then 'pending' else 'approved' end,
    'order', v_order
  );
end;
$$;

drop function public.update_team_members(uuid, text, jsonb);

create function public.update_team_members(p_registration_id uuid, p_team_name text, p_members jsonb, p_answers jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.team_registrations;
  v_session public.event_sessions;
  v_members jsonb;
  v_count int;
  v_team text := btrim(coalesce(p_team_name, ''));
  v_order public.orders;
  v_conflict text;
  i int;
begin
  select * into v_reg from public.team_registrations where id = p_registration_id for update;
  if not found or v_reg.user_id <> auth.uid() then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Registration not found.';
  end if;
  if v_reg.status not in ('pending', 'approved') then
    raise exception using message = 'TL:INVALID_STATE', detail = 'This registration is closed.';
  end if;
  select * into v_session from public.event_sessions where id = v_reg.session_id for update;
  if now() >= v_session.starts_at then
    raise exception using message = 'TL:INVALID_STATE', detail = 'The competition has started, so the team can no longer be changed.';
  end if;

  v_members := public.clean_members_form(p_members, public.session_form(v_session) -> 'member');
  v_count := jsonb_array_length(v_members);
  if v_count not between v_session.team_min and v_session.team_max then
    raise exception using message = 'TL:INVALID_ITEMS',
      detail = case when v_session.team_min = v_session.team_max then format('Teams must have exactly %s members.', v_session.team_min)
                    else format('Teams must have %s to %s members.', v_session.team_min, v_session.team_max) end;
  end if;
  if v_session.team_max = 1 then
    v_team := v_members -> 0 ->> 'name';
  elsif char_length(v_team) not between 2 and 80 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Give your team a name (2 to 80 characters).';
  elsif exists (
    select 1 from public.team_registrations r
    where r.session_id = v_reg.session_id and r.id <> v_reg.id and lower(r.team_name) = lower(v_team) and r.status in ('pending', 'approved')
  ) then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Another team already uses this name.';
  end if;
  v_conflict := public.team_member_conflict(v_reg.session_id, v_members, v_reg.id);
  if v_conflict is not null then
    raise exception using message = 'TL:MEMBER_TAKEN', detail = v_conflict;
  end if;

  if v_reg.order_id is not null then
    select * into v_order from public.orders where id = v_reg.order_id for update;
    if v_order.status in ('approved', 'under_review') and v_count <> v_reg.member_count then
      raise exception using message = 'TL:INVALID_STATE',
        detail = format('You have paid for %s members, so keep %s. Replace members instead of adding or removing.', v_reg.member_count, v_reg.member_count);
    end if;
    -- unpaid booking for a per-member fee: the amount changes, so book again
    if v_order.status = 'awaiting_payment' and v_count <> v_reg.member_count and v_session.fee_mode = 'per_member' then
      update public.orders set status = 'expired' where id = v_order.id;
    end if;
  end if;

  update public.team_registrations
  set team_name = v_team, members = v_members, member_count = v_count,
      answers = case when p_answers is null then answers
                     else public.validate_form_answers(public.session_form(v_session) -> 'team', p_answers, v_session.name) end
  where id = v_reg.id;

  -- names on tickets that have not been used yet
  if v_reg.order_id is not null then
    for i in 1..v_count loop
      update public.tickets t
      set holder_name = left(v_members -> (i - 1) ->> 'name', 120),
          holder_university = nullif(left(btrim(coalesce(v_members -> (i - 1) ->> 'university', '')), 120), '')
      where t.order_id = v_reg.order_id and t.team_member_index = i - 1
        and t.checked_in_at is null and t.entry_at is null
        and not exists (select 1 from public.session_checkins c where c.ticket_id = t.id);
    end loop;
  end if;
  perform public.audit('team.update', 'event', v_reg.event_id::text,
    jsonb_build_object('registration_id', v_reg.id, 'team', v_team, 'members', v_count));
end;
$$;

drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[], attendee_names text, attendee_university text, poster_url text, form jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end, s.member_required, s.attendee_names, s.attendee_university, s.poster_url,
         case when s.kind = 'competition' then public.session_form(s) else '{}'::jsonb end
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

drop function public.my_team_registrations();

create function public.my_team_registrations()
returns table (
  id uuid, team_name text, member_count integer, status text, reject_reason text, created_at timestamptz,
  session_id uuid, session_name text, session_starts_at timestamptz, needs_approval boolean,
  event_id uuid, event_name text, event_slug text, org_slug text,
  order_id uuid, order_status public.order_status, hold_expires_at timestamptz, fee_paisa integer, fee_mode text,
  members jsonb, pay_by timestamptz, team_min integer, team_max integer, member_required text[],
  answers jsonb, form jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.team_name, r.member_count, r.status, r.reject_reason, r.created_at,
         s.id, s.name, s.starts_at, s.needs_approval, e.id, e.name, e.slug, og.slug,
         o.id, o.status, o.hold_expires_at, rt.price_paisa, s.fee_mode,
         r.members, r.pay_by, s.team_min, s.team_max, s.member_required,
         r.answers, public.session_form(s)
  from public.team_registrations r
  join public.event_sessions s on s.id = r.session_id
  join public.events e on e.id = r.event_id
  join public.organizations og on og.id = e.org_id
  left join public.orders o on o.id = r.order_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where r.user_id = auth.uid()
  order by s.starts_at desc, r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.default_registration_form(text[]) from public, anon, authenticated;
revoke all on function public.session_form(public.event_sessions) from public, anon, authenticated;
revoke all on function public.validate_form_answers(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.clean_members_form(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function
  public.default_registration_form(text[]),
  public.session_form(public.event_sessions),
  public.validate_form_answers(jsonb, jsonb, text),
  public.clean_members_form(jsonb, jsonb, text)
to service_role;
revoke all on function public.set_session_form(uuid, jsonb) from public, anon;
revoke all on function public.update_team_members(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.my_team_registrations() from public, anon;
revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.set_session_form(uuid, jsonb), public.update_team_members(uuid, text, jsonb, jsonb), public.my_team_registrations()
  to authenticated, service_role;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;

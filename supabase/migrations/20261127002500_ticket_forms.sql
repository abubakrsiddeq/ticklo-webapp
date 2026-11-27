-- =============================================================================
-- TickLO – the form builder for every ticket, not only competitions (D-069)
--
-- Sessions (workshop, concert, talk, qawwali…) and single / competition events
-- get a "ticket form": fields asked for every ticket holder. Built-in fields
-- (name, phone, university, email, roll_no) plus the organizer's own; same
-- types, conditions and rules as D-068. Default: nothing asked (the buyer's
-- name goes on the ticket). Older settings (D-064 / D-065 name / university
-- and session questions) become the form when none was saved.
--   Session ticket (by name): its session's whole form.
--   Pass: only the built-in details of the sessions in passes (strictest).
--   Single / competition event: the event's form.
-- Answers: tickets.holder_name / holder_university / holder_phone, the rest in
-- tickets.answers {session id | "event": {field: value}}.
-- =============================================================================

alter table public.events
  add column ticket_form jsonb not null default '[]'::jsonb,
  add constraint events_ticket_form_array check (jsonb_typeof(ticket_form) = 'array');

-- Built-in ticket field (hidden / optional / required from an off|optional|required setting)
create or replace function public.ticket_builtin(p_id text, p_type text, p_label text, p_level text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p_id, 'type', p_type, 'label', p_label, 'builtin', true,
    'required', coalesce(p_level, 'off') = 'required', 'hidden', coalesce(p_level, 'off') = 'off');
$$;

create or replace function public.ticket_fields_of_session(p_session public.event_sessions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_session.kind = 'competition' then '[]'::jsonb
    when jsonb_array_length(coalesce(p_session.form -> 'member', '[]'::jsonb)) > 0 then p_session.form -> 'member'
    else jsonb_build_array(
        public.ticket_builtin('name', 'short_text', 'Name of the person', p_session.attendee_names),
        public.ticket_builtin('university', 'short_text', 'University', p_session.attendee_university),
        public.ticket_builtin('phone', 'phone', 'Mobile number', 'off'),
        public.ticket_builtin('email', 'email', 'Email', 'off'),
        public.ticket_builtin('roll_no', 'short_text', 'Roll / student ID', 'off')
      ) || coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', q ->> 'id',
          'type', case q ->> 'type' when 'text' then 'short_text' else q ->> 'type' end,
          'label', q ->> 'label',
          'required', coalesce((q ->> 'required')::boolean, false),
          'hidden', false,
          'options', case when q ->> 'type' = 'select' then q -> 'options' end
        )))
        from jsonb_array_elements(coalesce(p_session.questions, '[]'::jsonb)) q
      ), '[]'::jsonb)
  end;
$$;

create or replace function public.ticket_fields_of_event(p_event public.events)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_event.format = 'festival' then '[]'::jsonb
    when jsonb_array_length(p_event.ticket_form) > 0 then p_event.ticket_form
    else jsonb_build_array(
      public.ticket_builtin('name', 'short_text', 'Name of the person', p_event.attendee_names),
      public.ticket_builtin('university', 'short_text', 'University', p_event.attendee_university),
      public.ticket_builtin('phone', 'phone', 'Mobile number', 'off'),
      public.ticket_builtin('email', 'email', 'Email', 'off'),
      public.ticket_builtin('roll_no', 'short_text', 'Roll / student ID', 'off')
    )
  end;
$$;

-- Structure of a ticket form (like set_session_form, but the name may be hidden)
create or replace function public.check_ticket_fields(p_fields jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_f jsonb;
  v_ids text[] := '{}';
  v_types text[] := array['short_text', 'long_text', 'number', 'select', 'multi', 'yes_no', 'email', 'phone', 'url', 'date', 'file'];
  v_builtin_types jsonb := '{"name": "short_text", "phone": "phone", "email": "email", "roll_no": "short_text", "university": "short_text"}'::jsonb;
  v_opt text;
  v_target jsonb;
begin
  if jsonb_typeof(p_fields) <> 'array' then
    raise exception using message = 'TL:INVALID_FORM', detail = 'The form is not valid.';
  end if;
  if jsonb_array_length(p_fields) > 25 then
    raise exception using message = 'TL:INVALID_FORM', detail = 'A form can have at most 25 fields.';
  end if;
  for v_f in select * from jsonb_array_elements(p_fields) loop
    if coalesce(v_f ->> 'id', '') !~ '^[a-z0-9_]{1,40}$' or (v_f ->> 'id') = any (v_ids) then
      raise exception using message = 'TL:INVALID_FORM', detail = 'Every field needs its own id.';
    end if;
    if not ((v_f ->> 'type') = any (v_types)) then
      raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" has an unknown type.', v_f ->> 'label');
    end if;
    if char_length(btrim(coalesce(v_f ->> 'label', ''))) not between 1 and 120 or char_length(coalesce(v_f ->> 'help', '')) > 300 then
      raise exception using message = 'TL:INVALID_FORM', detail = 'Every field needs a label (up to 120 characters) and a short help text (up to 300).';
    end if;
    if v_builtin_types ? (v_f ->> 'id') and v_builtin_types ->> (v_f ->> 'id') <> v_f ->> 'type' then
      raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" is a built-in detail and keeps its type.', v_f ->> 'label');
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
    if v_f -> 'show_if' is not null and jsonb_typeof(v_f -> 'show_if') = 'object' then
      select f into v_target from jsonb_array_elements(p_fields) f where f ->> 'id' = v_f -> 'show_if' ->> 'field';
      if not ((v_f -> 'show_if' ->> 'field') = any (v_ids)) or (v_target ->> 'type') not in ('select', 'multi', 'yes_no')
         or coalesce(v_f -> 'show_if' ->> 'equals', '') = '' then
        raise exception using message = 'TL:INVALID_FORM', detail = format('"%s" can only depend on an earlier choice question.', v_f ->> 'label');
      end if;
    end if;
    v_ids := v_ids || (v_f ->> 'id');
  end loop;
end;
$$;

-- Once tickets were sold: no removing, no type change, nothing new required
create or replace function public.check_form_lock(p_old jsonb, p_new jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_old_f jsonb;
  v_f jsonb;
begin
  for v_old_f in select * from jsonb_array_elements(p_old) loop
    select f into v_f from jsonb_array_elements(p_new) f where f ->> 'id' = v_old_f ->> 'id';
    if v_f is null then
      raise exception using message = 'TL:FORM_LOCKED', detail = format('Tickets are sold, so "%s" cannot be removed. Hide it instead.', v_old_f ->> 'label');
    end if;
    if v_f ->> 'type' <> v_old_f ->> 'type' then
      raise exception using message = 'TL:FORM_LOCKED', detail = format('Tickets are sold, so the type of "%s" cannot change.', v_old_f ->> 'label');
    end if;
    if coalesce((v_f ->> 'required')::boolean, false) and not coalesce((v_f ->> 'hidden')::boolean, false)
       and (not coalesce((v_old_f ->> 'required')::boolean, false) or coalesce((v_old_f ->> 'hidden')::boolean, false)) then
      raise exception using message = 'TL:FORM_LOCKED', detail = format('Tickets are sold, so "%s" cannot become required now.', v_f ->> 'label');
    end if;
    v_f := null;
  end loop;
  for v_f in select * from jsonb_array_elements(p_new) loop
    if not exists (select 1 from jsonb_array_elements(p_old) o where o ->> 'id' = v_f ->> 'id')
       and coalesce((v_f ->> 'required')::boolean, false) and not coalesce((v_f ->> 'hidden')::boolean, false) then
      raise exception using message = 'TL:FORM_LOCKED', detail = format('Tickets are sold, so the new field "%s" must be optional.', v_f ->> 'label');
    end if;
  end loop;
end;
$$;

-- Organizer saves the ticket form of a session (p_session_id) or of the event
create or replace function public.set_ticket_form(p_event_id uuid, p_session_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_session public.event_sessions;
  v_level text;
  v_uni text;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Event not found.';
  end if;
  if not public.is_org_staff(v_event.org_id) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change this.';
  end if;
  perform public.check_ticket_fields(p_fields);
  select case when f is null or coalesce((f ->> 'hidden')::boolean, false) then 'off' when coalesce((f ->> 'required')::boolean, false) then 'required' else 'optional' end
    into v_level from (select (select x from jsonb_array_elements(p_fields) x where x ->> 'id' = 'name') f) t;
  select case when f is null or coalesce((f ->> 'hidden')::boolean, false) then 'off' when coalesce((f ->> 'required')::boolean, false) then 'required' else 'optional' end
    into v_uni from (select (select x from jsonb_array_elements(p_fields) x where x ->> 'id' = 'university') f) t;

  if p_session_id is not null then
    select * into v_session from public.event_sessions where id = p_session_id and event_id = p_event_id for update;
    if not found then
      raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
    end if;
    if v_session.kind = 'competition' then
      raise exception using message = 'TL:INVALID_STATE', detail = 'Competitions use their registration form.';
    end if;
    if public.session_taken(v_session.id) > 0 then
      perform public.check_form_lock(public.ticket_fields_of_session(v_session), p_fields);
    end if;
    update public.event_sessions
    set form = jsonb_build_object('member', p_fields, 'team', '[]'::jsonb), questions = '[]'::jsonb,
        attendee_names = v_level, attendee_university = v_uni
    where id = v_session.id;
  else
    if v_event.format = 'festival' then
      raise exception using message = 'TL:INVALID_STATE', detail = 'A festival asks this per session.';
    end if;
    if exists (
      select 1 from public.orders o
      where o.event_id = p_event_id and (o.status in ('approved', 'under_review') or (o.status = 'awaiting_payment' and o.hold_expires_at > now()))
        and not exists (select 1 from public.team_registrations r where r.order_id = o.id)
    ) then
      perform public.check_form_lock(public.ticket_fields_of_event(v_event), p_fields);
    end if;
    update public.events set ticket_form = p_fields, attendee_names = v_level, attendee_university = v_uni where id = p_event_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ticket holders: one entry per ticket, checked against the forms it asks
-- (the event's form unless it is a festival, plus the forms of the sessions it opens)
-- ---------------------------------------------------------------------------
create or replace function public.clean_attendees(p_event public.events, p_items jsonb, p_attendees jsonb, p_legacy_answers jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_type public.ticket_types;
  v_qty int;
  v_given jsonb;
  v_elem jsonb;
  v_out jsonb := '[]'::jsonb;
  v_builtin text[] := array['name', 'phone', 'email', 'roll_no', 'university'];
  v_on_ticket text[] := array['name', 'phone', 'university'];
  v_forms jsonb;
  v_form record;
  v_base jsonb;
  v_flat jsonb;
  v_clean jsonb;
  v_held jsonb;
  v_answers jsonb;
  i int;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_type from public.ticket_types where id = (v_item ->> 'ticket_type_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb) into v_given
    from jsonb_array_elements(case when jsonb_typeof(p_attendees) = 'array' then p_attendees else '[]'::jsonb end)
      with ordinality a(e, n)
    where e ->> 'ticket_type_id' = v_type.id::text;

    -- which forms this ticket asks: [{key, name, fields}]
    -- sessions this ticket opens (any format: a single event may have sessions too)
    select coalesce(jsonb_agg(jsonb_build_object(
               'key', s.id::text, 'name', s.name,
               'fields', case
                 when v_type.all_sessions then (
                   select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(public.ticket_fields_of_session(s)) f
                   where coalesce((f ->> 'builtin')::boolean, false))
                 else public.ticket_fields_of_session(s) end
             ) order by s.starts_at), '[]'::jsonb)
        into v_forms
      from public.event_sessions s
      where s.event_id = p_event.id and s.kind <> 'competition' and public.session_grants(v_type.id, s.id);
    -- single / competition events: the event's own form first
    if p_event.format <> 'festival' then
      v_forms := jsonb_build_array(jsonb_build_object('key', 'event', 'name', 'Ticket', 'fields', public.ticket_fields_of_event(p_event))) || v_forms;
    end if;

    for i in 1..v_qty loop
      v_elem := coalesce(v_given -> (i - 1), '{}'::jsonb);
      v_base := jsonb_strip_nulls(jsonb_build_object(
        'name', nullif(regexp_replace(btrim(coalesce(v_elem ->> 'name', '')), '\s+', ' ', 'g'), ''),
        'phone', nullif(btrim(coalesce(v_elem ->> 'phone', '')), ''),
        'email', nullif(btrim(coalesce(v_elem ->> 'email', '')), ''),
        'roll_no', nullif(btrim(coalesce(v_elem ->> 'roll_no', '')), ''),
        'university', nullif(regexp_replace(btrim(coalesce(v_elem ->> 'university', '')), '\s+', ' ', 'g'), '')
      ));
      v_held := '{}'::jsonb;
      v_answers := '{}'::jsonb;
      for v_form in select * from jsonb_to_recordset(v_forms) as x(key text, name text, fields jsonb) loop
        v_flat := coalesce(
          case when jsonb_typeof(v_elem -> 'answers' -> v_form.key) = 'object' then v_elem -> 'answers' -> v_form.key end,
          case when jsonb_typeof(coalesce(p_legacy_answers, '{}'::jsonb) -> v_form.key) = 'object' then p_legacy_answers -> v_form.key end,
          '{}'::jsonb
        ) || v_base;
        v_clean := public.validate_form_answers(v_form.fields, v_flat, v_form.name);
        v_held := v_held || jsonb_strip_nulls(jsonb_build_object('name', v_clean -> 'name', 'phone', v_clean -> 'phone', 'university', v_clean -> 'university'));
        if (v_clean - v_on_ticket) <> '{}'::jsonb then
          v_answers := v_answers || jsonb_build_object(v_form.key, v_clean - v_on_ticket);
        end if;
      end loop;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'ticket_type_id', v_type.id, 'name', v_held ->> 'name', 'university', v_held ->> 'university', 'phone', v_held ->> 'phone',
        'answers', v_answers
      )));
    end loop;
  end loop;
  return v_out;
end;
$$;

create or replace function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_reg public.team_registrations;
  v_item record;
  v_att jsonb;
  v_type uuid;
  v_count int := 0;
  i int;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Order not found.';
  end if;
  if v_order.status <> 'approved' then
    raise exception using message = 'TL:INVALID_STATE', detail = 'Tickets are only created for approved orders.';
  end if;
  if exists (select 1 from public.tickets t where t.order_id = p_order_id) then
    return 0;
  end if;

  select * into v_reg from public.team_registrations where order_id = p_order_id;
  if v_reg.id is not null then
    select oi.ticket_type_id into v_type from public.order_items oi where oi.order_id = p_order_id limit 1;
    for i in 1..jsonb_array_length(v_reg.members) loop
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, holder_university, code, team_member_index)
      values (
        p_order_id, v_order.event_id, v_type, v_order.user_id,
        left(coalesce(nullif(btrim(v_reg.members -> (i - 1) ->> 'name'), ''), v_reg.team_name), 120),
        nullif(left(btrim(coalesce(v_reg.members -> (i - 1) ->> 'university', '')), 120), ''),
        public.generate_ticket_code(), i - 1
      );
      v_count := v_count + 1;
    end loop;
    return v_count;
  end if;

  for v_item in
    select oi.ticket_type_id, oi.quantity from public.order_items oi where oi.order_id = p_order_id order by oi.ticket_type_id
  loop
    for i in 1..v_item.quantity loop
      select e into v_att
      from jsonb_array_elements(v_order.attendees) with ordinality a(e, n)
      where e ->> 'ticket_type_id' = v_item.ticket_type_id::text
      order by n offset (i - 1) limit 1;
      insert into public.tickets (order_id, event_id, ticket_type_id, owner_id, holder_name, holder_university, holder_phone, answers, code)
      values (
        p_order_id, v_order.event_id, v_item.ticket_type_id, v_order.user_id,
        left(coalesce(nullif(btrim(v_att ->> 'name'), ''), v_order.buyer_name), 120),
        nullif(left(btrim(coalesce(v_att ->> 'university', '')), 120), ''),
        nullif(left(btrim(coalesce(v_att ->> 'phone', '')), 20), ''),
        coalesce(v_att -> 'answers', '{}'::jsonb),
        public.generate_ticket_code()
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

create or replace function public.event_schedule(p_event_id uuid)
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
         case when s.kind = 'competition' then public.session_form(s)
              else jsonb_build_object('member', public.ticket_fields_of_session(s), 'team', '[]'::jsonb) end
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.ticket_builtin(text, text, text, text) from public, anon, authenticated;
revoke all on function public.ticket_fields_of_session(public.event_sessions) from public, anon, authenticated;
revoke all on function public.ticket_fields_of_event(public.events) from public, anon, authenticated;
revoke all on function public.check_ticket_fields(jsonb) from public, anon, authenticated;
revoke all on function public.check_form_lock(jsonb, jsonb) from public, anon, authenticated;
grant execute on function
  public.ticket_builtin(text, text, text, text),
  public.ticket_fields_of_session(public.event_sessions),
  public.ticket_fields_of_event(public.events),
  public.check_ticket_fields(jsonb),
  public.check_form_lock(jsonb, jsonb)
to service_role;
revoke all on function public.set_ticket_form(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_ticket_form(uuid, uuid, jsonb) to authenticated, service_role;

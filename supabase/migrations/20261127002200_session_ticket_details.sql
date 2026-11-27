-- =============================================================================
-- TickLO – festivals ask ticket-holder details per session (D-065)
--
-- In a festival every session decides whether its tickets carry the holder's
-- name / university (off / optional / required); the event-level setting of
-- D-064 stays for single events and competition events. A ticket takes the
-- strictest setting of the sessions it opens (a pass: the sessions in passes).
-- =============================================================================

alter table public.event_sessions
  add column attendee_names text not null default 'off',
  add column attendee_university text not null default 'off',
  add constraint event_sessions_attendee_names check (attendee_names in ('off', 'optional', 'required')),
  add constraint event_sessions_attendee_university check (attendee_university in ('off', 'optional', 'required'));

-- Festivals: the event-level setting is not used
update public.events set attendee_names = 'off', attendee_university = 'off' where format = 'festival';

create or replace function public.set_session_attendee_fields(p_session_id uuid, p_names text, p_university text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select e.org_id into v_org from public.event_sessions s join public.events e on e.id = s.event_id where s.id = p_session_id;
  if v_org is null then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.is_org_staff(v_org) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change this.';
  end if;
  if coalesce(p_names, '') not in ('off', 'optional', 'required') or coalesce(p_university, '') not in ('off', 'optional', 'required') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose off, optional or required.';
  end if;
  update public.event_sessions set attendee_names = p_names, attendee_university = p_university where id = p_session_id;
end;
$$;

create or replace function public.clean_attendees(p_event public.events, p_items jsonb, p_attendees jsonb, p_legacy_answers jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_type uuid;
  v_qty int;
  v_given jsonb;
  v_elem jsonb;
  v_out jsonb := '[]'::jsonb;
  v_name text;
  v_uni text;
  v_answers jsonb;
  v_src jsonb;
  v_q record;
  v_n int;
  i int;
  v_names text;
  v_unis text;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_type := (v_item ->> 'ticket_type_id')::uuid;
    v_qty := (v_item ->> 'quantity')::int;
    select coalesce(jsonb_agg(e order by n), '[]'::jsonb) into v_given
    from jsonb_array_elements(case when jsonb_typeof(p_attendees) = 'array' then p_attendees else '[]'::jsonb end)
      with ordinality a(e, n)
    where e ->> 'ticket_type_id' = v_type::text;
    -- D-065: festivals ask per session – a ticket takes the strictest setting of the sessions it opens
    if p_event.format = 'festival' then
      select coalesce((array['off', 'optional', 'required'])[1 + max(case s.attendee_names when 'required' then 2 when 'optional' then 1 else 0 end)], 'off'),
             coalesce((array['off', 'optional', 'required'])[1 + max(case s.attendee_university when 'required' then 2 when 'optional' then 1 else 0 end)], 'off')
        into v_names, v_unis
      from public.event_sessions s
      where s.event_id = p_event.id and s.kind <> 'competition' and public.session_grants(v_type, s.id);
    else
      v_names := p_event.attendee_names;
      v_unis := p_event.attendee_university;
    end if;
    for i in 1..v_qty loop
      v_elem := coalesce(v_given -> (i - 1), '{}'::jsonb);
      v_name := nullif(regexp_replace(btrim(coalesce(v_elem ->> 'name', '')), '\s+', ' ', 'g'), '');
      v_uni := nullif(regexp_replace(btrim(coalesce(v_elem ->> 'university', '')), '\s+', ' ', 'g'), '');
      if v_names = 'off' then
        v_name := null;
      elsif v_name is null and v_names = 'required' then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Enter the name of the person for every ticket.';
      elsif v_name is not null and char_length(v_name) not between 2 and 80 then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Each name on a ticket must be 2 to 80 characters.';
      end if;
      if v_unis = 'off' then
        v_uni := null;
      elsif v_uni is null and v_unis = 'required' then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Enter the university for every ticket.';
      elsif v_uni is not null and char_length(v_uni) not between 2 and 120 then
        raise exception using message = 'TL:ATTENDEE_REQUIRED', detail = 'Each university name must be 2 to 120 characters.';
      end if;

      -- FES-09: questions of sessions this ticket opens by name (not passes), asked per ticket
      v_answers := '{}'::jsonb;
      for v_q in
        select s.id, s.name, s.questions
        from public.event_sessions s
        join public.ticket_type_sessions x on x.session_id = s.id and x.ticket_type_id = v_type
        where s.event_id = p_event.id and s.kind <> 'competition' and jsonb_array_length(s.questions) > 0
        order by s.starts_at
      loop
        v_src := coalesce(v_elem -> 'answers' -> (v_q.id::text), coalesce(p_legacy_answers, '{}'::jsonb) -> (v_q.id::text));
        v_answers := v_answers || jsonb_build_object(v_q.id::text, public.validate_answers(v_q.questions, v_src, v_q.name));
      end loop;

      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'ticket_type_id', v_type, 'name', v_name, 'university', v_uni, 'answers', v_answers
      )));
    end loop;
  end loop;
  return v_out;
end;
$$;

drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[], attendee_names text, attendee_university text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end, s.member_required, s.attendee_names, s.attendee_university
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;
revoke all on function public.clean_attendees(public.events, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.clean_attendees(public.events, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.set_session_attendee_fields(uuid, text, text) from public, anon;
grant execute on function public.set_session_attendee_fields(uuid, text, text) to authenticated, service_role;

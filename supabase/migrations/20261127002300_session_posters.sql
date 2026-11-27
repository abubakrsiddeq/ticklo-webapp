-- =============================================================================
-- TickLO – every session has a poster / banner (D-066)
--
-- The organizer uploads one when adding a workshop, competition, concert or
-- talk (required by the app for new sessions, and for older ones the next time
-- they are saved). Shown on the festival schedule and the register page.
-- =============================================================================

alter table public.event_sessions
  add column poster_url text,
  add constraint event_sessions_poster_url_len check (poster_url is null or char_length(poster_url) <= 500);

create or replace function public.set_session_poster(p_session_id uuid, p_url text)
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
  if p_url is null or p_url !~ '^https://' or char_length(p_url) > 500 then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Upload a poster image.';
  end if;
  update public.event_sessions set poster_url = p_url where id = p_session_id;
end;
$$;

drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[], attendee_names text, attendee_university text, poster_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.kind, s.description, s.venue, s.starts_at, s.ends_at, s.capacity,
         public.session_remaining(s.id), s.pass_access, s.questions, s.team_min, s.team_max, s.fee_mode,
         rt.price_paisa, s.needs_approval, rt.id, coalesce(rt.sale_ends_at, case when s.kind = 'competition' then s.starts_at end),
         case when s.results_published then s.results else '[]'::jsonb end, s.member_required, s.attendee_names, s.attendee_university, s.poster_url
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;
revoke all on function public.set_session_poster(uuid, text) from public, anon;
grant execute on function public.set_session_poster(uuid, text) to authenticated, service_role;

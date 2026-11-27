-- =============================================================================
-- TickLO – sessions have their own page and can be listed on Events (D-070)
--
-- Every session (workshop, competition, concert…) gets a link of its own
-- (/e/<society>/<event>/s/<slug>, stable when renamed) and a "Show on Events
-- page" switch, on by default for competitions, workshops and concerts.
-- =============================================================================

alter table public.event_sessions
  add column slug text,
  add column listed boolean not null default false;

create or replace function public.session_slug_base(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(left(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), '-'), 60), ''), 'session');
$$;

create or replace function public.event_sessions_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := public.session_slug_base(new.name);
  v_slug := v_base;
  while exists (select 1 from public.event_sessions s where s.event_id = new.event_id and s.slug = v_slug and s.id <> new.id) loop
    n := n + 1;
    v_slug := left(v_base, 55) || '-' || n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;

create trigger event_sessions_slug before insert on public.event_sessions
  for each row execute function public.event_sessions_slug();

-- existing sessions: a link each (oldest first keeps the plain name)
do $$
declare
  r record;
  v_base text;
  v_slug text;
  n int;
begin
  for r in select id, event_id, name from public.event_sessions order by created_at, id loop
    v_base := public.session_slug_base(r.name);
    v_slug := v_base;
    n := 1;
    while exists (select 1 from public.event_sessions s where s.event_id = r.event_id and s.slug = v_slug) loop
      n := n + 1;
      v_slug := left(v_base, 55) || '-' || n;
    end loop;
    update public.event_sessions set slug = v_slug where id = r.id;
  end loop;
end;
$$;

alter table public.event_sessions
  alter column slug set not null,
  add constraint event_sessions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 64);
create unique index event_sessions_event_slug_idx on public.event_sessions (event_id, slug);
create index event_sessions_listed_idx on public.event_sessions (starts_at) where listed;

update public.event_sessions set listed = kind in ('competition', 'workshop', 'concert');

-- Organizer: show this session on the Events page or not
create or replace function public.set_session_listing(p_session_id uuid, p_listed boolean)
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
  update public.event_sessions set listed = coalesce(p_listed, false) where id = p_session_id;
end;
$$;

drop function public.event_schedule(uuid);

create function public.event_schedule(p_event_id uuid)
returns table (
  id uuid, name text, kind text, description text, venue text, starts_at timestamptz, ends_at timestamptz,
  capacity integer, remaining integer, pass_access boolean, questions jsonb, team_min integer, team_max integer,
  fee_mode text, fee_paisa integer, needs_approval boolean, registration_type_id uuid, registration_ends_at timestamptz,
  results jsonb, member_required text[], attendee_names text, attendee_university text, poster_url text, form jsonb, slug text, listed boolean
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
              else jsonb_build_object('member', public.ticket_fields_of_session(s), 'team', '[]'::jsonb) end,
         s.slug, s.listed
  from public.event_sessions s
  join public.events e on e.id = s.event_id
  left join public.ticket_types rt on rt.registration_session_id = s.id
  where s.event_id = p_event_id
    and (e.status in ('published', 'cancelled') or public.is_org_member_any(e.org_id) or public.is_admin())
  order by s.starts_at, s.sort_order;
$$;

revoke all on function public.event_schedule(uuid) from public;
grant execute on function public.event_schedule(uuid) to anon, authenticated, service_role;
revoke all on function public.set_session_listing(uuid, boolean) from public, anon;
grant execute on function public.set_session_listing(uuid, boolean) to authenticated, service_role;
revoke all on function public.session_slug_base(text) from public, anon, authenticated;
grant execute on function public.session_slug_base(text) to service_role;

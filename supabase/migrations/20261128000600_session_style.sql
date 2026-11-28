-- D-081: what kind of night / event a festival session is ("Qawwali", "DJ night", "Sports"…).
-- Used to show the right printed-ticket designs first. Optional: null = guessed from the name.
-- The keys are printed-ticket template categories (lib/print/category.ts).

alter table public.event_sessions
  add column style text
  constraint event_sessions_style_check check (
    style is null or style in (
      'qawwali', 'mushaira', 'concert', 'dj-night', 'gala', 'theatre', 'graduation',
      'sports', 'exhibition', 'trip', 'auto-show', 'festival', 'general'
    )
  );

comment on column public.event_sessions.style is
  'D-081: kind of night / event for Concert and Other sessions (template category key); null = guess from the name.';

-- Organizer: set or clear a session's style. Only Concert / night and Other sessions have one.
create or replace function public.set_session_style(p_session_id uuid, p_style text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_kind text;
  v_style text := nullif(trim(coalesce(p_style, '')), '');
begin
  select e.org_id, s.kind into v_org, v_kind
  from public.event_sessions s join public.events e on e.id = s.event_id
  where s.id = p_session_id;
  if v_org is null then
    raise exception using message = 'TL:NOT_FOUND', detail = 'Session not found.';
  end if;
  if not public.is_org_staff(v_org) then
    raise exception using message = 'TL:FORBIDDEN', detail = 'Only organizers of this society can change this.';
  end if;
  if v_kind = 'concert' and v_style is not null
     and v_style not in ('qawwali', 'mushaira', 'concert', 'dj-night', 'gala', 'theatre', 'graduation') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose what kind of night this is.';
  end if;
  if v_kind = 'other' and v_style is not null
     and v_style not in ('sports', 'exhibition', 'trip', 'auto-show', 'festival', 'theatre', 'gala', 'general') then
    raise exception using message = 'TL:INVALID_ITEMS', detail = 'Choose what kind of event this is.';
  end if;
  update public.event_sessions
  set style = case when v_kind in ('concert', 'other') then v_style end
  where id = p_session_id;
end;
$$;

revoke all on function public.set_session_style(uuid, text) from public, anon;
grant execute on function public.set_session_style(uuid, text) to authenticated, service_role;

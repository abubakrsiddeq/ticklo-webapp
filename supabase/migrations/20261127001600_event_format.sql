-- =============================================================================
-- TickLO – event format chosen when creating an event (FES-15, D-045)
--
--   single       one show / one entry (as before)
--   festival     several sessions: workshops, competitions, nights, talks
--   competition  mainly team registration (hackathon, MUN, sports tournament)
--
-- The format only guides the screens (what to ask, which steps to show). Rules
-- still come from the sessions and ticket types, so a "single" event that has
-- sessions keeps working exactly the same.
-- =============================================================================

alter table public.events
  add column format text not null default 'single',
  add constraint events_format check (format in ('single', 'festival', 'competition'));

-- Events that already have sessions
update public.events e
set format = case
  when not exists (select 1 from public.event_sessions s where s.event_id = e.id and s.kind <> 'competition') then 'competition'
  else 'festival'
end
where exists (select 1 from public.event_sessions s where s.event_id = e.id);

-- Organizers write events directly (column-limited grants, see 0200)
grant insert (format), update (format) on public.events to authenticated;

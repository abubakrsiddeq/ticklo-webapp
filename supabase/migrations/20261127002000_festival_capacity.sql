-- TickLO – festivals have no festival-wide capacity (D-062)
--
-- The event form no longer asks for capacity or max tickets per order when the
-- event is a festival: each session has its own seats. New festivals are saved
-- with capacity 100000 (the column's max) so the ticket-quantity check never
-- blocks passes or session tickets. This brings existing festivals in line.
-- Raising capacity is always allowed by events_guard.

update public.events
set capacity = 100000
where format = 'festival' and capacity < 100000;

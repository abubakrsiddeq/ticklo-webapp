# TickLO v1 – Progress

Source of truth: "TickLO Web App Requirements (v1)". Decisions: see `DECISIONS.md`.
If a session stops, resume from the first unchecked milestone below.

## Milestones

- [x] **M1 Repo setup** – Next.js 16 app in `web/`, Tailwind 4 + shadcn/ui, Supabase folder,
      `.env.example`, README, PROGRESS, DECISIONS.
- [x] **M2 Database** – migrations, RLS on every table, critical functions, storage buckets
      and policies, realtime, pg_cron, seed, DB tests (51 passing).
- [ ] **M3 Edge Functions** – `ticket-token`, `scan-verify`, `release-holds` + QR token tests.
- [ ] **M4 App foundation** – Supabase clients, proxy (session refresh), auth guards, layout,
      branding, formatting helpers, email infrastructure.
- [ ] **M5 Auth + public pages** – login/signup/reset, Google, home, events list, event page,
      society page, share previews.
- [ ] **M6 Booking + tickets** – checkout, payment proof upload, status page, My tickets,
      rotating QR.
- [ ] **M7 Organizer dashboard** – society register, events, ticket types, payment accounts,
      team, payments review, live dashboard, attendees, scanners, cancel, report.
- [ ] **M8 Web scanner** – `/scan`, camera scan, results, offline warning, manual list.
- [ ] **M9 Admin panel** – approvals, orders/disputes, fraud list, users, universities, logs.
- [ ] **M10 "Should" items + polish** – PWA, reminders, final README.

## Done (by requirement ID)

### Database (M2)
- Roles data in `profiles`, `organization_members`, `event_staff` (Users & roles section).
- Orders with 60-minute holds and no overselling (PAY-01, PAY-02, rules 1–3), free tickets
  issued at once (PAY-12), proof submission with duplicate flags (PAY-04, PAY-05, PAY-09,
  rule 6), approve/reject idempotent (PAY-06, PAY-07, PAY-08, NFR-13), hold expiry (PAY-10)
  via pg_cron + `expire_stale_orders()`.
- Atomic check-in, every attempt logged (SCN-03, SCN-06, SCN-10, rule 9), manual check-in
  (ORG-13), scanner assignment expiring 6 h after the event (ORG-10, rule 11), live stats
  (ORG-08, SCN-08).
- Society register/review (ORG-01, ADM-01), team invites (ORG-03), event submit/review/cancel
  (ORG-06, ADM-02, ORG-11, EVT-06), ticket type rules (ORG-05, ORG-07, rule 7), capacity
  (rule 2), admin suspend/universities/disputes/audit (ADM-04..08, AUTH-09), account deletion
  request (AUTH-08), rate limiting (NFR-05).
- RLS on every table, column-level grants, private buckets (NFR-04, NFR-07, NFR-15).

## Left to do
See unchecked milestones above.

## How to test
- **DB tests (no Docker needed):** a local Postgres 15+ must be running.
  `cd web && npm run test:db` – recreates the `ticklo_test` database from
  `supabase/tests/local_stub.sql` + all migrations + seed, then runs `web/tests/db`.
- Unit tests: `cd web && npm test`.

## Needs from Abubakar
(things only you can provide – the app runs with placeholders until then)
- A Supabase project (URL, anon key, service role key) – staging and production.
- `QR_SIGNING_SECRET` set as an Edge Function secret (any long random string).
- Resend API key (+ a verified sending domain) and SMTP for Supabase Auth emails.
- Google OAuth client ID/secret (Supabase → Authentication → Providers → Google).

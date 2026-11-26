# TickLO v1 – Progress

Source of truth: "TickLO Web App Requirements (v1)". Decisions: see `DECISIONS.md`.
If a session stops, resume from the first unchecked milestone below.

## Milestones

- [x] **M1 Repo setup** – Next.js 16 app in `web/`, Tailwind 4 + shadcn/ui, Supabase folder,
      `.env.example`, README, PROGRESS, DECISIONS.
- [x] **M2 Database** – migrations, RLS on every table, critical functions, storage buckets
      and policies, realtime, pg_cron, seed, DB tests (51 passing).
- [x] **M3 Edge Functions** – `ticket-token`, `scan-verify`, `release-holds` + QR token tests.
- [x] **M4 App foundation** – Supabase clients, proxy (session refresh), auth guards, layout,
      branding, formatting helpers, email infrastructure.
- [x] **M5 Auth + public pages** – login/signup/reset, Google, home, events list, event page,
      society page, share previews.
- [x] **M6 Booking + tickets** – checkout, payment proof upload, status page, My tickets,
      rotating QR.
- [x] **M7 Organizer dashboard** – society register, events, ticket types, payment accounts,
      team, payments review, live dashboard, attendees, scanners, cancel, report.
- [x] **M8 Web scanner** – `/scan`, camera scan, results, offline warning, manual list.
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

### Edge Functions (M3)
- `ticket-token` signs a fresh QR token every 30 s (TKT-02); `scan-verify` checks scanner
  permission, signature, 60 s freshness, then the atomic check-in (SCN-03, SCN-06, SCN-10);
  `release-holds` HTTP trigger (PAY-10). Signing key only in the Edge Function (NFR-06).

### App foundation (M4)
- Supabase clients (server/browser/service-role, service key server-only – NFR-04),
  `proxy.ts` session refresh, Data Access Layer with server-side role checks for every
  protected page, PKR/PKT formatting (NFR-08, NFR-09), zod schemas shared by client and
  server (NFR-05), Postgres-backed rate limiting (NFR-05), branded UI with 44 px touch
  targets (NFR-10, NFR-12), payments module (`web/lib/payments`), storage helpers with
  magic-byte checks and image optimisation (NFR-02).
- Emails (React Email + Resend, console fallback, every email logged): EML-02…EML-09;
  Supabase Auth templates for EML-01 in `supabase/templates`.

### Auth + public pages (M5)
- AUTH-01 email/password signup + confirmation link, AUTH-02 Google, AUTH-03 reset,
  AUTH-05 any email, AUTH-07 return to the page you came from (`?next=`, open-redirect safe),
  AUTH-09 suspended users signed out.
- EVT-01 home, EVT-02 university filter + search, EVT-03 event page with remaining tickets
  and "Sold out", EVT-04 clean link `/e/<society>/<event>` + share preview, EVT-05
  student-card notice, EVT-06 cancelled banner, EVT-07 society page, EVT-08 Google
  Calendar button, EVT-09 past events tab, link-only visibility.
- Booking widget (PAY-01) with inline name/phone (AUTH-06).

### Booking + tickets (M6)
- PAY-02 60-minute hold with on-screen timer, PAY-03 payment screen (amount, reference code,
  accounts, Copy buttons, remarks instruction), PAY-04 upload (screenshot ≤5 MB jpg/png/webp,
  transaction ID, sender name, account paid into, student card when required), PAY-05
  "Review mein hai" status page (auto-refresh), PAY-08 re-upload after rejection, PAY-10
  expired view, PAY-12 free tickets straight to "ready", NFR-13 retry button on failed upload.
- Disputes from the order page (ADM-04, "paise bheje magar approve nahi hua").
- TKT-01 My tickets (upcoming/past + bookings in progress), TKT-02 live QR (new signed token
  every 30 s), TKT-03 countdown ring + ticking PKT clock + pulsing border + sheen, TKT-04
  "Used at 4:12 PM" (realtime flip), TKT-05 one QR + own link per ticket, AUTH-04 profile
  (name, phone, university, photo), AUTH-08 deletion request. Other people's tickets/orders →
  "Not allowed".

### Organizer dashboard (M7)
- ORG-01 register society (+ proof upload, pending until approved, resubmit after rejection),
  society profile editing, ORG-02 payment accounts (owner) + per-event selection, ORG-03 team
  invites by email with roles, change/remove (owner), invite acceptance page, ORG-04 event
  form (poster ≤5 MB, PKT times, capacity, visibility, max per order), ORG-05 ticket types
  (price, quantity, sale window, student card), ORG-06 draft → submit, ORG-07 locked
  price/eligibility after booking (DB trigger + UI), ORG-08 live dashboard (realtime + 20 s
  polling): review count, sold by type, collected, check-ins, capacity %, ORG-09 attendee list
  with search + CSV, ORG-10 scanner assignment (expires 6 h after event), ORG-11 cancel with
  confirmation + emails, ORG-12 report (by account, by type, orders; print-to-PDF + CSV),
  ORG-13 manual check-in logged with name, ORG-14 duplicate event.
- PAY-06 verification list (zoomable screenshot + card, expected amount, ref code, TID, sender,
  upload time, approve / reject with reason), PAY-07 emails, PAY-09 red "Possible duplicate"
  banner linking the other orders, PAY-14 "Review baqi" counts + organizer email.

### Web scanner (M8)
- SCN-01 `/scan` event picker (only current scanner access), SCN-02 camera via @zxing/browser
  with clear permission help, SCN-03 server verification, SCN-04 full-screen green/red results
  ("Entry OK", "Invalid", "Not valid here", "Already used at …"), SCN-05 sound + vibration,
  SCN-06 atomic (DB), SCN-07 auto-close after 2 s, SCN-08 live count, SCN-09 big offline
  banner + manual list (cached for lookup), SCN-10 every scan logged with device label.

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

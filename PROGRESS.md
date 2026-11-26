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
- [x] **M9 Admin panel** – approvals, orders/disputes, fraud list, users, universities, logs.
- [x] **M10 "Should" items + polish** – PWA, reminders, cron endpoints, unit tests, final README.

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

### Admin panel (M9)
- ADM-01 pending societies with details + proof (signed link) → approve/reject with reason +
  email, ADM-02 pending events (preview link, ticket types) → approve/reject + email (EML-07),
  ADM-03 order search by order ID / reference / email / phone / name + full order history
  (proofs with images and hashes, tickets, scans, audit entries), ADM-04 disputes (open list,
  resolve with note, organizer contacts), ADM-05 fraud page (duplicate flags + accounts with 3+
  rejections, suspend), ADM-06 users (search, suspend/restore incl. Supabase Auth ban,
  AUTH-09), ADM-07 universities add/edit/delete, ADM-08 audit log (every admin action) +
  email log with failed emails, ADM-09 weekly overview, AUTH-08 deletion requests list.

### "Should" items + polish (M10)
- TKT-06 PWA: manifest (opens My tickets), icons, minimal service worker (offline page only,
  never caches tickets), iOS/Android "add to home screen" hint.
- EML-04 reminders via `/api/cron/reminders`; `/api/cron/expire-holds` fallback;
  `/api/cron/cleanup-proofs` for NFR-15 (off until `PROOF_RETENTION_DAYS` is decided);
  `/api/health`.
- 25 unit tests (QR, money/time, phone, slugs, safe redirects, CSV, scanner wording, schemas).

## Requirement coverage
Every **Must**, **Should** and **Could** in the requirements doc is implemented. Details and
deviations: `DECISIONS.md`.

## Left to do / known gaps
1. **First run against a real Supabase project** (could not be done here: no Docker, and
   downloading a local PostgREST binary was not permitted). All SQL is tested on real Postgres;
   the web app type-checks, lints and builds, but the pages have not yet been clicked through
   against live Auth/PostgREST/Storage/Realtime/Edge Functions. Expect small fixes on first run.
2. Visual check on real phones (Android Chrome, iPhone Safari) at 360 px, especially the
   camera scanner and the live QR page.
3. Privacy policy and terms are drafts (open question: who writes them).
4. Open questions from the doc are still open: pilot society/date, review time limit for
   organizers, screenshot retention period, domain + sender address.

## How to test

### Automated
- **DB tests (no Docker needed):** a local Postgres 15+ must be running.
  `cd web && npm run test:db` – recreates the `ticklo_test` database from
  `supabase/tests/local_stub.sql` + all migrations + seed, then runs `web/tests/db` (51 tests).
- **Unit tests:** `cd web && npm test` (25 tests).
- **All checks:** `cd web && npm run check` (typecheck + lint + unit tests + build).
- **Edge Functions type-check:** `npx deno@2.9.6 check supabase/functions/*/index.ts`.

### Manual – acceptance criteria walkthrough (staging with `seed.sql`)
Password for all seed accounts: `TickLO@12345`. Set up per README sections 2–3 first.

| # | Acceptance criterion | How to check |
|---|---|---|
| 1 | Signup with any email, login from an event page returns there | Log out → open `/e/lums-music-society/winter-gala-2026` → "Log in to book" → sign up with a Gmail address → confirm email → you land back on the event page |
| 2 | Society registers, admin approves, owner adds accounts, invites member | As student: `/org/new` → as `admin@`: `/admin/approvals` approve → as owner: Payment accounts → add; Team → invite an email |
| 3 | Event with free + paid types, admin approves, share link opens | Owner: New event → add "Free" (0) and "Paid" types → select account → Submit → admin approves → open the share link logged out |
| 4 | Paid booking → accounts + reference → upload → approve → My tickets + email; free ticket instant | `student@` books VIP → checkout shows amount/ref/accounts → upload any screenshot + TID → `organizer@` → event → Payments → Approve → student sees ticket; book "General (Free)" → tickets immediately |
| 5 | No screenshot in 60 min → expired + stock back; rejected → new screenshot | Book, wait 60 min (or in SQL: `update orders set hold_expires_at = now() where ref_code='TL-…'`) → page shows expired, availability restored; reject an order → student uploads again |
| 6 | Same screenshot/TID → "Possible duplicate"; double Approve → tickets once | Two students upload the same file/TID → red banner on the second; click Approve twice quickly → one set of tickets (also covered by DB tests) |
| 7 | Scan: first green, second "Already used" | `scanner@` → `/scan` on a phone → scan the student's live QR twice |
| 8 | Screenshot of the QR after 60 s → red "Not valid here" | Take a screenshot of the QR, wait 61 s, scan it |
| 9 | Two phones scan at once → one green | Two scanners scan the same QR together (DB test proves the atomic update) |
| 10 | Dashboard check-ins update live; attendee CSV downloads | Keep the event dashboard open while scanning; Attendees → Download CSV |
| 11 | Report shows approved orders and collected amount | Event → Report (print to PDF or CSV) |
| 12 | Other society's dashboard / someone else's ticket → "Not allowed" | As `student@` open `/org/lums-music-society` and another user's `/me/tickets/<id>` |
| 13 | All pages fine at 360 px | Chrome DevTools device mode 360×740 |

## Needs from Abubakar
(things only you can provide – the app runs with placeholders until then)
- Supabase projects (staging + production): URL, anon key, service role key → `web/.env.local`
  and Hostinger env vars; then run the migrations (README 2.1).
- `QR_SIGNING_SECRET` and `CRON_SECRET` as Edge Function secrets; same `CRON_SECRET` in the web
  app env.
- Resend API key + a verified sending domain (`EMAIL_FROM`), and Resend SMTP in Supabase Auth.
- Google OAuth client ID/secret (Supabase → Authentication → Providers → Google).
- Domain name and Hostinger Node.js app setup (root `web/`), cron jobs (README section 4).
- Decisions on the doc's open questions (retention days → `PROOF_RETENTION_DAYS`, review time
  limit, privacy/terms author, pilot society).

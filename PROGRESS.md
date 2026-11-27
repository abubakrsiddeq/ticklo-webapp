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
- [x] **M11 Printed tickets (D-039)** – templates, Canva-style editor, batches with unique QR +
      serial, print-ready PDF, void/buyer records, scanner + reports. Migration `…001000`.
- [x] **M12 Ambassadors (D-043)** – referral links + codes, promo codes and discounts, rewards
      and milestones, leaderboard, organizer tab, ambassador screen, applications, campus
      ambassadors. Migration `…001400` applied to TICkLO (2026-11-27).
- [x] **M13 Festivals (D-044)** – sessions (workshops, competitions, nights, talks), ticket access
      (pass / chosen sessions), session seats, session scanning, questions, team registration with
      shortlisting and results, session managers. Migration `…001500` applied to TICkLO (2026-11-27).

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
- D-037 admin role management: `/admin/users/<id>` – make/remove TickLO admin, set any society
  role (owner/member/scanner, owner transfer), add to / remove from a society (migration 0900).

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

## Staging Supabase project – connected (2026-11-26)
Project **TICkLO** (`jquhutbruqevnilbthkb`, ap-northeast-2):
- 8 migrations applied (19 tables, all with RLS; 60 functions; pg_cron hold expiry every
  minute; realtime on orders/tickets/checkins; 6 storage buckets + policies) and recorded in
  the CLI migration history. `seed.sql` loaded (5 test accounts, 15 universities, events).
- Edge Functions `ticket-token`, `scan-verify`, `release-holds` deployed; secrets
  `QR_SIGNING_SECRET` and `CRON_SECRET` set.
- Auth: Site URL `https://ticklo.bkrtechsolutions.com`, redirect URLs for that domain + localhost, 8-character passwords. (Was `http://localhost:3000`
  before the domain existed.) Google provider off until credentials exist.
- Hostinger: `env.txt` (env import) and `hostinger-cron.txt` (cron commands) in the repo root, both git-ignored.
- `web/.env.local` written (not in git) – `cd web && npm run dev` runs against staging.
- **Live end-to-end test passes 24/24** (`cd web && npm run smoke:remote`): real login, free
  ticket, signed QR from the Edge Function, scan OK → "Already used", forged QR rejected,
  paid order + private upload + duplicate-safe approval, signed URLs, live stats, privacy.
- **All 33 pages load per role against live data** (anon, student, organizer, scanner, admin)
  with correct "Not allowed" redirects and no server errors.
- `supabase db advisors`: only expected warnings remain (signed-in users can execute the
  RPC functions, which check permissions themselves; leaked-password protection is an
  account setting).

## Change 2026-11-26: fixed QR per ticket (D-037)
- Rotating QR removed on request (no internet at venues). Ticket page shows one fixed signed QR
  (download button, works offline); confirmation email carries each ticket's QR (inline + PNG).
- Scanner unchanged for users; each ticket still enters only once (atomic check-in).
- **Hostinger:** add env var `QR_SIGNING_SECRET` (value is in `env.txt`, same as the Supabase
  secret) and redeploy – without it the ticket page shows "QR code is not available".
- Staging now holds real data (seed accounts removed), so `npm run smoke:remote` cannot run there
  anymore; it needs a project with `seed.sql` loaded.

## Change 2026-11-26: printed (paper) tickets (D-039)
Event dashboard → **Printed tickets** tab.
- PRT-01 Template gallery by category (Qawwali ×2, DJ Night, Concert, Trip, Auto Show, Sports,
  Conference, Festival, Minimal, Poster photo) + "My templates".
- PRT-02/03/04 Choose ticket type → design → quantity (1–2000) + serial prefix →
  `create_print_batch` makes N tickets with consecutive serials, each its own signed QR; they use
  up the ticket type's quantity (no overselling with online sales).
- PRT-05 Editor: text + event fields, fonts (incl. Urdu Nastaliq), colours/gradients, shapes,
  images/poster, drag/resize/rotate, snapping, layers, lock/hide, undo/redo, shortcuts,
  auto-shrink. QR + "Ticket partner: TickLO" cannot be removed (also enforced in Postgres).
- PRT-06 PDF in the browser: A4/A3 sheets with cut marks or press pages with 3 mm bleed; vector QR.
- PRT-07 Void lost/stolen tickets by serial range (reason, audit) → scan shows "voided".
- PRT-08 Batch page: ticket list (not used / used / voided), optional buyer name + phone, edit
  design later (QRs stay the same), download log.
- PRT-09 Scanner: result shows "Printed QWL-0042"; manual list searches the serial.
- PRT-10 Dashboard "Printed" column, attendees + CSV include printed tickets, report section
  "Printed (paper) tickets".
- Verified: 11 DB tests + 16 unit tests; templates, PDFs (A4 + press) and the editor were driven
  in headless Chrome – every QR in the PDF decodes to its own T2 token, QR can't be deleted or
  dragged off the ticket, undo works.
- Migration applied to TICkLO (2026-11-26). No new env vars; the Edge Functions need no
  redeploy (scan-verify passes the new `serial` through). Hostinger needs the new web build.

## Change 2026-11-26: 96 templates, society logo, fixed TickLO logo (D-040)
- 16 template categories × 6 designs; modern layouts with the society logo; TickLO logo is a
  fixed size and can only be moved. Rendered all 96 in headless Chrome (long names too) and
  checked that the logo cannot be resized in the editor. 17 print unit tests, 11 DB tests.
- Migration `20261126001100_brand_fixed_size.sql` applied to TICkLO (2026-11-26) and checked.

## Change 2026-11-26: printed ticket sales and cash (D-041)
- SAL-01 Sellers (team member or outside name/phone) and serial ranges.
- SAL-02/03 Mark sold / free pass by range (organizer) or by scanning the QR on the Sell screen
  (`/sell`, sellers' phones), with payment method and optional buyer.
- SAL-04 Returns (ticket dead, place back on sale), undo sale.
- SAL-05/06 Money received entries per seller, difference, close/reopen account.
- SAL-07 Gate: unmarked printed ticket → counted as sold; optional "valid only after sale" →
  "Not sold"; returned ticket → "returned unsold".
- SAL-08/09 Dashboard, report, Sales & cash page, CSV; printing cost and net.
- Fixed: lists of more than 1000 tickets (2000-ticket batch PDF, batch list, attendees) were cut
  at 1000 by the Supabase API – now paged.
- Tests: 6 DB tests (incl. 50 printed / 40 sold / 38 used / 10 returned / Rs 78,000), 4 unit tests.
  Not yet clicked through in a real browser against Supabase.
- Migration `20261126001200_printed_sales.sql` applied to TICkLO (2026-11-26) and checked; the 50
  printed tickets already there are now "in stock".

## Change 2026-11-27: easy access to the Sell screen + gate sales (D-042)
- Header "Sell" + menu item, seller banner (home, My tickets), post-login landing on the Sell
  screen, camera auto-start, WhatsApp link + QR per seller, home-screen shortcut, gate-sale switch
  in the scanner. 1 DB test (gate sale), 1 unit test (WhatsApp link). Not clicked through in a
  real browser yet.
- Migration `20261126001300_gate_sales.sql` applied to TICkLO (2026-11-27) and checked.

## Change 2026-11-27: ambassadors, referral links, promo codes, rewards (D-043)
Event dashboard → **Ambassadors** tab; ambassadors use **Sell → My link & rank**.
- AMB-01 Ambassadors are the event's sellers (one person = one code for online + paper). Program
  settings per event: reward, buyer discount, credit rule, leaderboard, applications, milestones.
- AMB-02 Every seller gets a code from their first name (`ALI`, `ALI2`); organizer can change it.
- AMB-03 Share link `/e/<society>/<event>?ref=ALI`: "Ali invited you · Rs 100 off" banner, link
  opens counted (once per browser per day, IP-limited).
- AMB-04 Link remembered 7 days (cookie per event); a typed code wins; stored on the order for
  good. Closed ambassadors get nothing new.
- AMB-05 Ambassador screen `/sell/<event>/promote`: code, WhatsApp share (ready Roman Urdu
  message), copy, native share, downloadable QR, rank, tickets, link opens, live refresh with a
  cheer on new tickets. Events without paper tickets open straight on this screen.
- AMB-06 Rewards: none / Rs per ticket / % of money brought, up to 10 milestones with progress
  bar, "Reward given" entries (money or a gift note), earned / given / due.
- AMB-07 Discounts: ambassador discount + promo codes (Rs off each ticket or %, max uses, dates,
  ticket types, minimum tickets for group deals). One discount per order – the bigger one. Code
  box with live preview in the booking widget; discount shown on checkout, status, payment
  review, admin order page, report + CSV.
- AMB-08 Organizer tab: tiles, ranked ambassador cards (link, code, clicks, online + paper,
  counted, money, reward, due, milestones, WhatsApp "here is your link"), promo codes, rewards
  given, CSV export; report section "Ambassadors & promo codes".
- AMB-09 Credit when approved (paper: when sold) or – option – only when scanned at the gate.
- AMB-10 Leaderboard: top 10 as "First L." + own rank; organizer can hide it.
- AMB-11 Applications: "Become an ambassador" on the event page → organizer accepts/declines
  (sees name, phone, university, message and record at other events).
- AMB-12 No self-referral (same account or same phone), "N orders from one phone" warning,
  rate-limited code checks, used promo codes can only be turned off.
- AMB-13 `/me/ambassador`: all my events, totals, "#1" count; menu link "My ambassador page".
- AMB-14 TickLO campus ambassadors: admin → Ambassadors (add by email, code, campus, on/off,
  societies brought / approved / events live / paid tickets); code on the society register form
  or later in Society profile (owner, first 30 days).
- Tests: 12 DB tests (codes, links, own code, preview + clicks, discounts, max uses, 100 % off,
  credit approved vs gate, rewards, payouts, same-phone flag, settings, applications, own view,
  campus ambassadors) and 8 unit tests (discount maths, labels, milestones, share text).
  `npm run check` passes (typecheck, lint, 57 unit tests, production build); 86 DB tests pass.
- Migration `20261127001400_ambassadors.sql` applied to TICkLO (2026-11-27) in one transaction
  (D-034 method, recorded in the migration history) and checked: 6 new tables with RLS, new
  `create_order` (only one version), grants as intended, existing orders untouched; advisors show
  only the expected "can execute" warnings (3 new public ones are on purpose: link preview,
  click count, event ambassador info).
- **Not yet clicked through in a real browser.** Hostinger still runs the old web build – it
  keeps working; deploy the new build to switch the feature on.

## Change 2026-11-27: festivals – sessions, session tickets, competitions (D-044)
Event dashboard → **Schedule** tab; managers use **/manage**; buyers see the schedule on the event page.
- FES-01 Sessions per event (kind, time inside the event, venue, seats, description, "included in
  passes"); Schedule tab grouped by day; duplicate event copies the schedule.
- FES-02 Ticket access: pass or chosen sessions ("Opens" on Edit & tickets); after sales access
  can only grow.
- FES-03 Session seats shared by every ticket that opens the session (online + printed);
  availability shows the smaller limit; print batches respect seats.
- FES-04 Event page schedule: day tabs, kind filter, seats left / sold out, "Included in passes",
  calendar link per session; booking widget shows what each ticket opens and warns about clashes.
- FES-05 Competition entry types are hidden from the ticket list and the print wizard.
- FES-06 Session scanning: once per ticket per session, "Not for this session", main entry kept
  separate (`entry_at`); festival tickets keep their QR and list sessions with ✓ times.
- FES-07 Scanner picks main entry or a session; scanners can be limited to sessions; manual list
  and live count per session. Session scans go through a server action (no Edge Function change).
- FES-08 Session form: competition settings (team size, fee per team/member, max teams,
  registration close, shortlisting).
- FES-09 Up to 10 questions per session (short/long text, number, choice, yes/no), asked when
  booking a session ticket or registering a team; answers on the session page and CSV.
- FES-10 Team registration page (members with roll no/university/phone, questions, code); pays
  at once (60-minute hold) or applies; per-member tickets named after each member.
- FES-11 Shortlisting: accept/decline with reason (team gets an email), then "Pay now" in My
  tickets → My competitions; withdraw; places held only by paid/in-review/on-hold teams.
- FES-12 Session managers (any team member): `/manage` and `/manage/<session>` with attendees,
  answers, check-in, teams, CSV; menu "My sessions".
- FES-13 Results (1st/2nd/3rd or own labels, linked to teams) published on the event page.
- FES-14 Per-session numbers on the event overview and the report; payment review shows team
  entries.
- FES-15 (D-045) "What kind of event is this?" first on New event (single / festival /
  competition) → next step, setup checklist, format-aware labels; ticket form asks what the
  ticket opens. Migration `…001600_event_format` (**not applied to TICkLO yet**). 1 DB test.
- Not built (owner said skip): certificates.
- Tests: 11 DB tests (sessions + dates, seats across types/printed, questions, direct entry refused,
  access lock, session scanning + main entry, scanner limits + managers, free team, per-member
  team, shortlisting/pay/decline/withdraw, results, duplicate) and 5 unit tests (days in PKT,
  clashes, answers, labels, scan wording). `npm run check` passes (62 unit tests, build);
  97 DB tests pass.
- Migration `20261127001500_festival_sessions.sql` applied to TICkLO (2026-11-27) in one transaction
  (D-034 method, recorded in the migration history) and checked: 5 new tables with RLS, one
  `create_order` (8 arguments), `wrong_session` scan result, `entry_at` filled for the 25 tickets
  already checked in, the 2 existing ticket types are passes, the live event's availability
  unchanged (443 / 199), orders and tickets untouched. Advisors: only the expected "can execute"
  warnings (1 new public one on purpose: `event_schedule`).
- **Not clicked through in a real browser yet.** Hostinger still runs the old build – it keeps
  working; deploy the new build to switch festivals on.

## Left to do / known gaps
1. Click-through in a real browser (forms, uploads, camera) – the server side and pages are
   verified, the interactive UI has not been driven by a browser yet.
2. Visual check on real phones (Android Chrome, iPhone Safari) at 360 px, especially the
   camera scanner and the live QR page.
3. Privacy policy and terms are drafts (open question: who writes them).
4. Open questions from the doc are still open: pilot society/date, review time limit for
   organizers, screenshot retention period, domain + sender address.

## How to test

### Automated
- **DB tests (no Docker needed):** a local Postgres 15+ must be running.
  `cd web && npm run test:db` – recreates the `ticklo_test` database from
  `supabase/tests/local_stub.sql` + all migrations + seed, then runs `web/tests/db` (98 tests).
- **Unit tests:** `cd web && npm test` (62 tests).
- **All checks:** `cd web && npm run check` (typecheck + lint + unit tests + build).
- **Edge Functions type-check:** `npx deno@2.9.6 check supabase/functions/*/index.ts`.

### Smoke test already done (production build, placeholder Supabase URL)
`next start` + curl on 29 routes: all public pages return 200 (home, events, login, signup,
reset, privacy, terms, offline, manifest, service worker, icons, health); every protected
route (`/me/*`, `/checkout/*`, `/org/*`, `/scan`, `/admin/*`, `/invite/*`) redirects to
`/login?next=<page>`; `/api/cron/*` returns 401 without the secret; event/society pages fall
back to 404 when the database is unreachable; React Email renders inside server code.

### Manual – acceptance criteria walkthrough (staging with `seed.sql`)
> 2026-11-26: the TICkLO project was wiped on request – all seed users, societies, events and
> orders deleted; only Abubakar's admin account and the 15 universities remain. The seed
> accounts below and `npm run smoke:remote` no longer work there unless `seed.sql` is loaded again.
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
| 14 | Ambassador link + reward (D-043) | Organizer: event → Ambassadors → Add ambassador (team member) → Program: Rs 50 per ticket, Rs 100 off for buyers → Save. Copy the card's link → open it logged out as another user → banner "… invited you" → book → price is Rs 100 less per ticket → approve → card shows 1 counted, reward Rs 50; the ambassador opens Sell → My link & rank and sees rank #1 |
| 15 | Promo code | Ambassadors → New promo code `FAST20`, 20 %, min 2 tickets → book 1 ticket with the code (error) → 2 tickets (20 % off) |
| 16 | Applications | Program → tick "Take applications" → student opens the event page → Apply → organizer Accepts → student gets "My ambassador page" in the menu |
| 21 | Kind of event first (D-045) | New event → choose 🎪 Festival → you land on Schedule with the checklist; choose 🏆 Competition → the competition form opens; choose 🎟 Single → Edit & tickets as before |
| 18 | Festival sessions (D-044) | Event → Schedule → add "AI Workshop" (workshop, 2 seats, not in passes, question "Laptop?" required) and "Qawwali" (concert, in passes) → Edit & tickets → add "Workshop" ticket → Opens → only AI Workshop. Event page shows the schedule; book 1 Workshop (answer the question) and 1 pass; try 3 workshop tickets → "Only 2 seats left" |
| 19 | Session scanning | Scanner → choose AI Workshop → scan the workshop ticket (OK), again (Already checked in), scan the pass (Not for this session) → choose Main entry → the workshop ticket still gets in once |
| 20 | Competition | Schedule → add "Speed Coding" (competition, 10 teams, 2–3 members, Rs 1,500 per team, shortlisting on) → event page → Apply → organizer: /manage/<id> → Accept → team lead: My tickets → Pay now → approve payment → ticket "Team …"; publish results → event page shows 🏆 |
| 17 | Campus ambassador | Admin → Ambassadors → add a user's email + code → register a new society with that code → admin page shows 1 society |

## Needs from Abubakar
(things only you can provide – the app runs with placeholders until then)
- **Hostinger SMTP for emails (D-051):** in the Hostinger Node.js app settings add
  `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_USER=noreply@ticklo.bkrtechsolutions.com`,
  `SMTP_PASS=<mailbox password>` and set `EMAIL_FROM=TickLO <noreply@ticklo.bkrtechsolutions.com>`
  (all already in `env.txt`), then redeploy. Also enter the same mailbox in Supabase →
  Auth → SMTP (sender name `TickLO`) so signup/reset emails use it. Local `.env.local` is set
  and the SMTP login was verified on 2026-11-27.
- **Apply migration `20261127001600_event_format.sql` to TICkLO** (adds `events.format`; the live
  build ignores it) before deploying the new web build – the new build needs it.
- **Deploy the new web build on Hostinger** to switch on festivals (migration `…001500` is
  already applied to TICkLO; no new env vars – session scans use the existing
  `QR_SIGNING_SECRET` – and no Edge Function redeploy). Then try checks #18–20.
- **Deploy the new web build on Hostinger** to switch on ambassadors and promo codes
  (migration `…001400` is already applied to TICkLO; no new env vars, no Edge Function
  redeploy). Then try checks #14–17 under "How to test".
- ~~Apply migrations `…000900_admin_roles` and `…001000_printed_tickets`~~ – applied to TICkLO
  on 2026-11-26 (D-034 method, recorded in the migration history). Please try it: event →
  Printed tickets → New → pick a template → Create 4 → Download PDF (A4) → print at 100 % → scan.
- ~~Staging Supabase project~~ – done (TICkLO). A production project later (same steps).
- The database password you sent was rejected by Supabase (maybe a typo – it contains "ą").
  Not needed right now, but reset it (Dashboard → Project Settings → Database → Reset
  password) and keep it in a password manager; it was shared in chat.
- Turn on "Leaked password protection" (Authentication → Sign In / Providers → Email) if your
  plan allows it.
- Supabase's built-in email sends only ~2 emails per hour, so new signups/password resets will
  be slow until Resend SMTP is set up (then uncomment the email templates in `config.toml` and
  run `supabase config push`).
- Resend API key + a verified sending domain (`EMAIL_FROM`), and Resend SMTP in Supabase Auth.
- Google OAuth client ID/secret (Supabase → Authentication → Providers → Google).
- Domain name and Hostinger Node.js app setup (root `web/`), cron jobs (README section 4).
- Optional speed-up: the Supabase project is in Seoul. When creating the production project,
  pick **Mumbai (ap-south-1)** – every database query gets ~2x faster from Pakistan (D-038).
- Decisions on the doc's open questions (retention days → `PROOF_RETENTION_DAYS`, review time
  limit, privacy/terms author, pilot society).

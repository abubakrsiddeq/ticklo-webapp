# TickLO – Decisions log

Decisions taken while building v1 where the requirements doc was silent, ambiguous,
or technically impossible as written. Newest decisions are appended at the bottom.
IDs in brackets refer to the requirements doc (e.g. PAY-09).

---

## D-001 Repo layout
- The Next.js app lives in `web/` (as the doc's folder structure says), the Supabase
  project (migrations, seed, Edge Functions) lives in `supabase/` at the repo root so the
  future Flutter app can share it.
- Hostinger: set the Node.js app "root directory" to `web/` (build `npm run build`,
  start `npm run start`).

## D-002 Next.js version
- Next.js 16.4.6 (latest stable on 2026-11-26), React 19.3, Tailwind CSS 4, shadcn/ui
  (Radix base, "nova" preset), Lucide icons.
- Next 16 renamed `middleware.ts` to `proxy.ts`; the session refresh lives in `web/proxy.ts`.

## D-003 Cache Components switched off
- `create-next-app` enables `cacheComponents`. Almost every TickLO page reads the Supabase
  session cookie (header, tickets, dashboards), which under Cache Components must be pushed
  behind `<Suspense>` everywhere or it is a build error. We use the classic dynamic
  rendering model instead (pages that read cookies render per request). It can be enabled
  later for the public event pages if speed requires it.

## D-004 Money/ticket logic in Postgres functions (RPC), secrets in Edge Functions
- The doc says "paise aur tickets wala kaam Edge Functions ko call karke" so that the
  Flutter app can reuse it. We put the money/ticket state machine (create order with holds,
  submit proof, approve/reject, check-in, expiry) in **Postgres functions** instead:
  they run in one transaction with row locks (no overselling, no double approval, atomic
  check-in), and both Next.js and Flutter call them the same way (`supabase.rpc(...)`).
- Edge Functions are used where a secret or the user's JWT must be checked outside the DB:
  `ticket-token` (signs rotating QR tokens; the signing key exists only there – NFR-06),
  `scan-verify` (verifies the token and calls the atomic check-in), and `release-holds`
  (optional HTTP trigger for hold expiry; pg_cron also runs it every minute).
- Payment proof upload goes through a Next.js server action (`web/lib/payments/manual.ts`)
  because the server must compute the image hash itself (a browser could lie about it).
  Only the service role can call `submit_payment_proof`.

## D-005 Order reference code
- Format `TL-` + 6 digits (e.g. `TL-048213`), unique across all orders. The doc example
  `TL-4821` has only 4 digits which would collide after a few thousand orders.

## D-006 One ticket type or many per order
- An order can contain several ticket types (quantity per type); the per-order limit
  (default 5) applies to the total. Student card is required if any type in the order
  requires it.

## D-007 One open booking per event
- A user can have at most one unpaid ("awaiting payment") order per event at a time. If
  they press Book again they are taken to the existing order. This stops one account from
  holding a whole event's stock. Student cancellation is out of scope (doc), so an
  unwanted unpaid order simply expires after 60 minutes.

## D-008 Rejected orders and holds
- Rule 1 says the hold lasts until the organizer approves or rejects. After a rejection
  the tickets go back to stock. When the student uploads a new screenshot (PAY-08) the
  order goes back to "under review" only if the sale is still open AND the tickets are
  still available; otherwise they get a clear "sold out / sale closed" error.

## D-009 Free tickets that require a student card
- PAY-12 (free ticket = issued instantly) and PAY-04 (card photo when the type requires
  it) conflict for a free type with "student card required". Such orders go through the
  normal review flow with only the card photo (no screenshot/transaction ID); fully free
  orders without a card requirement are approved instantly.

## D-010 Duplicate detection uses an exact image hash
- PAY-09 "image hash" = SHA-256 of the uploaded file bytes, computed on the server.
  Perceptual hashes were rejected: bank receipt screenshots from the same app look almost
  identical, so they would flag honest students constantly. A re-compressed copy of the
  same screenshot is not caught by SHA-256, but the transaction ID check still catches it.
  Transaction IDs are normalised (upper-case, only letters and digits) before comparing.

## D-011 Ticket type edits after booking (ORG-07, rule 7)
- Once a ticket type has any non-expired order: price and "student card required" are
  locked, the type cannot be deleted, and quantity can change but never below the number
  already sold or held. (The doc only says "quantity badha sakte hain"; allowing a
  decrease down to what is sold/held is safe and fixes typos.)

## D-012 Who can scan
- `/scan` is open to users with an unexpired scanner assignment for a published event
  (event_staff, expires 6 h after the event ends – ORG-10) **and** to the society's owner
  and members for their own events (they can already do everything else for the event).

## D-013 QR token format
- `T1.<ticket uuid, base64url>.<issued-at unix seconds, base36>.<HMAC-SHA256 truncated to
  128 bits, base64url>` (~56 characters → a small, fast-to-scan QR). Only IDs and time,
  no personal data (NFR-06). The browser asks `ticket-token` for a new token every 30 s;
  `scan-verify` accepts tokens up to 60 s old by server time (rule 8), 5 s future skew.
- An expired token (e.g. a screenshot) shows red **"Not valid here"** (as the acceptance
  criteria say), with a second line "QR code expired – ask for the live ticket".

## D-014 Uploads
- All uploads (posters, logos, avatars, payment screenshots, student cards, society proof)
  go through server actions, which check type (by magic bytes) and size (5 MB), then write
  to Storage with the service role. Posters and logos are re-encoded to JPEG (max 1600 px)
  with `sharp` to keep pages light (NFR-02); `next/image` then serves WebP. JPEG (not
  WebP) is stored so WhatsApp/Instagram link previews always work (EVT-04).
- Storage policies are still written so a future Flutter app can upload directly.

## D-015 Rate limiting (NFR-05)
- Supabase Auth already rate-limits sign-in/sign-up per IP. On top of that our server
  actions use a small Postgres-backed limiter (`rate_limit_hit`) for login, signup,
  password reset, payment proof submission and invites.

## D-016 Brand green and contrast (NFR-10 vs NFR-12)
- White text on the logo green #0F9D58 is only ~3.4:1 (fails WCAG AA for normal text). Buttons
  and green text use a darker shade `#0B7D47` ("brand-strong", ~5.3:1); #0F9D58 is kept for
  large accents, icons and the logo.

## D-017 Per-ticket links (TKT-05)
- Every ticket has its own page and QR (`/me/tickets/<id>`) with a "Ticket link" share button.
  The link only opens for the logged-in owner ("login ke saath"); giving a ticket to a friend's
  account would be ticket transfer, which is out of scope for v1. Friends are shown each QR
  separately from the buyer's phone.

## D-018 Who decides payments
- Only the event's organizers (owner/member) approve or reject payments. Admins see
  everything, handle disputes, contact the organizer, suspend fraud accounts and can cancel an
  event, but do not approve payments themselves (money goes to the society, not TickLO).

## D-019 Editing published events
- Organizers can edit a published event's details (time, venue, description, poster) without
  re-approval in v1; ticket type rules (D-011) still apply. Every change is visible on the
  public page at once. Revisit if abused.

## D-020 Report as PDF (ORG-12)
- The report page is print-friendly; "Print / save as PDF" uses the browser. CSV is a real
  download. No server-side PDF library (keeps the Hostinger build light).

## D-021 Offline at the gate (SCN-09)
- Offline scanning is out of scope (Flutter app). When the scanner goes offline it shows a big
  red banner and the manual list, which is cached on the phone for name/code lookup; the actual
  check-in still needs internet so a ticket can never be used twice.

## D-022 Scheduled jobs
- Hold expiry: pg_cron inside Supabase every minute (`expire_stale_orders`). Availability
  ignores expired holds even if the cron is late.
- Reminder emails (EML-04), proof clean-up (NFR-15) and a hold-expiry fallback are HTTP
  endpoints under `/api/cron/*`, protected by `CRON_SECRET`, called by Hostinger cron jobs.

## D-023 Email budget (Resend free plan: 100/day)
- "New screenshot to review" (EML-08) goes only to the society owner, not every member.
- Each recipient gets a separate email (no shared To: lists) so addresses stay private.

## D-024 Auth email links
- Supabase Auth templates in `supabase/templates` use `token_hash` links to `/auth/confirm`,
  which work even if the email is opened on another device. The default Supabase templates also
  work (same-browser PKCE code flow).

## D-025 Account deletion (AUTH-08)
- "Request account deletion" sets a flag that admins see on the overview and users pages; the
  admin deletes the user in the Supabase dashboard after checking open orders (societies may need
  past order records).

## D-026 Proof retention (NFR-15, open question)
- `/api/cron/cleanup-proofs` deletes payment screenshots and student card photos N days after
  the event, where N = `PROOF_RETENTION_DAYS`. Until the period is decided the variable is unset
  and nothing is deleted.

## D-027 Which account the student paid into
- When several accounts are shown, the upload form asks which one the money went to. This makes
  the report "payment account ke hisaab se" (ORG-12) possible and helps organizers find the
  transfer in the right statement.

## D-028 Database types without Docker
- `supabase gen types` needs Docker, so `web/scripts/gen-db-types.mjs` generates
  `web/lib/database.types.ts` in the same format from a local Postgres with the migrations
  applied. With a hosted project the official command can replace it.

## D-029 Universities
- Universities have an email domain field (ADM-07) for future use; it is not used to verify
  students (AUTH-05).

## D-030 Cancelling an event
- Valid tickets → cancelled, unpaid orders → expired, orders under review → rejected with reason
  "Event cancelled". Everyone with an approved order or a payment under review is emailed.

## D-031 Stable links
- Society and event slugs are generated from the name at creation and do not change when the
  name is edited, so shared WhatsApp/Instagram links never break.

## D-032 Live data without Supabase locally
- The local environment has no Docker, so the full stack (Auth, PostgREST, Storage, Realtime,
  Edge Functions) could not be run here. All SQL is covered by DB tests on a real Postgres
  with a Supabase stub; the app passes type-check, lint, unit tests and production build. The
  first run against a real Supabase project is listed as a manual check in PROGRESS.md.

## D-033 Name on each ticket
- All tickets of an order carry the buyer's name (the doc has no per-ticket attendee names and
  ticket transfer is out of scope). Gate volunteers see the ticket type and code too, and the
  holder can show each ticket's QR separately (TKT-05).

## D-034 Applying migrations to the hosted project
- The database password given for the TICkLO project was rejected, so migrations and the seed
  were applied with `supabase db query --linked -f <file>` (Management API, uses the logged-in
  CLI account – no DB password). The versions were then recorded in
  `supabase_migrations.schema_migrations` exactly like `supabase db push` does, so future
  `db push` runs only new migrations.
- Migration `0800_hardening` came from `supabase db advisors`: RLS policies use
  `(select auth.uid())` (evaluated once per query), logged-out visitors can execute only the
  three helpers their policies need, and `can_scan_event` only answers about the caller.

## D-035 Auth email templates on the free tier
- Supabase free tier refuses custom auth email templates while the default email provider is
  used. The templates stay in `supabase/templates` (commented out in `config.toml`); after
  Resend SMTP is configured, uncomment them and run `supabase config push`.

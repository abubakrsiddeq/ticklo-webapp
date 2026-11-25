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

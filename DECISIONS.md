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

## D-036 Building on Hostinger (old glibc)
- Hostinger's build server has glibc < 2.29; Next 16's native SWC/Turbopack binary needs
  glibc 2.30, so `next build` failed ("Failed to load next.config.ts").
- Production builds now use `next build --webpack` with Next's WebAssembly compiler
  (`@next/swc-wasm-nodejs`, installed as a dependency so nothing is downloaded at build time).
  Turbopack has no WASM version, which is why Webpack is used for builds.
- `next.config.ts` → `next.config.mjs` (a TypeScript config needs the native compiler to load).
- Tailwind runs through PostCSS (`postcss.config.mjs`, `@tailwindcss/postcss`) instead of the
  Turbopack-only loader; works for Webpack builds and Turbopack `next dev`.
- `@img/sharp-wasm32` is installed so sharp (uploads + `next/image`) falls back to WebAssembly if
  its native libvips (needs glibc 2.28) cannot load. Tailwind's oxide/lightningcss binaries only
  need glibc 2.14, so they work natively.
- Verified locally with `NEXT_TEST_WASM=1 npm run build` (forces the WASM compiler), then served
  against the live Supabase project.

## D-037 Admins can change anyone's role
- Asked for by Abubakar: an admin can change any user's role. `/admin/users/<id>` (open from the
  Users list → "Roles") shows the user's TickLO admin access and every society they are in.
- **Platform admin** on/off (`admin_set_platform_admin`). An admin cannot change their own flag,
  so there is always at least one admin left.
- **Society role** owner / member / scanner for any society, including adding the user to a
  society (`admin_set_org_role`). A society keeps exactly one owner: making someone owner turns
  the old owner into a member; the owner cannot be demoted or removed directly.
- **Remove** from a society (`admin_remove_org_member`), also clears their scanner assignments
  for that society's events. Every change is in the audit log.
- Real admin accounts are created with `web/scripts/create-admin.mjs` (service role). Supabase
  Auth on the hosted project needs passwords of 8+ characters.

## D-038 Fast page changes
- Problem: the Supabase project is in Seoul (ap-northeast-2); each round trip took 300–900 ms
  from Pakistan, and every click made ~4 of them one after another (proxy `getUser`, page
  `getUser`, profile, header menu), with no `loading.tsx` – the old page sat frozen ~1.3–1.9 s.
- The project signs JWTs with ES256, so `proxy.ts` and `getSession()` (lib/auth.ts) use
  `auth.getClaims()`: the token is verified locally with the cached public key – no network
  call for a valid session. Expired tokens are still refreshed in the proxy. Suspended users are
  still blocked by `profiles.is_suspended` (checked in `requireUser` and RLS).
- Profile + header menu, society + membership, event + access check, event page + user, and
  My tickets lists now load in parallel.
- `SiteHeader` streams inside `<Suspense>` with a matching shell, and `loading.tsx` skeletons
  sit at each level (root, public, event page, me, ticket, org, society, event dashboard, admin,
  checkout, invite, scan): the new page appears on click and fills in when the data arrives.
- `experimental.staleTimes.dynamic = 30` – pages visited in the last 30 s reopen instantly;
  Server Actions already `revalidatePath` / `router.refresh`, which clears that cache.
- Measured on the production build, logged in: first paint ~20 ms (was 1.3–1.9 s), full page
  0.35–0.9 s.
- Moving the Supabase project closer (e.g. Mumbai ap-south-1) would cut every remaining query
  roughly in half; that needs a new project + data move, so it is listed for Abubakar.

## D-037 Fixed QR per ticket instead of a rotating QR (owner decision, 2026-11-26)
- Abubakar decided to drop the 30-second rotating QR because venues often have no internet.
  Each ticket now has ONE fixed, signed QR: `T2.<ticket id>.<HMAC>` (no time, no personal data).
- The QR is shown on the ticket page without any network call (plus "Download QR"), and the
  confirmation email (EML-03) carries every ticket's QR as an inline image + PNG attachment.
- Trade-off (accepted): a screenshot/forward of the QR is a valid copy. Single use still holds –
  check-in is an atomic `valid → checked_in` update, so only the first scan of any copy gets in;
  the next shows "Already used at …". Students are told not to share their QR.
- This replaces TKT-02/TKT-03 (rotation, countdown), TKT-07's "no QR image in email" and business
  rule 8; acceptance criterion "screenshot after 60 s → Not valid here" no longer applies.
- The signing key `QR_SIGNING_SECRET` is now shared by the Edge Functions and the web server
  (needed to put the QR in emails); NFR-06's "key only in the Edge Function" is relaxed. It is a
  server-only env var, never sent to the browser.
- Legacy rotating `T1` tokens are still verified (with the 60 s limit) but are no longer issued.

## D-039 Printed (paper) tickets (owner request, 2026-11-26)
Abubakar asked for on-the-spot paper tickets: the organizer picks a designed template (Qawwali,
trip, auto show, DJ night …), edits it like Canva, chooses how many, and gets a print-ready PDF
where every ticket has its own QR; at the gate they scan like online tickets and a copy shows
"Already used". He asked for all phases at once. Decisions taken:
- **Same `tickets` table** (`source = 'printed'`, `batch_id`, `serial_no`, no order/owner) so
  scanner, "Already used", live counts, attendee list, CSV and event cancellation work unchanged.
  Batches live in `print_batches` (design JSON stored, so the same PDF can be downloaded again).
- **Same QR** as online tickets (`T2.<id>.<HMAC>`): unforgeable, works offline. Error correction
  level Q for print (a smudge still scans).
- **Capacity:** printed tickets use up the ticket type's quantity (`ticket_type_taken` counts them;
  `create_print_batch` takes the same row lock as `create_order`), so online + printed never
  oversell. Voided printed tickets give their place back. Printed tickets also lock the price
  (it is on the paper) and block deleting the type.
- **Only for approved (published), not-ended events**; sale windows do not apply (gate sales
  happen after online sales close). 1–2000 tickets per batch.
- **Serial numbers** run on per event across batches (batch 2 starts after batch 1), shown as
  `PREFIX-0001` (prefix 1–6 letters/numbers, suggested from the event name). The serial is printed
  under the QR and on the stub, and the scanner's manual list can find it (damaged ticket).
- **QR + "Ticket partner: TickLO" logo are mandatory**: exactly one QR ≥ 20 mm, not rotated, fully
  on the ticket; a TickLO logo ≥ 18 mm wide, ≥ 60 % opacity. Checked in the editor, in the server
  action and again in Postgres (`print_design_problem`) because the browser can be bypassed. The
  renderer always draws QR and logo on top, so nothing can be placed over them.
- **Templates are original vector artwork in code** (11 designs, 180 × 65 mm with a tear-off stub
  for the seller: serial + buyer name/phone). The reference pictures Abubakar sent are stock
  designs (Behance/Graphic Mega) and were not copied.
- **Editor:** Konva (imperative, no react-konva) – one renderer for editor, thumbnails and PDF, so
  what you see is what prints. Self-hosted fonts (@fontsource, incl. Noto Nastaliq Urdu). Long
  event names shrink to fit (`fitHeight`). Uploaded images go to the society's `posters` folder
  (PNG transparency kept); posters are loaded through `/api/print-image` (same-origin, only our
  public buckets) because a canvas with cross-origin images cannot be exported.
- **PDF is built in the browser** (pdf-lib) – no load on Hostinger: artwork rendered once at
  400 DPI with bleed and reused; QR drawn as vector rectangles; serial as real text; texts with
  `{{serial}}`/`{{code}}` rendered at 600 DPI per ticket. Layouts: A4/A3 sheets (2 mm bleed,
  5 mm gap, cut marks, footer with serial range) or one ticket per page with 3 mm bleed (press).
  Measured: 400 tickets ≈ 11 s, 6 MB.
- **Every PDF download is counted and logged** (`record_print_download`); signed tokens are only
  sent for that download. Voided tickets are left out of the PDF.
- **Void** by serial range with a required reason (audit log); no "un-void" (reprint instead).
- **Fix the design after creating** is allowed (`update_print_batch_design`): QR codes belong to
  the tickets, so already printed tickets keep working.
- **Cash is not tracked** in "Collected"; the report shows printed / used / voided / face value.
- My templates: a society can save designs (`ticket_templates`, RLS: organizers of that society).

## D-040 More templates, society logo, fixed-size TickLO logo (owner request, 2026-11-26)
- **Categories** grew from 9 to 16: added Mushaira / Poetry, Gala / Dinner, Convocation / Farewell,
  Workshop, Competition, Exhibition / Expo, Theatre / Comedy (Conference also covers seminars).
- **6 templates per category (96 in total):** the 11 hand-made designs stay; the rest come from six
  modern layouts (Split, Boarding Pass, Glass, Diagonal, Big Type, Minimal) combined with a kit per
  category – two colour palettes, title font, an original vector icon, a background pattern and
  six different headlines (`lib/print/templates-modern.ts`). Generating them from layouts keeps
  every design consistent and easy to fix in one place.
- **Society logo:** new `{{logo}}` image placeholder = the society's logo from Settings. Every modern
  layout has a logo slot (white circle plate). If the society has no logo, the slot prints nothing
  (editor shows a "Society logo" box). Editor: "+ Society logo" button and "Use society logo" for
  any image; images can get a coloured plate behind them. Society logo uploads now keep PNG
  transparency (were turned into JPEG with a black background).
- **"Ticket partner: TickLO" has one fixed size (29 × 10.2 mm, full opacity) – it can only be
  moved.** No resize handles, no width/opacity controls; old designs are put back to this size when
  opened (`normalizeDesign`). Enforced in the browser, the server action and Postgres
  (migration `20261126001100_brand_fixed_size.sql`).
- Gallery thumbnails render only when visible and one at a time (100 designs on a phone).

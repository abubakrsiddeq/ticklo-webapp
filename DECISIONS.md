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

## D-041 Printed ticket sales and cash (owner request, 2026-11-26)
Problem: printed tickets were counted, but nothing said which were sold or where the money was.
- **Printed ≠ sold.** Each printed ticket has a sale status: in stock / sold / free pass /
  returned (plus voided). Only sold tickets count as "Tickets sold" and as revenue; free passes
  get in but bring no money. A sold ticket that is voided later (buyer lost it) still counts as
  paid.
- **Sellers** per event: a team member (sells on their own phone via `/sell/<event>`) or an
  outside person with just name + phone (organizer records their sales). Serial ranges are given
  to sellers; only unsold tickets move between sellers.
- **Three ways a sale is known:** the seller scans the QR on the Sell screen and taps the payment
  method (cash / JazzCash / EasyPaisa / bank / card / other); the organizer marks a range; or the
  gate scans a ticket nobody marked → counted as sold automatically ("found at the gate", price
  = ticket price, method unknown) and charged to that seller.
- **Returned** (unsold, given back) tickets stop working at the gate and their places go back on
  sale. **Undo sale** exists for mistakes (not for tickets already used).
- **Settlement per seller:** should hand over = sold × price; money received is a list of entries
  (several handovers, minus amount to correct a mistake); difference shown in red/green; "Close
  account" locks that seller's tickets and money until reopened. A warning shows if a ticket of a
  closed account is scanned later.
- **"Valid only after sale"** is an option per batch (default off): the gate answers "Not sold"
  for unsold tickets, so stolen stock is worthless. Off by default because sellers then need
  internet for every sale.
- **Printing cost** per batch (optional) → net amount on Sales & cash and the report.
- Dashboard: "Tickets sold" = online + paper sold; "Collected" = online approved + paper money
  received (paper sales value shown next to it). Report and a CSV show the seller-by-seller account.
- All sale and money actions are Postgres functions (organizer or that seller only, audit log).
- While building this, the 1000-row limit of the Supabase API was found to cut big batches (PDF,
  batch list, attendee list): those lists now page through all rows (`lib/queries/fetch-all.ts`).

## D-042 Sellers find the scanner in one or two taps (owner request, 2026-11-27)
Problem: the Sell screen had no link anywhere (only a small one under /scan).
- **Header "Sell"** link and **"Sell tickets"** in the account menu for anyone who can sell
  printed tickets for a live event (sellers and organizers).
- **Banner** on the home page and My tickets for sellers (not organizers): "You sell tickets for
  … – N left – Open scanner".
- **After login** (password or Google, when no other page was asked for) a seller whose event is
  today/tomorrow (starts within 36 h) lands straight on the Sell screen; several events → list.
- **Sell screen opens the camera at once**; payment buttons sit right under the camera.
- **Sales & cash:** each seller with an account has "Send link on WhatsApp" (wa.me with their
  Pakistani number turned into +92 form, ready-made Roman Urdu message); the card also shows a QR
  code of the Sell link for the desk.
- **Home screen:** manifest shortcut "Sell tickets" (long-press the app icon) and an "add to home
  screen" hint on the Sell screen.
- **Gate sale:** the scanner shows "Gate sale: Off / Cash / JazzCash / EasyPaisa" for events with
  printed tickets (remembered on that phone). An unsold paper ticket scanned in is recorded as
  sold with that method and moved to the organizer's desk (the money was taken at the gate):
  `perform_check_in` now returns `gate_sold`, `record_gate_sale` fills in the method (only the
  person who just scanned it, within 15 minutes, not for closed seller accounts). The Edge
  Function passes the new fields through – no redeploy needed. Migration `…001300_gate_sales`.

## D-043 Ambassadors, referral links, promo codes and rewards (owner request, 2026-11-27)
Owner asked for the full ambassador system ("sab kar do"): all three phases in one go.
- **One person = one seller row.** Ambassadors are the D-041 sellers (`print_sellers`), so one
  person has one code and one account for paper AND online sales. Every seller gets a code made
  from their first name (`ALI`, `ALI2`…), changeable by the organizer (3–16 letters/digits,
  unique per event, never the same as a promo code of that event).
- **Link and code.** `/e/<society>/<event>?ref=ALI` is remembered for **7 days** in a cookie per
  event; a code typed at checkout wins over the link. Unknown links are ignored silently, an
  unknown typed code is an error. The order stores `seller_id` + `referral_source` (link/code) at
  creation and it never changes. Closed (settled) ambassadors get no new bookings.
- **Credit** counts only for **approved** orders (default) – rejected/expired/cancelled orders
  drop out on their own because all numbers are computed live. Organizer option: credit only
  tickets **scanned at the gate** (fake bookings become worthless). Paper tickets count when sold
  (or sold + scanned in that mode). Free passes never count.
- **No self-referral:** no credit when the buyer is the ambassador's account or has the same phone
  (last 10 digits compared, so 0300… = +92300…). Typing your own code is an error; your own link
  is silently ignored.
- **Rewards are calculated, never paid, by TickLO** (TickLO holds no money – same as D-041):
  none / fixed rupees per ticket / whole percent of the money the ambassador brought, plus up to
  10 milestones ("10 tickets → Free ticket"). The society records payouts (amount, or 0 with a
  note like "VIP pass"); "Due" = reward − paid.
- **Discounts.** Ambassador link/code can give the buyer a discount (event setting). Promo codes:
  fixed rupees off **each ticket** (never below 0) or whole percent; optional max uses (held, in
  review and approved orders count; expired holds free the use), dates, ticket types, minimum
  tickets (group deals). **One discount per order – the bigger one**; when the ambassador
  discount is bigger the promo code is not recorded as used. 100% off → free order → tickets at
  once (PAY-12). Used codes cannot be deleted, only turned off. `order_items.unit_price_paisa`
  stays the list price; `orders.discount_paisa` holds the discount and `total_paisa` what is paid.
- **Clicks** are counted per ambassador per day (one row per day – free tier), once per browser per
  day, rate-limited per IP. They are only a hint, never money.
- **Fraud hints:** "N orders from the same phone" shown when one phone has 3+ orders for one
  ambassador.
- **Leaderboard** (default on, organizer can hide): ambassadors see the top 10 as "First L." and
  their own rank; phone numbers are never shown to other ambassadors.
- **Applications** (off by default): "Become an ambassador" on the event page → organizer approves
  → the student becomes a seller with their own account even if not in the team (they can then
  also sell paper tickets the organizer gives them). Organizers see the applicant's record at
  other events (events, tickets brought).
- **Ambassador screen** lives in the Sell area (`/sell/<event>/promote`), so the existing entry
  points (header "Sell", banner, post-login landing) work; events without paper tickets show only
  this screen. `/me/ambassador` lists all events + totals.
- **TickLO campus ambassadors** (platform level): admins give a user a code; a society owner can
  add that code once within 30 days of registering (also on the register form). Admin page shows
  societies brought, approved, events published and paid tickets sold.

## D-044 Festivals: sessions, session tickets, competitions (owner request, 2026-11-27)
Owner: an event like "Aurex" has workshops, competitions, a qawwali night… with separate
tickets. Asked for everything except certificates.
- **One event with sessions** (not separate events): one page, one checkout, one dashboard;
  ambassadors, promo codes and printed tickets work across the festival. An event without
  sessions behaves exactly as before.
- **Session** = name, kind (workshop / competition / concert / talk / other), time (inside the
  event's start–end), venue (empty = event venue), optional seats, description, questions.
  "Included in all-access passes" per session (default on; competitions never).
- **Ticket type access:** a *pass* (opens every session included in passes – existing ticket types
  are passes) or *only chosen sessions*. Once tickets are sold, access can only grow (no taking
  away what people paid for).
- **Seats:** every ticket that opens a session uses one of its seats – online holds/sales and
  printed tickets alike – so selling a 40-seat workshop through several ticket types (and passes,
  if the workshop is included in passes) never oversells. Ticket availability shows the smaller
  of the ticket type's and the sessions' remaining places.
- **Scanning:** the scanner picks *Main entry* (once per ticket, as before) or a session (once
  per ticket per session; "Not valid for this session" when the ticket does not open it). The
  first scan anywhere marks the ticket as "came" (all existing numbers keep working); main entry
  keeps its own time (`tickets.entry_at`) so a workshop scan never blocks the main gate. Session
  scans are verified by the web server with the same QR secret (`QR_SIGNING_SECRET`, already on
  Hostinger) and recorded by `session_check_in` – the `scan-verify` Edge Function did not change
  and needs no redeploy.
- **Scanners** can be limited to some sessions (then they cannot scan main entry). **Session
  managers** (any team member, also scanner-role members) run their session at `/manage/<id>`:
  attendees + answers, check-in list, team registrations, shortlisting, results, CSV.
- **Questions** (up to 10: short text, long text, number, choice, yes/no; required or not) are
  answered when booking a ticket that opens the session *by name* (passes don't ask) and when
  registering a team. Stored on the order (`orders.answers`) / registration.
- **Competitions:** max teams, team size min–max, entry fee per team (one ticket "Team X") or
  per member (one ticket per member, named after them). The entry fee is a ticket type linked to
  the competition, created and kept in step by the session form (not shown in the normal ticket
  list, cannot be printed or booked directly). Registration closes at the chosen time or when the
  competition starts. Without shortlisting the team pays at once; with shortlisting the team waits
  → organizer/manager accepts or declines (reason) → the team pays. A place is held by a paid /
  in-review / unpaid-but-on-hold order (like tickets), so unpaid teams don't block places
  forever. One active registration per person per competition; team names unique per competition.
  Team payments are separate from the person's other bookings (D-007 still applies to normal
  bookings). Results (1st/2nd/3rd… or own labels, optionally linked to a team) are shown on the
  event page once published.
- **Duplicate event** copies sessions (same offset from the start), access and competition entry
  types.
- **Not built (owner said skip):** certificates.

## D-045 Ask the kind of event first (owner request, 2026-11-27)
Owner: when adding a new event, ask whether it is a single event or several events (festival)
and guide the rest from that.
- **First question on "New event":** 🎟 Single event · 🎪 Festival – many sessions · 🏆
  Competition / registration (hackathon, MUN, tournament). Stored as `events.format` (default
  `single`; events that already had sessions became festival/competition). It can be changed later
  on Event details; switching back to single is refused while sessions exist.
- **The format only guides the screens** – rules still come from sessions and ticket types, so
  nothing breaks if a "single" event has sessions.
- **Next step after creating:** single → Edit & tickets; festival → Schedule ("add the
  sessions"); competition → Competition tab with the competition form already open.
- **Setup checklist** on Edit & tickets and Schedule until the event is live, with steps per
  format (single: details → ticket types → payment accounts → submit; festival: details →
  sessions → tickets & passes → payment accounts → submit; competition: details → competition
  setup → audience tickets (optional) → payment accounts → submit). Payment accounts count as done
  when everything is free.
- **Ticket form asks "What does this ticket open?"** (pass / only these sessions) for festival and
  competition events, so the separate "Opens" dialog was removed. Competition events don't open a
  new ticket form by default ("Audience tickets (optional)").
- The Schedule tab is shown only for festival/competition events (or events that already have
  sessions) and is called "Competition" for competition events. Labels and hints in the event
  form follow the format (e.g. "Festival starts (first day)").

## D-046 Societies page in the header (owner request, 2026-11-27)
- Header (desktop, mobile menu, loading skeleton) and footer get **Societies** next to Events →
  `/societies`: every **approved** society (TickLO-verified), A–Z, search by name, filter by
  university, tab "With upcoming events". Cards show logo, name, society/department, university,
  about (3 lines) and the number of upcoming public events, and open the existing society page
  `/s/<society>`. 24 per page with "Show more"; a "Register your society" call to action at the end.
- Pending/rejected societies never show (same rule as the society page). No migration needed.

## D-047 Event cards never crop the poster (owner request, 2026-11-27)
- Event cards (home "Upcoming events", `/events`, society page) show the **whole** poster whatever
  its shape: square frame, poster `object-contain` over a blurred, zoomed copy of itself (same
  treatment as the event page). `Poster` gained `fit="contain"`; thumbnails (My tickets) keep cover.
- Card footer now shows the price ("From Rs 1,000" / Free) next to the arrow instead of a pill
  over the poster; ended/cancelled say "Booking closed".
- A list with a **single** event shows one wide featured card (poster left, date range, venue,
  price, "Get tickets") instead of one small card and an empty row. Home always links to `/events`.

## D-048 Light hero and floating header (owner request, 2026-11-27)
- Header: logo on its own, the links in a glass pill (active link green with a green underline
  bar – replaced by D-049) and the account in a second glass pill (avatar, name, chevron; or Log in / Get started).
  A blurred band behind it fades out downwards so content scrolling under it stays readable.
  Same header on every page (public, dashboard, admin, checkout) and in the loading skeleton.
- Home hero is light instead of the navy card: soft mint blobs that run behind the header, a large
  "Campus events, tickets you can trust." heading, the search bar with an arrow button, three stats
  with icons, and a tilted ticket over layered cards with "Available" and "Entry OK" stickers
  (desktop only). The ticket's QR is a drawn pattern, not a real code.

## D-049 Active header link is a filled pill (owner request, 2026-11-27)
- The active link in the header pill is a solid brand-green pill with white text (owner's
  reference was blue; green keeps the brand). Replaces the green underline from D-048.

## D-050 Modern mobile menu (owner request, 2026-11-27)
- The phone menu (slides in from the right, where the menu button is) is a rounded glass panel
  with a soft green glow and a blurred backdrop. Signed in: a profile card at the top (avatar,
  name, email → /me/profile) and "Log out" at the bottom. Signed out: a navy card at the bottom
  with "Create free account" and "Log in".
- Each link has an icon and a chevron; the active link is a solid green pill like the desktop
  header (D-049). Rows fade in one after another (off when the user prefers reduced motion).
- `SheetContent` gained an `overlayClassName` prop for the backdrop.

## D-051 Emails go through Hostinger SMTP (owner request, 2026-11-27)
App emails are sent with nodemailer over the Hostinger mailbox
`noreply@ticklo.bkrtechsolutions.com` (smtp.hostinger.com:465, TLS/SSL). Order in
`lib/emails/send.ts`: SMTP when `SMTP_HOST` is set → Resend when `RESEND_API_KEY` is
set → console. Resend code is kept as a fallback. The same mailbox is the suggested
Supabase Auth SMTP so signup/reset emails stop hitting the built-in rate limit.
Hostinger's per-mailbox sending limit replaces the Resend 100/day note in D-023.

## D-052 Email links that never show "expired" by mistake (owner report, 2026-11-27)
Seen on TICkLO: signups were confirmed seconds after the email went out, but the PKCE
`flow_state` was never used, so people saw "link invalid or expired" even though the
account was confirmed. Two causes: (1) mail scanners open links first and burn the
one-time token; (2) the default template's `?code=` only works in the browser that signed up.
- `/auth/confirm?token_hash=` no longer uses the token on GET. It redirects to
  `/confirm-email`, and the token is used only when the person presses the button (server
  action, POST). Scanners don't submit forms.
- `/auth/confirm?code=` that fails → the email IS confirmed (Supabase verified it before
  giving the code), so show "Your email is confirmed. Please log in" (`/login?confirmed=1`).
  For password reset, `/reset-password?error=device` asks for the same browser or a new link.
- Login with an unconfirmed email shows "Send a new link" (`auth.resend`, rate-limited,
  same answer for every email).
- Needs the TickLO templates (token_hash) pasted in Supabase → Auth → Emails; until then
  the default template still works through the `?code=` path, but without the scanner fix.

## D-053 Sign in with Apple (owner request, 2026-11-27)
- Login and signup show "Continue with Google" and "Continue with Apple" (`components/oauth-buttons.tsx`,
  replaces `google-button.tsx`). Both use Supabase OAuth and the existing `/auth/callback`, so the
  first login creates the account (no separate signup), the profile trigger fills name/photo, suspended
  users are blocked and the person returns to `next`. Same verified email → Supabase links the identity
  to the existing account.
- Apple often sends no name on the web, and "Hide my email" gives a `@privaterelay.appleid.com`
  address (a separate account from an email/password one). No extra "add your name" page: checkout
  already asks for name and phone when the profile lacks them (AUTH-06).
- Supabase needs a JWT client secret made from the `.p8` key; Apple caps it at ~6 months.
  `web/scripts/apple-client-secret.mjs` makes it locally (180 days) and copies it to the clipboard.
  `*.p8` is git-ignored.
- Apple only forwards mail to relay addresses from registered senders: register
  `noreply@ticklo.bkrtechsolutions.com` under "Sign in with Apple for Email Communication" (SPF on
  `ticklo.bkrtechsolutions.com` already includes Hostinger).
- The Apple button shows even before Apple is turned on in Supabase; deploy after it is set up.

## D-053 Keeping emails out of spam (owner report, 2026-11-27)
Checked on 2026-11-27: SPF, DKIM and DMARC pass; the Hostinger relay IP and both domains are on
no blacklist; reverse DNS is fine. The main cause is domain age – bkrtechsolutions.com was
registered on 2026-11-15, and Gmail/Outlook distrust brand-new senders until people open,
reply and click "Not spam". Code side: auth templates got a proper <head>, preview text, a
copy-paste link and a "why you got this" footer; app emails can send a Reply-To
(`EMAIL_REPLY_TO`, optional). Reputation steps (Postmaster Tools, DMARC quarantine, warm-up)
are listed in PROGRESS "Needs from Abubakar". No code can promise 0 % spam.

## D-054 Signup with an already-registered email (owner report, 2026-11-27)
Supabase does not send any email when someone signs up again with a registered email; it
returns a fake user with an empty `identities` list (anti-enumeration). The app showed
"Check your email" and nothing ever arrived (seen with an account first made via Google).
Signup now detects the empty `identities` and shows "This email already has a TickLO
account" with Log in / Google / Set a password links. This tells a visitor that the email is
registered – the same thing the existing "already registered" error already did, so no new leak.

## D-055 Production Supabase in Mumbai (owner request, 2026-11-27)
- Supabase cannot change a project's region, so a new project **TickLO Production**
  (`qfawucwisnygbwcqwglq`, ap-south-1) was created; the Seoul project held only test data, so
  nothing was copied except the 15 universities (reference data from `seed.sql`).
- The free plan allows 2 active projects, so the Seoul project was paused first (owner's choice
  over pausing another project or upgrading). It can be restored within 90 days.
- Same `QR_SIGNING_SECRET` / `CRON_SECRET` as before. Auth config copied through the
  Management API; OAuth secrets are not returned by the API, so Google/Apple stay off until
  re-entered. All users must log in again (new project, new JWT keys).

## D-056 Mobile overflow sweep (owner request, 2026-11-27)
- Every public/auth page was measured in headless Chrome at 320, 360, 375 and 768 px (no
  sideways scroll). Logged-in pages could not be rendered (production has real data only, no
  seed accounts), so they were audited in code.
- Root cause found: grid items default to `min-width: auto`, so a wide table inside an
  `overflow-x-auto` box (min-w 460–760 px) stretched its `grid gap-*` parent and the whole
  organizer/admin page scrolled sideways on phones (reproduced: 360 px viewport → 736 px page).
  Fix in `globals.css`: `.grid > * { min-width: 0 }` (base layer, so `min-w-[…]` utilities still
  win) plus `overflow-wrap: break-word` on body so long emails/links/codes wrap.
- Dialogs got `max-h-[calc(100dvh-2rem)] overflow-y-auto`, so tall forms (ambassador application,
  promo code) scroll on short phones instead of being cut off at top and bottom.
- Ticket design canvas: `justify-center-safe` (zoomed or wider-than-box canvas was clipped on the
  left with no way to scroll) and padding no longer subtracted twice in the fit width.
- Smaller fixes: `min-w-0` on flex rows with emails (team invites, admin, fraud, manage teams),
  `break-all` on big ambassador codes, promote screen buttons stack icon over label to fit 320 px,
  admin ambassador stat cards tighter on phones.

## D-057 "Other" university, reviewed by admins (owner request, 2026-11-27)
- The university picker (profile and society register/edit) ends with "Other – my university is
  not listed". Choosing it asks for the university's name and city.
- The typed university is saved in `universities` with `status = 'pending'` and `requested_by`
  (no separate requests table, so profiles and societies link to it straight away and nothing
  has to be moved on approval). `request_university` reuses an existing university when the
  name or short name matches (typing "LUMS" links to LUMS) and an existing pending request with
  the same name, so the same "Other" typed by many students becomes one request. Max 3 open
  requests per person.
- Until approved it is hidden from public pages, filters and society pages (RLS). Visible only to
  the requester, admins, people whose profile picked it and members of a society linked to it
  (`can_see_pending_university`, security definer so anonymous visitors never read profiles).
  The forms show it as "– under review".
- Admin → Universities shows "New university requests" (count also on the tab): **Check &
  approve** (fix name / short name / city / email domain first), **Merge** into an existing
  university (moves profiles, societies and campus ambassadors, then removes the request) or
  **Reject** (removed; linked profiles/societies keep working without a university). Society
  approvals show "(new university – check in Universities)" next to a pending one.
- No email to the requester on approval (the name simply appears on their profile/society).


## D-058 No em dashes anywhere (owner request, 2026-11-27)
- The app's text and code use no em dashes. Empty table cells / values show "-", the campus
  picker's empty option says "None", the sales buyer picker says "Outside person (no account)".
- `tests/unit/no-em-dash.test.ts` scans app, components, lib, emails, public, scripts, tests and
  the Supabase migrations/functions and fails if one comes back. En dashes stay as they are.
- Left alone: `web/AGENTS.md` (rewritten by `next dev`) and `supabase/config.toml` (CLI
  template comments). Neither is shown to users.

## D-059 Register society form: LinkedIn instead of Facebook, stricter checks (owner request, 2026-11-27)
- Facebook link removed from the society form and the public society page; **LinkedIn link is
  required** (create and edit, so existing societies add it the next time they save). Stored in
  `social_links.linkedin` (jsonb, no migration). Old `facebook` values stay in the database but
  are not shown and are dropped when the society saves its profile.
- Links (`linkField`): `https://` is added when left out; only http(s), no `user:pass@`, host
  must have a dot; Instagram must be on instagram.com and LinkedIn on linkedin.com
  (subdomains like pk.linkedin.com allowed). The public page renders only http(s) links, also
  for older data.
- Society name must contain letters and cannot contain links, `< > { }` or control characters;
  About has no control characters. Inputs carry `maxLength` matching the schema.
- **Logo is required** when registering, and when editing a society that has no logo yet (a
  society with a logo may keep it). Checked on the server (`readUpload` with `required`).
- Logo and proof are checked in the browser (type, 5 MB, required) for quick feedback; the
  server still checks the real file bytes (`readUpload`).
- University lists show "Name (City)" only when the name does not already contain the city
  (`universityLabel`), so "Bahria University (Karachi)" is not followed by "(Karachi)" again.
- Typing in the "Other" university name box suggests matching approved universities (name,
  short name, city); a click selects it, so people do not file duplicates. Same in the profile
  form.
- `FormField` packs its rows at the top (`content-start`), which fixes side-by-side fields
  sliding down when the neighbour has a hint (City next to University name, Proof next to Logo).

## D-060 Society head details when registering (owner request, 2026-11-27)
- Registering a society asks who leads it (president / chairperson / lead / head) so TickLO can
  call or email them to verify. Two choices, one required:
  - **I am the head**: name and email are filled from the account and locked; phone is filled
    from the profile and can be changed. The database takes name and email from the account
    itself (`profiles`, falling back to `auth.users.email`), so a changed form cannot put
    someone else's details there. If the account has no name yet, the name box is open.
  - **Someone else leads it**: name, mobile and email are typed.
  All three are required (zod on both sides + checks in `create_organization`; phone stored as
  `+92…` via `normalizePhone`, email lower-cased).
- Stored in a separate private table `organization_heads` (one row per society). RLS: TickLO
  admins and the society's owners can read; nobody writes directly; it is filled only by
  `create_organization`, in the same transaction as the society.
- `create_organization` gets 4 new parameters that default to null, so the build that is live
  while the migration runs keeps working (it just stores no head). The app always sends them.
- Admin → Approvals shows the head with call and email links, and whether it was entered by the
  head from their own account or by someone else. Editing it later: D-061.

## D-061 Society owners change the society head from Settings (owner request, 2026-11-27)
- Settings has a "Who leads the society?" card, **for owners only** (members cannot read the head
  details, D-060 RLS). Same two choices and checks as registering; "I am the head" means the
  owner who is saving, and the database takes their account name and email.
- Societies registered without a head (old build) can add one here; the card says so.
- `set_organization_head` (owner check inside, upsert, audit `organization.head_change`). Members,
  other users and logged-out visitors are refused. Changing the head does not send an approved
  society back for review; admins can see the change in the audit log.
- If the saved head is "someone else" (or "self" by a different owner), the form opens on
  "Someone else" with the saved details, and switching back to it restores them.

## D-062 Festivals are not asked for capacity or max tickets per order (owner request, 2026-11-27)
- A festival's seats live on its sessions, so the event form hides **Capacity** and **Max
  tickets per order** when "Festival – many sessions" is picked. Single events and
  competitions still ask for both.
- The columns are still `not null`, so the server saves a festival with `capacity = 100000`
  (the column's max: no festival-wide limit, the ticket-quantity check never blocks passes or
  competition entry tickets) and `max_tickets_per_order = 10`
  (`FESTIVAL_CAPACITY` / `FESTIVAL_MAX_PER_ORDER` in `lib/sessions.ts`).
- Switching an existing festival back to a single event or competition shows the fields again,
  with capacity empty, so the organizer types a real number.
- "x / capacity" is hidden for festivals on the society events list, the event dashboard's
  live numbers, the ticket types editor and Admin → Approvals (shows "festival (seats per
  session)").
- Migration `20261127002000_festival_capacity.sql` raises existing festivals to 100000.

## D-063 Competitions ask "individuals or teams" with min/max members (owner request, 2026-11-27)
- The competition dialog (used for a competition event and for competitions inside a festival)
  asks **Who can take part?**: 🙋 Individuals (one person per entry) or 👥 Teams / groups.
  Teams show **Min members** and **Max members**. New competitions start on Teams (2–4).
- Rules (`parseTeamSize` in `lib/sessions.ts`, checked in `saveSession`): individuals are saved
  as 1/1; teams need whole numbers with 1 ≤ min ≤ max ≤ 20 and max at least 2 (min 1 allows solo
  entries in a team competition). The database check (`team_min between 1 and 20`, `team_max
  between team_min and 20`) stays as it was, so no migration.
- For individuals the dialog says "Max participants" and "Entry fee per person", hides the
  "per team / per member" choice (saved as per_team) and the shortlist text says participants.
  Public cards say "places left" instead of "team places left".
- The event form shows a note under a new competition: the next step asks individuals or teams,
  team size, entry fee and how many can register. The public registration form already asks
  only for the participant when the competition is individual.

## D-064 Registration fixes after reviewing all three formats (owner request, 2026-11-27)
- **Team tickets:** every member gets their own ticket with their name (and university), also
  when the fee is per team (the bill stays one team entry). Gate and session scans are once per
  ticket, so one "Team X" ticket let only one person in. `tickets.team_member_index` links a
  ticket to its member; members with an email get their own QR by email.
- **Festival sale ends:** a ticket without "sale ends" sells until its session starts (session
  tickets) or until the last pass session starts (passes); a festival ticket with no sessions
  until the festival ends (`ticket_type_default_sale_end`, mirrored by `ticketSaleEnd`). Single
  events and competitions keep "until the event starts".
- **Shortlisting:** accepting sets `pay_by = least(now + 48h, competition start)` and that team
  holds a place until then; accepting is refused once paid + paying + held teams reach the
  places. An accepted team pays until its competition starts (registration closing does not
  block it). After `pay_by` it may still pay if a place is free.
- **Individuals:** the participant's name is the entry name and the unique-name rule applies only
  to teams, so two "Ali Khan"s can enter a quiz.
- **Member details:** the organizer ticks which are required (`event_sessions.member_required`;
  mobile, email, roll / student ID, university). New competitions start with mobile +
  university (owner asked for university). Phones must be +92… after normalising, emails valid;
  the same mobile / email / roll no + university cannot be in two active teams of one
  competition, nor twice in one team.
- **Editing a team:** the lead changes members and the team name until the competition starts
  (`update_team_members`). After paying (or sending payment) the member count stays; names on
  tickets that were not scanned yet follow. A per-member unpaid booking is expired when the
  count changes (book again for the new amount).
- **Lead not playing:** "I am registering the team but not taking part" leaves member 1 empty.
- **Profile:** when the lead's account has no name / phone, the team form asks and saves them.
- **Codes for shortlisted teams:** "Pay now" in My tickets takes a promo / ambassador code and
  keeps the remembered ambassador link.
- **Ticket holder details are the organizer's choice:** `events.attendee_names` and
  `attendee_university` (off / optional / required, default off). Off keeps D-033 (buyer's name
  on every ticket). Stored per ticket (`tickets.holder_university`, `orders.attendees`).
- **Session questions per ticket:** answers are asked and stored per ticket (`tickets.answers`);
  `orders.answers` keeps the first ticket's answers for older screens.
- **Cancel a booking:** the buyer can cancel an unpaid booking without a payment sent
  (`cancel_my_order`, status expired) to book something else (D-007 still allows one at a time).
- **Event page:** sessions with their own ticket show "Get ticket" (opens the ticket list with it
  selected); competition buttons share one rule (`competitionState`): Register / Register team /
  Apply, "Full" only without shortlisting, closed from the registration end or the start.
  Competition events show a Register card in the sidebar.
- **Review:** a festival needs at least one session and a competition event a competition before
  it can be sent for review (`TL:NO_SESSIONS`), instead of "add a ticket type".
- Not built (larger features, offered separately): waitlist and winner certificates / emails.

## D-065 Festivals ask ticket-holder details per session (owner request, 2026-11-27)
- A festival does not show "Details on each ticket" on the event form; each workshop / concert /
  talk session sets **Name of the person** and **University** (off / optional / required) in its
  dialog (`event_sessions.attendee_names`, `attendee_university`, `set_session_attendee_fields`).
  Competitions keep their member details (D-064) instead.
- A ticket asks what the strictest of the sessions it opens asks: a session ticket its own
  session(s), a pass the sessions included in passes (`session_grants`). A festival ticket that
  opens no session asks nothing (buyer's name).
- Single events and competition events keep the event-level setting (D-064). Saving a festival
  stores the event-level setting as off.

## D-066 Every session has a poster / banner (owner request, 2026-11-27)
- The session dialog (workshop, competition, concert, talk) has **Poster / banner** (JPG, PNG or
  WebP, up to 5 MB, same upload as event posters). Required when adding a session, and when
  saving an older session that has none; with a poster saved, uploading again replaces it.
  Checked in the browser and in `saveSession` (uploaded before the session is saved, then
  stored with `set_session_poster`, organizers only, https URLs only).
- The database column `event_sessions.poster_url` stays nullable (sessions made before this have
  none); the organizer schedule marks them "Poster missing".
- Shown on the public festival schedule (thumbnail per session), on the competition register
  page, and in the organizer schedule list. `event_schedule` returns it.

## D-067 Dashboard shows festivals as festivals (owner request, 2026-11-27)
- The organizer dashboard lists "Events & festivals" ("New event / festival"). Each item shows
  🎪 Festival or 🏆 Competition, a festival's full date range and its number of sessions (and
  competitions in it), a competition event's number of competitions, and a warning while a
  festival has no sessions or a competition event no competition. The event pages show the
  same badge.

## D-068 Registration form builder for competitions (owner request, 2026-11-27)
- Each competition has a Google-Form-like **registration form** (`event_sessions.form`) with two
  parts: **asked for every participant** and **asked once per team** (individuals: "extra
  questions"). It replaces D-064's required-detail checkboxes and the competition questions.
- **Built-in member fields** come pre-filled: Full name (always required, cannot be hidden),
  Mobile, University (both required by default), Email, Roll / student ID (optional), and a
  hidden "Department / semester". Built-ins can be renamed, made optional or hidden; their type is
  fixed. They stay on the member object (`name`, `phone`, `email`, `roll_no`, `university`) so
  tickets, duplicate checks and emails keep working; other answers go to `member.answers` and
  team answers to `team_registrations.answers`.
- **Field types:** short text, paragraph, number, dropdown, checkboxes, yes/no, email, mobile,
  link, date, file (PDF or image, 5 MB, private `registration-files` bucket under the uploader's
  folder; organizers open it through 15-minute signed links). Settings: label, help, required /
  optional / hidden, options (1–20), min / max (numbers or characters), and a **condition**
  ("show only if an earlier choice question is …").
- **Builder:** add / reorder (up / down, works on phones) / delete fields, 4 templates (Hackathon,
  MUN, Sports, Quiz / speech), copy the form of another competition of the society (custom field
  ids are renewed), live preview, 25-field limit, warning on sensitive labels (CNIC, gender,
  address…).
- **After people registered** (`set_session_form` refuses otherwise): fields cannot be removed
  (hide them), their type cannot change, and nothing can become required; new fields must be
  optional. The builder shows this and disables those options.
- Postgres checks every answer (`validate_form_answers`, `clean_members_form`): types, options,
  ranges, required, conditions; hidden and not-shown fields are dropped. The app checks the same
  in the browser. File answers must be in the uploader's own folder.
- Competitions without a saved form use the default form built from their older settings
  (`session_form`), so the live build and older competitions keep working.
- The manager page and the teams CSV show every answer under its label (files as links on the
  page). The team lead can change the team's answers too ("Change members").
- Not in this step: the same builder for workshop / event tickets (they keep D-064 / D-065).

## D-069 The form builder for every ticket, not only competitions (owner request, 2026-11-27)
- Every session (workshop, concert, talk, qawwali night…) and every single / competition event
  has a **ticket form**: the D-068 builder in "ticket" mode – one part, "asked for every ticket
  holder". Built-in details (name, university, mobile, email, roll no) start hidden (the buyer's
  name goes on the ticket, as D-033); the organizer turns them on and adds own fields (same 11
  types, conditions, limits). Ticket templates: buyer's name only, name on every ticket,
  students (name + university + roll no), workshop. Unlike competitions the name may stay hidden.
- Replaces the D-064 / D-065 off-optional-required selects and the session questions editor.
  Older settings become the form automatically (`ticket_fields_of_session`, `..._of_event`,
  mirrored by `ticketFieldsOf`), so nothing saved before changes behaviour.
- **What a ticket asks:** single / competition events: the event's form, plus the forms of any
  sessions the ticket opens; festivals: only the forms of the sessions it opens. A session
  ticket asks its session's whole form; a **pass asks only the built-in details** of the
  sessions in passes (not every session's own questions). Built-ins are asked once per ticket,
  as strictly as the strictest form.
- Stored per ticket: `holder_name`, `holder_university`, `holder_phone`; everything else in
  `tickets.answers` under the session id or `"event"`. Files go to the private
  registration-files bucket (uploader's own folder).
- **Locked once tickets are booked** (session: seats taken; event: an active booking): fields are
  hidden instead of removed, types stay, nothing becomes required (`set_ticket_form`).
- Festivals keep no event-level form (D-065). Session manager pages and CSV exports, and the
  event attendee export, show the answers under their labels (files as links on the page).

## D-070 Festivals: sidebar in parts, session pages, sessions on the Events page (owner request, 2026-11-27)
- **Festival sidebar ("Get in"):** "From Rs …" (cheapest ticket on sale), then **🎟 Festival
  passes** (with "Includes: …"), **🎫 Tickets for one event** (sorted by the event's start) and
  **🚪 Entry tickets** (no session). Competitions of a festival are also shown in the sidebar as
  **Compete** (with the card's trophy icon) and Register buttons. Single and competition events keep their layout.
- **Phones:** a sticky bottom bar "From Rs … · Get tickets" (or Register) jumps to the sidebar.
- **Schedule cards:** the session name opens its own page; "Get ticket · Rs …" when it has its
  own ticket on sale; "✓ Included in pass" only while a pass is on sale.
- **Session pages:** `/e/<society>/<event>/s/<slug>` with the session poster, time, venue,
  "Part of 🎪 …", the way in (register / own ticket / included in a pass), description, results
  and its own share preview (Open Graph with the session poster). `event_sessions.slug` is made
  from the name when the session is created and does not change on rename (shared links keep
  working); unique per event (`-2`, `-3`).
- **Events page:** type filters (All, 🎪 Festivals, 🏆 Competitions, 🛠 Workshops, 🎤 Concerts &
  nights). Sessions an organizer lists (`event_sessions.listed`, "Show on the Events page" in the
  session dialog; on by default for competitions, workshops and concerts) appear as their own
  cards under "🎪 Inside festivals" (upcoming, public, approved societies; first page), and
  alone for Workshops / Concerts. Search matches session names. Event cards show 🎪 / 🏆.
- **Home page:** a "🎪 Inside festivals" row (up to 6 listed sessions) under Upcoming events, with
  "See all" to the Events page.
- **Organizer help (schedule):** "No way in yet" on sessions without their own ticket or a pass,
  "On Events page" and "Open page ↗" per session, and a note when passes include only one event
  (suggests naming it after that event).

## D-071 Waitlist in line order (owner request, 2026-11-27)
- When a ticket type is sold out, or a competition without shortlisting is full, logged-in
  people can **join its waitlist** ("You are #3 in line", leave any time). Joining is refused
  while places are free (`TL:NOT_FULL`) or after the sale / registration closed.
- **Line order:** when a place opens, `waitlist_process()` offers it to the next person in line
  for **2 hours** (or until the sale ends, if sooner). The offered place is **held**: ticket
  counts (`ticket_type_taken`, `session_teams_taken`) include active offers for everybody except
  the person offered, so only they can book it. If they do not book in time the offer expires
  and the next person is offered. Booking / registering closes the offer (triggers on
  `order_items` and `team_registrations`), so the booking functions did not change.
- **When it runs:** right after places open in the app (buyer cancels a booking, a team
  withdraws, an organizer declines a team or rejects a payment, ticket quantity or competition
  places are raised) and every 5 minutes by cron (`/api/cron/waitlist`, for expired 60-minute
  holds and 48-hour pay windows). Offered people get an email with a "Book now" link.
- **Where:** sold-out tickets in the booking widget, the Compete / Register card, the register
  page and "Full · Join waitlist" on the schedule; a "Waitlists" section in My tickets with
  "Book now – held for you"; organizers see "N on the waitlist" on the schedule and per ticket
  type on the event edit page (a sign to add places).
- Not for competitions with shortlisting (they keep taking applications while full).

## D-072 Early-bird prices (owner request, 2026-11-28)
- Any ticket type – including a competition's entry fee – can have an **early-bird price until a
  date** (`ticket_types.early_price_paisa`, `early_until`; both or neither, lower than the normal
  price). Set in the ticket editor ("🐦 Early-bird price", "Early bird until") and in the
  competition dialog next to the entry fee.
- **The database charges it:** `create_order` and the promo / ambassador maths use the price in
  force (`ticket_type_price_at`), so a promo code works on top of the early price. A team that
  applied (shortlisting) before the early-bird date keeps the early fee when it pays later.
- **Shown:** booking widget (early price, normal price struck through, "🐦 Early bird until …"),
  "From Rs …", "Get ticket · Rs …", and competition fees everywhere ("Rs 2,000 🐦 early bird ·
  Rs 3,000 after 1 Dec"); the team form total uses the early fee.

## D-073 Strict validation on every form (owner request, 2026-11-28)
- **Mobile numbers: Pakistani mobiles only**, stored as `+92` followed by 10 digits (`+923XXXXXXXXX`).
  Typed as `0300 1234567`, `+92 300 1234567`, `92300…` or `0092300…`. International numbers are no
  longer accepted anywhere (profile, checkout, society head, competition and ticket forms, printed
  ticket buyers and sellers). Phone inputs drop letters while typing. Numbers saved earlier stay.
- **Emails:** `name@domain.tld` (one pattern in the app and the database). **Links:** http(s) with
  a real domain, no spaces or login part; `github.com/me` becomes `https://github.com/me`.
  **Dates:** a real date between 1900 and 2100.
- **Names** (signup, profile, buyer, society head, team members, ticket holders): letters in any
  script plus spaces and `. ' -`; no numbers, symbols or links. **Team names:** letters or digits,
  no links or `< > { }`. **Roll numbers:** letters, digits and `- / . _`.
- **New passwords:** 8–72 characters with at least one letter and one number, not the email.
  Login is unchanged, so older passwords still work.
- **Competition registrations:** the browser now checks everything the database checks (same
  person twice, checkbox and yes/no choices, files), and the server actions share one member
  schema (`lib/validation/team.ts`).
- **Database:** `validate_form_answers` takes only Pakistani mobiles, the strict email and link
  patterns and real dates. New society heads must use a Pakistani mobile (`not valid` constraint,
  so older rows are kept).
- Also: payment proof transaction ID (letters, digits, `- / . #`) and sender name are checked in
  the browser too; the buyer's name and phone are checked before booking; ambassador application
  messages and session forms get server-side length and character checks.

## D-074 No full-page error screen after a form is sent (owner request, 2026-11-28)
- **What happened:** a team was registered for a web dev competition with both members' details
  the same, and the page turned into "Something went wrong" (no Ref code, so the browser threw:
  React 19 sends an error inside a transition to the error boundary). Any server action that
  throws (no internet, the server failing or timing out behind Hostinger, or a new version
  deployed while the page was open) did the same on all 40+ forms.
- **Forms:** every client form now uses `useActionTransition` (`lib/use-action-transition.ts`)
  instead of `useTransition`. If the action throws, a toast says what to do and the form keeps
  what was typed; `redirect()` and `notFound()` from actions still work (`unstable_rethrow`).
  Messages (`lib/action-errors.ts`): no internet / "TickLO was just updated, refresh the page" /
  "Something went wrong on our side, try again in a moment". Booking and registration say "Open
  My tickets to check, then try again if it is not there", since the order may already exist.
  `ActionButton` and the ticket editor's image upload use the same messages.
- **Server:** `registerTeam` catches anything unexpected and returns that message instead of
  throwing. Order emails (QR codes, SMTP) for bookings, registrations and team payments are sent
  with `after()`, after the response, so a slow mail server never holds up the page.
- **Same person twice in a team:** besides the same mobile number or email, the same roll number
  at the same university and two members with every detail the same are refused, in the browser
  (under the field), the server action and Postgres (`clean_members_form`), with which members
  repeat: "Member 2 has the same mobile number as member 1. Each member must be a different
  person." Two people may still share a name.
- The error page itself says "refresh the page or start again from the home page" (it said
  "check your internet connection", which was usually wrong) and has a Go to home button.


## D-075 App cron jobs run by Supabase, not Hostinger (owner request, 2026-11-28)
- Setting up Hostinger cron jobs was confusing, so Supabase calls the app instead: `pg_net` is
  enabled and `pg_cron` runs `public.call_app_cron(path)`, which requests
  `https://ticklo.bkrtechsolutions.com/api/cron/<job>` with the cron secret.
  - `ticklo-waitlist` every 5 minutes → `/api/cron/waitlist` (D-071)
  - `ticklo-reminders` every 15 minutes → `/api/cron/reminders` (EML-04)
  - `ticklo-expire-holds` (every minute, in the database) stays as it was.
- The secret and site URL live in Supabase **Vault** (`ticklo_cron_secret`, `ticklo_site_url`),
  not in code. The setup is in `supabase/ops/app-cron.sql` (not a migration: the local test
  database has no pg_net / Vault / pg_cron); run it once per project after storing the secrets.
- Checked on TICkLO: a test call to `/api/cron/reminders` returned 200. If `CRON_SECRET`
  changes on Hostinger, update the Vault secret too. Hostinger cron jobs are no longer needed
  (remove any reminders job there to avoid double calls – reminders are not sent twice anyway).

## D-076 Every accept / reject stays on record for admins (owner request, 2026-11-28)
- The audit log already stored approve/reject for societies, events, payments, teams,
  ambassadors, universities, disputes and users, but admins only saw raw JSON in Logs and a
  decided request vanished from Approvals. Now:
  - **Admin → Decisions** (`/admin/decisions`): every decision with who decided, when and the
    reason, filter by type (Societies, Events, Payments, Team registrations, Ambassadors,
    Universities, Disputes, Users) and result (Approved / Rejected), search by society, event,
    team, `TL-` reference or person, 50 per page. Names come from the live record, or from the
    name saved in the log when the society / event / university was deleted.
  - **Approvals** shows a "History" box on a request that was decided before (e.g. a society
    rejected for "proof unreadable" and resubmitted), open by default when there was a rejection.
- Migration `20261128000300_decision_history.sql`:
  - The audit log is **append-only**: update, delete and truncate are refused for everyone,
    including the service role. Only exception: `actor_id` becomes null when that account is
    deleted (the existing ON DELETE SET NULL), so the row itself is never lost.
  - The steps between decisions are recorded by triggers (no existing function changed):
    `org.register`, `org.resubmit` (with the reason it was rejected for), `event.submit`
    (with `resubmitted`). So a history reads registered → rejected → resubmitted → approved.
  - `admin_delete_university` now keeps the deleted university's name, city and status.
- Organizer-side history was not added; this request was about the admin record.

## D-077 Organizers see their society's decision history too (owner request, 2026-11-28)
- **Society dashboard → History** (`/org/<society>/history`) and **event → History**
  (`/org/<society>/events/<event>/history`): every approval and rejection for the society, with
  who decided, when and the reason. Covers TickLO's society review (registered, rejected,
  resubmitted, approved), event reviews (sent, approved, rejected, cancelled), payments
  (approved / rejected, with `TL-` reference and buyer), team registrations and ambassador
  applications. Filters by type and result, search, 50 per page. The rejected-society alert
  links to it.
- Shown to the society's owners and members (same people who see the dashboard), not scanners.
- The audit log stays admins-only. Organizers read it only through
  `org_decision_history(org, actions, event, q, limit, offset)` (migration
  `20261128000400_org_decision_history.sql`), which checks `is_org_staff` and returns only rows
  about that society, its events and its events' orders.
- A TickLO admin who decided is shown as **"TickLO team"**, not by name (admins' names are not
  shared with organizers). Organizers who decided are shown by name.
- Rows about an event that was later deleted drop out of the organizer view (they stay in the
  admin Decisions page). Only drafts can be deleted, so this hides nothing that was reviewed.

## D-078 Students see their own decision history (owner request, 2026-11-28)
- **My history** (`/me/history`, in the user menu and on My tickets): every decision about the
  student's own payments (approved / not approved, or cancelled by them), payment reports
  (TickLO's note), team registrations (as team lead) and ambassador applications, with who
  decided, when and the reason. 50 per page.
- **Order status page**: a "Decisions on this order" card when an order had more than one
  decision (e.g. not approved → report answered → approved).
- Who decided is shown as the **society's name** for organizer decisions and **"TickLO team"**
  for TickLO admins; organizers' personal names are not shown to students. The student's own
  cancellations show "By you".
- Read through `my_decision_history(order, limit, offset)` (migration
  `20261128000500_my_decision_history.sql`), which only returns rows about the caller's own
  orders, reports, team registrations and applications. Team members other than the lead do not
  see the team's decisions (only the lead's account is linked to the registration).
- `order.cancel_by_buyer` now also shows in the admin Decisions page under Payments as
  "Cancelled by buyer" (a step, not a decision).

## D-079 Printed festival tickets show what they get you in (owner request, 2026-11-28)
- Problem: a printed "Sufi Night Ticket" of the festival Aurex 2.0 said AUREX 2.0 in big letters
  with the festival's start (1 Dec, 12:00 AM), the festival's venue and poster, so the gate and
  the buyer could not tell it was the qawwali night ticket.
- Rule: the big name is what the ticket gets you in; the festival goes in a small line above it.
  Worked out from the ticket type's access (D-044), so organizers set nothing new:
  - **One session** (Sufi Night Ticket → Qawwali Night): headline = session name; date, time,
    venue and poster = the session's (venue / poster fall back to the festival's).
    Top line "AUREX 2.0 PRESENTS".
  - **Some chosen sessions** (combo): headline = the ticket type's name, `{{includes}}` = the
    session names, date = first to last session day, time = first session, venue = shared
    venue or the festival's. Top line "AUREX 2.0 PRESENTS".
  - **Festival pass:** headline = festival, top line "FESTIVAL PASS", date = festival range
    ("1 – 2 Dec 2026"), time = first pass session (reads better than "12:00 AM").
  - **Entry ticket** (no session): headline = festival, top line "ENTRY TICKET", festival range.
  - Single events and competition events print exactly as before.
- New placeholders `{{presents}}`, `{{festival}}`, `{{includes}}`, and fallbacks:
  `{{presents|LIVE IN CONCERT}}` prints the fallback when the value is empty (the fallback may
  contain plain placeholders such as `{{society}}`). Every built-in template's top line
  ("kicker") is wrapped this way and shrinks to one line, so festival tickets say
  "AUREX 2.0 PRESENTS" and other events keep the template's words. Royal Qawwali got a small
  festival line (empty outside festivals).
- Older batches and saved designs: re-downloading an existing festival batch now prints the
  session's details too (values are filled at download time). QR codes do not change, so
  already printed tickets keep scanning. Saved designs keep their own top line until edited.

## D-080 Printed tickets start with "Which tickets do you want to print?" (owner request, 2026-11-28)
- The "Ticket type" dropdown only showed "Sufi Night Ticket · Rs 1,000 · 498 left", so an
  organizer could not see which session it was for. Step 1 is now cards: the session's emoji
  and name (Qawwali Night), the ticket's own name under it when different, the date · time ·
  venue that will be printed, the price and "N can be printed". Sold-out tickets show "None
  left. Raise its quantity on Edit & tickets." and cannot be picked.
- Festivals group the cards like the festival page (D-070) with a one-line hint each:
  🎫 Tickets for one event, 🎟 Festival passes, 🚪 Entry tickets. Single events show a plain list.
- The wizard has four steps: 1. Ticket, 2. Design, 3. Edit, 4. How many. Earlier steps can be
  opened again from the step pills. Steps 2 to 4 show "Printing Qawwali Night · Sufi Night
  Ticket · Rs 1,000 · Wed, 2 Dec 2026 · 8:00 PM · Main Lawn" with **Change**; changing the ticket
  keeps the design (only the details change).
- The ticket is chosen once: the second "Ticket type" select on "How many" was removed (changing
  it after designing was confusing).
- With a single ticket type there is nothing to pick: the wizard starts at Design (3 steps).
- The serial prefix is suggested from the headline (Qawwali Night → QN) and follows the picked
  ticket until the organizer types their own; the quantity likewise.

## D-081 "What kind of night?" and suggested designs (owner request, 2026-11-28)
- Session kinds stay five (Workshop, Competition, Concert / night, Talk / panel, Other), but
  "Concert / night" covers qawwali, DJ nights, mushairas and galas, so printing could not know
  which designs fit. The session dialog now asks, only for those two kinds:
  - Concert / night → **What kind of night?** Qawwali / Sufi night, Mushaira / Poetry,
    Concert / live music, DJ night / party, Gala / Dinner, Theatre / Comedy, Convocation / Farewell.
  - Other → **What kind of event?** Sports / match, Exhibition / Expo, Trip / Tour, Auto show,
    Mela / Fun fair, Theatre / Comedy, Gala / Dinner, Something else.
  - "Not sure" is allowed (optional). It starts from a guess from the name while typing
    ("Qawwali Night" → Qawwali, "Futsal match" → Sports), so most organizers only check it.
- Stored in `event_sessions.style` (migration `20261128000600_session_style.sql`: nullable,
  check constraint on the printed-ticket category keys) through `set_session_style`
  (organizers only; only Concert / Other sessions keep a style, other kinds are cleared).
  `event_schedule` is unchanged; the organizer schedule reads the style separately.
- **Suggested designs:** step 2 shows only the six designs of the ticket's category ("Designs
  for Qawwali"), already filled in, plus the society's own templates, with "See all 96
  designs" / "Not quite right? See designs for other kinds of events" for the full gallery.
  Category = the session's style, else a guess from its name, else its kind (workshop →
  Workshop, competition → Competition, talk → Conference / Seminar, concert → Concert);
  festival passes and entry tickets → Festival / Mela; competition events → Competition;
  single events → a guess from the event name. When nothing fits, the full gallery opens as before.

## D-082 "What the ticket says" and a simpler "How many" (owner request, 2026-11-28)
- **Step 3 "Text & look"** starts with a card **What the ticket says**: the details this design
  prints as plain fields (Big name, Small line above the name, Date, Time, Place, and Festival
  name / Sessions included / Society when the design uses them). Each starts from the ticket
  (D-079) and can be retyped; changed fields say "Changed by you. Original: …" with
  **Use original**. Emptying a field prints the original. The ticket's name and price are shown
  as fixed ("cannot be changed here, so the paper always matches what is sold").
- Below it, "Colours, pictures and layout" is the existing editor (optional). Text layers with
  `{{ }}` show a hint pointing to the card instead of making organizers edit placeholders.
- The retyped words are stored on the batch's design as `design.texts` (keys limited to
  event_name, presents, festival, includes, date, time, venue, society; 200 characters each;
  checked by the design schema). They win over the event's values in the preview, the PDF and
  re-downloads (`withTexts`). They belong to the batch only: changing the picked ticket clears
  them, and "Save as my template" never stores them. "Edit design" on a batch shows the same card.
  Postgres needed no change (`print_design_problem` ignores extra keys).
- **Step 4 "How many"** asks one thing: the number (with 25 / 50 / 100 / 200 / 500 quick picks,
  only those that fit). A summary says "100 tickets numbered QN-0001 to QN-0100. Each Rs 1,000,
  together worth Rs 1,00,000 when sold. After this, 398 more Qawwali Night tickets can be printed
  or sold online." The serial prefix ("Letters before the number", made from the headline) and the
  batch name moved under **More options**, which opens by itself when the prefix has a problem.
  An empty batch name shows the headline in the batch list (D-083).

## D-083 Printed tickets page in plain words (owner request, 2026-11-28)
- The ticket table shows each ticket as on the picker (D-080): emoji, what it prints (Qawwali
  Night), the ticket's own name under it, and for festivals the printed date · time · venue,
  grouped 🎫 Tickets for one event / 🎟 Festival passes / 🚪 Entry tickets.
- Columns renamed: Ticket, Price, Total, Printed, **Can still print or sell** (was "Places
  left"). The footnote "Places left = quantity − sold online − on hold − printed" became a
  sentence: "the total minus tickets sold online, waiting for payment, or printed. A cancelled
  (voided) paper ticket gives its place back."
- The three how-it-works steps say Create (pick the ticket, choose a design, check the words,
  say how many) / Print / Sell & scan without jargon ("one per page for a printing press").
- An unnamed batch is called after what it prints ("Qawwali Night QN-0001 – QN-0100") instead
  of "Sufi Night Ticket batch", on the list and the batch page; a named batch shows the headline
  in its second line.
- Polish found while checking the screens: pass and entry tickets print "From 9:00 PM" (the
  first pass session, or the festival's first session for entry) instead of "12:00 AM", and
  "All day" when the festival has no sessions yet and starts at midnight. On every built-in
  template the ticket-and-price chip and the date / time lines shrink to one line (a long
  "Sufi Night Ticket · Rs 1,000" used to wrap out of its chip). "← Templates" in step 3 is
  "← Designs", as the step is called.

## D-084 Admins can do everything (owner request, 2026-11-28)
"Admin panel ma har chiz ki access honi chahiye ... society ko delete and suspend bi kr skta ho."
The plan was agreed in chat and built in one go. Migration `20261128000700_admin_full_control.sql`.
- **Admins act as owner of every society.** `org_role_of()` returns `owner` for the signed-in
  admin (only for their own session, never when asking about someone else), and `getOrgAccess`
  does the same in the app. So every organizer screen and function works for an admin: events,
  ticket types, sessions, payments review, team, payment accounts, printed tickets, reports.
  A blue banner on the dashboard says "You are working in this society as TickLO admin" and links
  back. `can_manage_session` also lets admins in. `my_sell_events` was changed so the admin's
  Sell menu does not list every event on TickLO.
  - Real impersonation ("log in as this student") was not built: it would mean signing in as
    someone else, which is risky and hard to audit. The admin user page shows the person's
    orders, tickets, societies and roles instead.
- **Suspend a society** (approved or pending): status `suspended`, reason saved, the status it had
  before is kept for the restore. Effects:
  - No new bookings, team registrations, waitlist places or printed batches (trigger
    `guard_event_sales` on insert). Organizers cannot create or change anything (trigger
    `guard_frozen_org` on organizations, events, ticket types, sessions, payment accounts,
    invites, ticket designs). They may still cancel an event and review payments already sent.
  - **Tickets already sold stay valid and scanning keeps working** (agreed in chat).
  - Its public page and events are hidden from visitors. People who booked or hold a ticket
    still see the event and society (new policy helpers `holds_ticket_for_event/org`), so My
    tickets keeps working.
  - Events waiting for approval go back to draft. A checkbox also cancels the upcoming events
    (normal cancel flow, ticket holders emailed).
  - The owner gets an email (new template `society-status`) and sees the reason on the dashboard.
  - "Lift suspension" restores the old status and emails the owner.
- **Delete a society.** Type the society's name to confirm, give a reason.
  - Never sold anything (no orders, tickets, printed batches or team registrations): deleted for
    good with its events, team and payment accounts; the proof file and logo are removed from
    storage (best effort).
  - Sold something: `deleted_at` is set instead, so orders, tickets and payment records stay
    for disputes (the database refuses to delete events with orders anyway). Upcoming events are
    cancelled and ticket holders emailed. The society disappears everywhere, and its team loses
    access (`org_role_of` returns nothing for a deleted society). "Bring back" restores it
    **at any time** (the plan said 30 days; there was no reason to remove the option later).
    Its link stays reserved.
  - The name, link and reason are saved in the audit log, so Decisions still shows the name.
- **Edit a society:** name, link, university, type (admin-only fields). Logo, about and social
  links: through the dashboard as owner.
- **Payment accounts:** turn any account off or on from the society page.
- **Events:** pause / resume ticket sales (new columns `events.sales_paused_at/_reason`; the
  event page says "Ticket sales are paused for now. Tickets already bought still work.");
  unpublish (back to draft with the reason) and delete only when nobody booked; cancel as
  before. Everything else (date, venue, tickets, capacity) through the dashboard as owner.
- **Orders and tickets:** approve or reject any payment, send the tickets email again, correct the
  buyer's name / email / phone, cancel one ticket, mark an order refunded. A refund sets the
  order to `rejected` with "Refunded: <note>" plus `refunded_at/refund_note/refunded_by`, cancels
  its unused tickets and frees its places (then the waitlist runs). Refused if a ticket was
  already used at the gate. Free orders have no refund button (cancel the ticket instead).
- **Users:** edit name, phone, university and login email (changed in Supabase Auth with
  `email_confirm`, a trigger copies it to the profile); send a password reset link; sign out of
  every device (`auth.sessions` deleted, takes effect within the hour the current token lasts);
  delete the account (type DELETE). No orders, tickets, payments, disputes or societies created:
  deleted for good. Otherwise personal details are wiped (name "Deleted user", email, phone,
  identities, password), the login is banned, they leave every team, and their orders and
  tickets stay as "Deleted user". Society owners must hand over first; admins must lose admin
  access first; nobody can delete themselves. Deletion requests (AUTH-08) are now handled here
  instead of the Supabase dashboard.
- **Site settings:** an announcement banner (navy or amber, up to 300 characters) above every
  page, table `site_settings` (one row, readable by everyone, written by `admin_save_site_settings`).
- **Emails:** failed ticket, payment and team emails get "Send again" in Logs → Emails.
- **Overview:** new tiles for societies, suspended societies, upcoming events and paused sales.
- Every new action needs a reason where something is taken away, writes the audit log and shows
  in Decisions (new labels: Suspended, Restored, Deleted, Unpublished, Sales paused / resumed,
  Refunded, Account deleted). Organizers see their society's suspension in History too.
- Public lists (events, sessions, societies, society page) skip deleted societies explicitly,
  because admins can read them.
- Applied to TickLO Production on 2026-11-28 with follow-up `20261128000800_admin_helpers_private`:
  revoking EXECUTE from `public, anon` is not enough on Supabase, because its default privileges
  grant new functions to `authenticated` directly. Internal helpers must also be revoked from
  `authenticated`.

## D-085 Mobile menu opens with everything at once (owner request, 2026-11-28)
"Mobile ma menu flyout ma items load hony ma time lgta hy."
- Two causes: (1) each row of the menu panel faded in one after another (60 ms + 35 ms per row,
  300 ms each), so the last rows and Log out finished about 0.6 s after the tap and it looked like
  loading; (2) while the signed-in part of the header was still coming from the database, the
  quick version of the header had no menu button at all on phones.
- Now the rows show together with the panel (checked in headless Chrome at 390 px: every row fully
  visible 20 to 50 ms after the tap, the panel's own 200 ms slide stays). The quick header has the
  menu button too: Events and Societies plus grey placeholder rows until the rest arrives.
  Open / closed is shared between the two versions, so a menu opened early stays open and fills in.

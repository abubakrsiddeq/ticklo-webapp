# TickLO

Ticketing and gate verification for events at Pakistani universities.
*TickLO se ticket lo, befikar raho!*

| Folder | What |
|---|---|
| `web/` | Next.js 16 web app: public event pages, booking with manual bank/wallet payments, My tickets with QR, organizer dashboard, printed tickets (designer + PDF), web scanner, admin panel |
| `supabase/` | Postgres migrations (schema, RLS, business logic), seed data, Edge Functions (QR signing + scan verification), auth email templates |
| `brand/` | Official logo, app icon, social media artwork and brand guidelines (see `brand/README.md`) |
| `PROGRESS.md` | What is built (by requirement ID), what is left, how to test |
| `DECISIONS.md` | Every decision taken where the requirements were open |

**Stack:** Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · shadcn/ui · Supabase
(Postgres, Auth, Storage, Realtime, Edge Functions) · Hostinger SMTP (nodemailer) / Resend + React Email · Hostinger Node.js
hosting. Free tiers only.

---

## How it works (short)

1. A society registers (`/org/new`) → a TickLO admin approves it (`/admin/approvals`).
2. The owner adds payment accounts and team, creates an event with ticket types and submits it
   → an admin approves → the event page `/e/<society>/<event>` is live and shareable.
3. A student books → tickets are held for 60 minutes → they transfer the money to the society's
   account with the reference code (e.g. `TL-048213`) in the remarks → upload the screenshot.
4. The organizer approves (or rejects with a reason) in the payments list; duplicates (same
   transaction ID or same screenshot) are flagged red. On approval the tickets appear in
   **My tickets** and in the confirmation email with one fixed QR per ticket (works offline – D-037).
5. At the gate a volunteer opens `/scan` on their phone and scans. Each ticket works once.
6. For cash sales on the spot, the organizer makes **printed tickets** (event → Printed tickets):
   pick a template, edit it, choose how many, download the print-ready PDF. Every paper ticket has
   its own QR + serial and is scanned the same way (D-039). Sellers get serial ranges and mark
   sales on their phone at `/sell`; Sales & cash shows each seller's account (D-041).
7. **Ambassadors** (event → Ambassadors): every seller/ambassador gets a personal link
   (`/e/<society>/<event>?ref=ALI`) and code. Bookings through them count for them (online +
   paper), with a leaderboard, rewards/milestones the society pays, buyer discounts and promo
   codes. Students can apply from the event page; ambassadors see their numbers at
   `/sell/<event>/promote`. TickLO campus ambassadors bring new societies with a code (D-043).
8. **Festivals** (event → Schedule): sessions (workshops, competitions, qawwali nights, talks)
   with their own time, venue and seats. Each ticket type is a pass or opens chosen sessions;
   the scanner checks in per session; sessions can ask questions; competitions take team
   registrations (fee per team or member, optional shortlisting, results). Session managers run
   their session at `/manage` (D-044).

All money/ticket rules live in Postgres functions (atomic, shared with the future Flutter app);
QR signing lives in an Edge Function so the key never leaves Supabase.

---

## 1. Local development

Requirements: Node.js 20.9+ (24 recommended), npm, a Supabase project (free tier) **or** the
Supabase CLI with Docker.

```bash
cd web
cp .env.example .env.local      # fill in the values (see section 3)
npm install
npm run dev                     # http://localhost:3000
```

Without Supabase settings the app shows a "needs its Supabase settings" page.

### Useful scripts (in `web/`)

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build (Webpack + WASM compiler, see D-036) / server |
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | ESLint (incl. React Compiler rules) |
| `npm test` | Unit tests (QR tokens, money/time, validation, helpers) |
| `npm run test:db` | Database tests on a local Postgres (see section 6) |
| `npm run db:types` | Regenerate `lib/database.types.ts` from the local test database |
| `npm run check` | typecheck + lint + unit tests + build |

---

## 2. Supabase setup (hosted project)

Create two projects: **staging** (branch `develop`) and **production** (branch `main`).
For each:

### 2.1 Database

```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <project-ref>
supabase db push             # applies supabase/migrations/*
```

No CLI? Paste each file of `supabase/migrations/` (in order) into the SQL editor.

**Staging only:** load test data by running `supabase/seed.sql` in the SQL editor
(all test accounts use the password `TickLO@12345`):

| Email | Role |
|---|---|
| `admin@ticklo.test` | TickLO admin |
| `organizer@ticklo.test` | Owner of "LUMS Music Society" |
| `member@ticklo.test` | Member of LUMS Music Society; owner of a pending society |
| `scanner@ticklo.test` | Scanner assigned to "Winter Gala 2026" |
| `student@ticklo.test` | Student |

The seed also creates 15 universities, an approved society with a bank + JazzCash account,
"Winter Gala 2026" (published, in 14 days; free, student-card and VIP tickets), an event waiting
for approval and a past event.

**Production:** make yourself admin after signing up:
`update public.profiles set is_admin = true where email = 'you@example.com';`

### 2.2 Edge Functions

```bash
supabase secrets set QR_SIGNING_SECRET="$(openssl rand -base64 48)"
supabase secrets set CRON_SECRET="<same value as the web app's CRON_SECRET>"
supabase functions deploy ticket-token --use-api
supabase functions deploy scan-verify --use-api
supabase functions deploy release-holds --use-api
```

See `supabase/functions/README.md` for the function API (also used by the Flutter app later).

### 2.3 Auth settings (Dashboard → Authentication)

- **URL configuration:** Site URL = your site (e.g. `https://ticklo.pk`). Redirect URLs:
  `https://ticklo.pk/**` and `http://localhost:3000/**`.
- **Email:** keep "Confirm email" ON (AUTH-01).
- **Email templates:** paste `supabase/templates/confirmation.html` into "Confirm signup" and
  `supabase/templates/recovery.html` into "Reset password" (links work on any device).
- **SMTP:** the built-in Supabase mailer only sends a few emails per hour. Use the Hostinger
  mailbox (Project Settings → Auth → SMTP): host `smtp.hostinger.com`, port 465,
  user/sender `noreply@ticklo.bkrtechsolutions.com`, password = the mailbox password,
  sender name `TickLO`.
- **Google (AUTH-02):** create an OAuth client in Google Cloud (Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`) and paste the client ID/secret in
  Providers → Google.

### 2.4 Realtime and cron

- Realtime: the migrations add `checkins`, `orders` and `tickets` to the `supabase_realtime`
  publication (live dashboard, live scanner count, ticket turns "Used").
- pg_cron: the migrations schedule `expire_stale_orders()` every minute (releases unpaid holds).
  Check in Dashboard → Integrations → Cron.

### 2.5 Backups (NFR-14)

Free plan: export weekly (`supabase db dump -f backup.sql` or Dashboard → Database → Backups).
After launch, the Pro plan gives daily backups.

---

## 3. Environment variables (web)

Set in `web/.env.local` locally and in Hostinger's Node.js app settings in production.
Never commit real values.

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | anon / publishable key |
| `NEXT_PUBLIC_SITE_URL` | browser + server | e.g. `https://ticklo.pk` (used in emails and redirects) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | service role / secret key – never exposed to the browser |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | server only | Hostinger: `smtp.hostinger.com`, `465`, the mailbox + its password. When `SMTP_HOST` is set, SMTP is used |
| `RESEND_API_KEY` | server only | used only when `SMTP_HOST` is empty; both empty → emails are printed to the server console |
| `EMAIL_FROM` | server only | `TickLO <noreply@ticklo.bkrtechsolutions.com>` (must be the SMTP mailbox) |
| `QR_SIGNING_SECRET` | server only | signs ticket QR codes – same value as the Edge Function secret |
| `CRON_SECRET` | server only | long random string for `/api/cron/*` |
| `PROOF_RETENTION_DAYS` | server only (optional) | delete payment screenshots N days after the event; unset = keep |

`NEXT_PUBLIC_*` values are baked in at build time, so they must be set **before** `npm run build`.

---

## 4. Deploy to Hostinger (Business plan, Node.js app)

1. hPanel → Websites → **Add Website → Node.js app** → connect the GitHub repo.
2. Branch: `main` (production) – a second app on `develop` for staging.
3. **Root directory:** `web` · **Build command:** `npm ci && npm run build` ·
   **Start command:** `npm run start` · Node version 20 or 22+.
4. Add the environment variables from section 3, then deploy. Every push to the branch redeploys.
5. Point your domain and enable SSL (HTTPS is required for the camera scanner and PWA).
6. **Cron jobs** (hPanel → Advanced → Cron Jobs):

```bash
# Event reminders 24 h before (EML-04) – every 15 minutes
*/15 * * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ticklo.pk/api/cron/reminders
# Fallback hold expiry (pg_cron already does this) – every 5 minutes
*/5 * * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ticklo.pk/api/cron/expire-holds
# Delete old payment screenshots (only if PROOF_RETENTION_DAYS is set) – daily
0 3 * * *     curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ticklo.pk/api/cron/cleanup-proofs
```

Health check: `GET /api/health`.

---

## 5. Project structure

```
web/
  app/
    (public)/            home, events, event page /e/[society]/[event], society page /s/[society], privacy, terms
    (auth)/              login, signup, reset-password
    auth/                callback, confirm, signout (route handlers)
    checkout/[orderId]/  payment instructions, timer, upload; /status
    me/                  tickets (+ QR, download), profile
    org/                 register society, organizer dashboard, events, payments, attendees, team, accounts, reports
    invite/[token]/      accept a team invite
    scan/                web scanner
    admin/               approvals, orders & disputes, fraud, users, universities, logs
    api/cron/*           reminders, expire-holds, cleanup-proofs
  components/            ui (shadcn) + TickLO components
  emails/                React Email templates (EML-02 … EML-09)
  lib/
    supabase/            server, browser, admin (service role) clients + proxy session refresh
    validation/          zod schemas shared by forms and server actions
    payments/            manual bank/wallet transfer provider (gateway can be added here later)
    emails/              sending (SMTP / Resend / console) + notifications
    queries/             data loaders
  proxy.ts               keeps the Supabase session fresh (Next 16 "proxy", formerly middleware)
supabase/
  migrations/            schema, RLS, functions, storage, realtime, cron, grants
  functions/             ticket-token, scan-verify, release-holds (+ _shared/qr-token.ts)
  templates/             auth emails
  seed.sql               staging test data
  tests/local_stub.sql   minimal Supabase stand-in for DB tests without Docker
```

---

## 6. Tests

- **Unit tests:** `cd web && npm test` – QR token signing/verification (expiry, tampering, wrong
  key), money/time formatting in PKR/PKT, validation schemas, CSV, scanner wording.
- **Database tests (no Docker needed):** needs a local Postgres 15+ (e.g. `brew install
  postgresql@16 && brew services start postgresql@16`).
  `cd web && npm run test:db` recreates a `ticklo_test` database from
  `supabase/tests/local_stub.sql` + all migrations + seed and checks: 60-minute holds, no
  overselling under concurrent bookings, expiry, duplicate flags, approve-twice creates tickets
  once (also concurrently), reject + re-upload, atomic check-in (4 phones at once → one green),
  scanner expiry, RLS (who can see what), ticket type locks, capacity, lifecycle, invites.
- **Edge Functions:** `npx deno@2.9.6 check supabase/functions/*/index.ts`.

## 7. Adding database changes later

Always add a new file in `supabase/migrations/`. New functions get EXECUTE for anon and
authenticated by default in Supabase – revoke it for anything that should be service-role only
(see `20261126000700_realtime_cron_grants.sql`) and enable RLS on every new table.

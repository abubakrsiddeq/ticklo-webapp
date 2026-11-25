# TickLO Edge Functions

Shared by the web app and the future Flutter app. All functions take JSON
`POST` bodies and return JSON. Signed-in calls send the user's Supabase access
token: `Authorization: Bearer <access_token>` (supabase-js / supabase-flutter
`functions.invoke()` does this automatically).

| Function | Who | Body | Returns |
|---|---|---|---|
| `ticket-token` | ticket owner | `{ ticket_id }` | `{ status: "valid", token, issued_at, refresh_in: 30, valid_for: 60 }` or `{ status: "checked_in", checked_in_at }` / `{ status: "cancelled" }` |
| `scan-verify` | scanner / organizer | `{ token, event_id, device? }` | `{ result: "ok" \| "already_used" \| "expired_code" \| "wrong_event" \| "invalid" \| "not_found" \| "cancelled" \| "not_allowed", holder_name?, ticket_type?, requires_student_card?, checked_in_at? }` |
| `release-holds` | cron | – (header `x-cron-secret`) | `{ expired }` |

QR token format and rules: `_shared/qr-token.ts` (rotates every 30 s, valid 60 s).

## Secrets

```bash
supabase secrets set QR_SIGNING_SECRET="$(openssl rand -base64 48)"
supabase secrets set CRON_SECRET="<same value as the web app's CRON_SECRET>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically.

## Deploy (no Docker needed)

```bash
supabase functions deploy ticket-token --use-api
supabase functions deploy scan-verify --use-api
supabase functions deploy release-holds --use-api
```

`verify_jwt` is off in `config.toml` because each function checks the caller
itself and returns friendly JSON errors.

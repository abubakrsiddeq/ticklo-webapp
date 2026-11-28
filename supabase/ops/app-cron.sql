-- =============================================================================
-- TickLO – app cron jobs run by Supabase (D-075), instead of Hostinger cron
--
-- Not a migration (the local test database has no pg_net / Vault / pg_cron).
-- Run once per project in the SQL editor. First store the secrets in Vault:
--   select vault.create_secret('<CRON_SECRET>', 'ticklo_cron_secret', 'TickLO CRON_SECRET for /api/cron/*');
--   select vault.create_secret('https://ticklo.bkrtechsolutions.com', 'ticklo_site_url', 'TickLO site URL');
-- =============================================================================

create extension if not exists pg_net;

-- Calls https://<site>/api/cron/<job> with the cron secret (asynchronous, pg_net)
create or replace function public.call_app_cron(p_path text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ticklo_site_url') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ticklo_cron_secret')
    ),
    timeout_milliseconds := 20000
  );
$$;
revoke all on function public.call_app_cron(text) from public, anon, authenticated;

-- D-071 waitlist: expire 2-hour offers, offer free places, email them – every 5 minutes
select cron.schedule('ticklo-waitlist', '*/5 * * * *', $$select public.call_app_cron('/api/cron/waitlist')$$);
-- EML-04 event reminders 24 h before – every 15 minutes
select cron.schedule('ticklo-reminders', '*/15 * * * *', $$select public.call_app_cron('/api/cron/reminders')$$);
-- D-088 admin digest – daily at 04:00 UTC = 9:00 PKT (sent once a day, only when something waits)
select cron.schedule('ticklo-admin-digest', '0 4 * * *', $$select public.call_app_cron('/api/cron/admin-digest')$$);

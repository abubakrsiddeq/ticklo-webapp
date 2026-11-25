/**
 * release-holds – marks unpaid orders whose 60 minute hold has ended as
 * "expired", returning tickets to stock (PAY-10).
 *
 * pg_cron already runs `select public.expire_stale_orders()` every minute (see
 * migration 0700). This HTTP trigger exists for setups without pg_cron or for
 * an external scheduler.
 *
 * POST with header  x-cron-secret: <CRON_SECRET>
 *   (or Authorization: Bearer <service role key>)
 * 200 { expired: <count> }
 */
import { admin, json, preflight } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  const authorized =
    (cronSecret && req.headers.get("x-cron-secret") === cronSecret) ||
    (serviceKey && auth === `Bearer ${serviceKey}`);
  if (!authorized) return json({ error: "unauthorized" }, 401);

  try {
    const { data, error } = await admin().rpc("expire_stale_orders");
    if (error) throw error;
    return json({ expired: data ?? 0 });
  } catch (e) {
    console.error("release-holds error", e);
    return json({ error: "server_error" }, 500);
  }
});

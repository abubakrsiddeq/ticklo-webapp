import { isCronAuthorized, unauthorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

// PAY-10 fallback: pg_cron already runs this every minute in Supabase.
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return unauthorized();
  const { data, error } = await createAdminClient().rpc("expire_stale_orders");
  if (error) {
    console.error("expire holds failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, expired: data ?? 0 });
}

export const GET = handle;
export const POST = handle;

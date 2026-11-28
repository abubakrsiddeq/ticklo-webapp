import { isCronAuthorized, unauthorized } from "@/lib/cron";
import { sendAdminDigest } from "@/lib/emails/admin-alerts";

// D-088: morning email to TickLO admins. Supabase cron calls this daily at 04:00 UTC (9:00 PKT).
// Sent at most once per Pakistan day and only when something waits or needs attention.
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return unauthorized();
  try {
    const result = await sendAdminDigest();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("admin digest cron failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

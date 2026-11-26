import { isCronAuthorized, unauthorized } from "@/lib/cron";
import { sendDueEventReminders } from "@/lib/emails/notify";

// EML-04: event reminders 24 hours before. Run every 15–30 minutes (Hostinger cron).
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return unauthorized();
  try {
    const result = await sendDueEventReminders();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("reminders cron failed", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;

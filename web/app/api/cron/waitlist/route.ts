import { isCronAuthorized, unauthorized } from "@/lib/cron";
import { runWaitlist } from "@/lib/waitlist";

// D-071: expire old waitlist offers and offer free places to the next people (every 5 minutes)
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return unauthorized();
  const offered = await runWaitlist();
  return Response.json({ ok: true, offered });
}

export const GET = handle;
export const POST = handle;

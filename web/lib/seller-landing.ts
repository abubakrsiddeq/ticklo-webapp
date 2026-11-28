import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
const SOON_MS = 36 * 3600 * 1000;

/**
 * D-042: after login, a seller (not an organizer) whose event is today or
 * tomorrow lands straight on the Sell screen instead of the home page.
 * Returns null when the normal destination should be used.
 */
export async function sellerLandingPath(supabase: Client): Promise<string | null> {
  const { data } = await supabase.rpc("my_sell_events");
  const now = Date.now();
  const soon = (data ?? []).filter((e) => e.access === "seller" && e.has_printed && new Date(e.starts_at).getTime() - now < SOON_MS);
  if (soon.length === 1) return `/sell/${soon[0].event_id}`;
  if (soon.length > 1) return "/event-day?list=1";
  return null;
}

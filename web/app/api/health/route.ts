import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

// Simple uptime check for Hostinger / monitoring.
export function GET() {
  return Response.json({ ok: true, supabase: isSupabaseConfigured, time: new Date().toISOString() });
}

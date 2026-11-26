"use server";

import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStaticTicketToken } from "@/lib/qr-token";
import { serverEnv } from "@/lib/env.server";
import type { ScanResponse } from "@/lib/scan/results";

/**
 * FES-06/FES-07: scan a ticket for a festival session. The signed QR is checked
 * here with the same secret as the Edge Function (D-037), then Postgres checks
 * the scanner's permission and records the check-in atomically (session_check_in).
 */
export async function scanSessionToken(eventId: string, sessionId: string, token: string, device: string): Promise<ScanResponse | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "not_authenticated" };
  if (!z.string().uuid().safeParse(eventId).success || !z.string().uuid().safeParse(sessionId).success || !token) return { error: "bad_request" };
  const admin = createAdminClient();
  const ticketId = verifyStaticTicketToken(token.slice(0, 200), serverEnv.qrSigningSecret);
  if (!ticketId) {
    await admin.rpc("log_checkin_attempt", { p_event_id: eventId, p_ticket_id: null, p_actor: session.id, p_result: "invalid", p_device: device.slice(0, 200), p_detail: "session scan" });
    return { result: "invalid" };
  }
  const { data, error } = await admin.rpc("session_check_in", {
    p_ticket_id: ticketId,
    p_session_id: sessionId,
    p_actor: session.id,
    p_method: "scan",
    p_device: device.slice(0, 200),
  });
  if (error) {
    console.error("session_check_in failed", error.message);
    return { error: "server_error" };
  }
  return data as unknown as ScanResponse;
}

/**
 * scan-verify – verifies a scanned QR token and checks the ticket in
 * (SCN-03, SCN-04, SCN-06, SCN-10).
 *
 * POST { "token": "T1....", "event_id": "<uuid>", "device": "Android Chrome" }
 *      with Authorization: Bearer <scanner JWT>
 *
 * Always 200 with a result for a real scan attempt:
 *   { result: "ok", holder_name, ticket_type, requires_student_card, checked_in_at }
 *   { result: "already_used", holder_name, ticket_type, checked_in_at }
 *   { result: "expired_code" | "wrong_event" | "invalid" | "not_found" | "cancelled" | "not_allowed" }
 * 401 not signed in · 400 bad request
 *
 * Order of checks: scanner permission → signature (fixed T2 tokens never
 * expire – D-037; legacy T1 tokens still need to be < 60 s old) → atomic
 * check-in in Postgres (perform_check_in). Every attempt is logged.
 */
import { admin, env, getUser, json, nowSeconds, preflight, readJson } from "../_shared/http.ts";
import { isUuid, verifyTicketToken } from "../_shared/qr-token.ts";

interface Body {
  token?: unknown;
  event_id?: unknown;
  device?: unknown;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const body = await readJson<Body>(req);
    const eventId = body?.event_id;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const device = typeof body?.device === "string" ? body.device.slice(0, 200) : null;
    if (!isUuid(eventId) || !token) return json({ error: "bad_request" }, 400);

    const db = admin();

    const { data: allowed, error: permError } = await db.rpc("can_scan_event", {
      p_event_id: eventId,
      p_user_id: user.id,
    });
    if (permError) throw permError;
    if (!allowed) {
      await db.rpc("log_checkin_attempt", {
        p_event_id: eventId,
        p_ticket_id: null,
        p_actor: user.id,
        p_result: "not_allowed",
        p_device: device,
        p_detail: null,
      });
      return json({ result: "not_allowed" });
    }

    const verified = await verifyTicketToken(token, env("QR_SIGNING_SECRET"), nowSeconds());
    if (!verified.ok) {
      const result = verified.reason === "expired" || verified.reason === "not_yet_valid" ? "expired_code" : "invalid";
      await db.rpc("log_checkin_attempt", {
        p_event_id: eventId,
        p_ticket_id: verified.ticketId ?? null,
        p_actor: user.id,
        p_result: result,
        p_device: device,
        p_detail: verified.reason,
      });
      return json({ result });
    }

    const { data, error } = await db.rpc("perform_check_in", {
      p_ticket_id: verified.ticketId,
      p_event_id: eventId,
      p_actor: user.id,
      p_method: "scan",
      p_device: device,
    });
    if (error) throw error;
    return json(data);
  } catch (e) {
    console.error("scan-verify error", e);
    return json({ error: "server_error" }, 500);
  }
});

/**
 * ticket-token – issues a fresh signed QR token for a ticket (TKT-02).
 *
 * POST { "ticket_id": "<uuid>" }  with  Authorization: Bearer <user JWT>
 *
 * 200 { status: "valid", token, issued_at, refresh_in: 30, valid_for: 60, server_time }
 * 200 { status: "checked_in", checked_in_at }   – ticket already used (TKT-04)
 * 200 { status: "cancelled" }                   – event cancelled
 * 401 not signed in · 404 not your ticket · 403 suspended
 *
 * The QR signing key (QR_SIGNING_SECRET) exists only in this runtime (NFR-06).
 * Used by the web app now and by the Flutter app later.
 */
import { admin, getUser, json, nowSeconds, preflight, readJson, env } from "../_shared/http.ts";
import { isUuid, QR_MAX_AGE_SECONDS, QR_ROTATE_SECONDS, signTicketToken } from "../_shared/qr-token.ts";

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const body = await readJson<{ ticket_id?: unknown }>(req);
    const ticketId = body?.ticket_id;
    if (!isUuid(ticketId)) return json({ error: "invalid_ticket_id" }, 400);

    const db = admin();
    const { data: profile } = await db.from("profiles").select("is_suspended").eq("id", user.id).maybeSingle();
    if (!profile || profile.is_suspended) return json({ error: "suspended" }, 403);

    const { data: ticket, error } = await db
      .from("tickets")
      .select("id, owner_id, status, checked_in_at")
      .eq("id", ticketId)
      .maybeSingle();
    if (error) throw error;
    if (!ticket || ticket.owner_id !== user.id) return json({ error: "not_found" }, 404);

    if (ticket.status === "checked_in") {
      return json({ status: "checked_in", checked_in_at: ticket.checked_in_at });
    }
    if (ticket.status !== "valid") {
      return json({ status: ticket.status });
    }

    const now = nowSeconds();
    const token = await signTicketToken(ticket.id, now, env("QR_SIGNING_SECRET"));
    return json({
      status: "valid",
      token,
      issued_at: now,
      server_time: now,
      refresh_in: QR_ROTATE_SECONDS,
      valid_for: QR_MAX_AGE_SECONDS,
    });
  } catch (e) {
    console.error("ticket-token error", e);
    return json({ error: "server_error" }, 500);
  }
});

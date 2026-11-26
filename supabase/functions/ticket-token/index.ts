/**
 * ticket-token – returns the ticket's fixed signed QR token (D-037).
 *
 * POST { "ticket_id": "<uuid>" }  with  Authorization: Bearer <user JWT>
 *
 * 200 { status: "valid", token, static: true }
 * 200 { status: "checked_in", checked_in_at }   – ticket already used (TKT-04)
 * 200 { status: "cancelled" }                   – event cancelled
 * 401 not signed in · 404 not your ticket · 403 suspended
 *
 * QR_SIGNING_SECRET is shared with the web server (D-037) so emails can carry the QR.
 * Used by the web app now and by the Flutter app later.
 */
import { admin, getUser, json, preflight, readJson, env } from "../_shared/http.ts";
import { isUuid, signStaticTicketToken } from "../_shared/qr-token.ts";

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

    const token = await signStaticTicketToken(ticket.id, env("QR_SIGNING_SECRET"));
    return json({ status: "valid", token, static: true });
  } catch (e) {
    console.error("ticket-token error", e);
    return json({ error: "server_error" }, 500);
  }
});

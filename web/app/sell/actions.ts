"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { serverEnv } from "@/lib/env.server";
import { verifyStaticTicketToken } from "@/lib/qr-token";
import { parseSerial, SALE_METHODS } from "@/lib/print/sales";

// Sell screen for sellers and organizers (SAL-03, D-041).

const uuid = z.string().uuid();
const METHODS: string[] = SALE_METHODS.map((m) => m.key);

export interface SellResult {
  result: "ok" | "already_sold" | "not_yours" | "returned" | "voided" | "not_found" | "not_allowed" | "invalid";
  serial?: string;
  ticket_type?: string;
  price_paisa?: number;
  comp?: boolean;
  sale_status?: string;
}

const buyer = z.object({ name: z.string().trim().max(80).optional(), phone: z.string().trim().max(20).optional() });

/** The seller scanned a ticket's QR: check our signature, then mark it sold. */
export async function sellByToken(
  eventId: string,
  token: string,
  input: { method: string; comp: boolean; buyerName?: string; buyerPhone?: string },
): Promise<ActionResult<SellResult>> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  if (!serverEnv.qrSigningSecret) return { ok: false, error: "QR codes are not set up on the server. Contact TickLO support." };
  const ticketId = verifyStaticTicketToken(String(token ?? ""), serverEnv.qrSigningSecret);
  if (!ticketId) return ok({ result: "invalid" });
  if (!input.comp && !METHODS.includes(input.method)) return { ok: false, error: "Choose how it was paid." };
  const b = buyer.safeParse({ name: input.buyerName, phone: input.buyerPhone });
  if (!b.success) return { ok: false, error: "Name up to 80 and phone up to 20 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sell_printed_ticket", {
    p_ticket_id: ticketId,
    p_method: input.method,
    p_comp: input.comp,
    p_buyer_name: b.data.name || null,
    p_buyer_phone: b.data.phone || null,
  });
  if (error) return fail(error);
  const res = data as unknown as SellResult & { event_id?: string };
  return ok(res);
}

/** Sell by serial numbers (QR damaged, or a whole book at once). */
export async function sellRange(eventId: string, form: FormData): Promise<ActionResult<{ count: number }>> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const from = parseSerial(String(form.get("from") ?? ""));
  const to = parseSerial(String(form.get("to") ?? "")) ?? from;
  if (from === null || to === null || to < from) return { ok: false, error: "Enter serial numbers, e.g. QWL-0012 to QWL-0020." };
  const comp = form.get("comp") === "1";
  const method = String(form.get("method") ?? "cash");
  if (!comp && !METHODS.includes(method)) return { ok: false, error: "Choose how it was paid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_printed_sold", {
    p_event_id: eventId,
    p_from: from,
    p_to: to,
    p_method: method,
    p_comp: comp,
    p_buyer_name: null,
    p_buyer_phone: null,
  });
  if (error) return fail(error);
  const n = Number(data ?? 0);
  return n ? ok({ count: n }, `${n} ${n === 1 ? "ticket" : "tickets"} ${comp ? "given as free passes" : "sold"}.`) : { ok: false, error: "No tickets changed – they may be sold already or not given to you." };
}

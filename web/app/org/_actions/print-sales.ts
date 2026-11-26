"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { rupeesToPaisa } from "@/lib/format";
import { parseSerial, SALE_METHODS } from "@/lib/print/sales";

// Printed ticket sales and cash (D-041). Every write is a Postgres function that
// checks the organizer again; these actions only parse the form.

const uuid = z.string().uuid();
const METHODS = SALE_METHODS.map((m) => m.key) as [string, ...string[]];

async function staffContext(orgSlug: string) {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return null;
  return access;
}

const refresh = (orgSlug: string) => revalidatePath(`/org/${orgSlug}`, "layout");

function range(form: FormData): { from: number; to: number } | { error: string } {
  const from = parseSerial(String(form.get("from") ?? ""));
  const to = parseSerial(String(form.get("to") ?? "")) ?? from;
  if (from === null || to === null) return { error: "Enter a serial number, e.g. QWL-0012." };
  if (to < from) return { error: "“To” must be the same or after “From”." };
  return { from, to };
}

export async function savePrintSeller(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const sellerId = String(form.get("sellerId") ?? "");
  const userId = String(form.get("userId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  if (!userId && !name) return { ok: false, error: "Give the seller a name.", fieldErrors: { name: "Required" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_print_seller", {
    p_event_id: eventId,
    p_seller_id: uuid.safeParse(sellerId).success ? sellerId : null,
    p_name: name,
    p_phone: phone || null,
    p_user_id: uuid.safeParse(userId).success ? userId : null,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Seller saved.");
}

export async function deletePrintSeller(orgSlug: string, sellerId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sellerId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_print_seller", { p_seller_id: sellerId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Seller removed.");
}

const ACTIONS = ["assign", "sell", "comp", "return", "undo"] as const;

/** One form for all range actions: give to seller, mark sold, free pass, return, undo. */
export async function printedRangeAction(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult<{ count: number }>> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const action = String(form.get("action") ?? "") as (typeof ACTIONS)[number];
  if (!ACTIONS.includes(action)) return { ok: false, error: "Choose what to do." };
  const r = range(form);
  if ("error" in r) return { ok: false, error: r.error, fieldErrors: { from: r.error } };
  const supabase = await createClient();
  const sellerId = String(form.get("sellerId") ?? "");
  const method = String(form.get("method") ?? "cash");
  let res: { data: unknown; error: unknown };
  if (action === "assign") {
    res = await supabase.rpc("assign_printed_tickets", { p_event_id: eventId, p_seller_id: uuid.safeParse(sellerId).success ? sellerId : null, p_from: r.from, p_to: r.to });
  } else if (action === "sell" || action === "comp") {
    if (action === "sell" && !METHODS.includes(method)) return { ok: false, error: "Choose how it was paid." };
    res = await supabase.rpc("mark_printed_sold", {
      p_event_id: eventId,
      p_from: r.from,
      p_to: r.to,
      p_method: method,
      p_comp: action === "comp",
      p_buyer_name: r.from === r.to ? String(form.get("buyerName") ?? "") || null : null,
      p_buyer_phone: r.from === r.to ? String(form.get("buyerPhone") ?? "") || null : null,
    });
  } else if (action === "return") {
    res = await supabase.rpc("return_printed_tickets", { p_event_id: eventId, p_from: r.from, p_to: r.to, p_note: String(form.get("note") ?? "") || null });
  } else {
    res = await supabase.rpc("undo_printed_sale", { p_event_id: eventId, p_from: r.from, p_to: r.to });
  }
  if (res.error) return fail(res.error);
  refresh(orgSlug);
  const n = Number(res.data ?? 0);
  const what = { assign: "given to the seller", sell: "marked sold", comp: "marked as free passes", return: "returned – they won't get in", undo: "back in stock" }[action];
  if (n === 0) return { ok: true, data: { count: 0 }, message: "No tickets changed – check the serial numbers and their status." };
  return ok({ count: n }, `${n} ${n === 1 ? "ticket" : "tickets"} ${what}.`);
}

export async function addPrintCash(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const raw = String(form.get("amount") ?? "").trim();
  const negative = raw.startsWith("-");
  const paisa = rupeesToPaisa(raw.replace(/^-/, ""));
  if (!Number.isFinite(paisa) || paisa <= 0) return { ok: false, error: "Enter the amount in rupees.", fieldErrors: { amount: "Enter an amount" } };
  const method = String(form.get("method") ?? "cash");
  if (!METHODS.includes(method)) return { ok: false, error: "Choose how the money came in." };
  const sellerId = String(form.get("sellerId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_print_cash", {
    p_event_id: eventId,
    p_seller_id: uuid.safeParse(sellerId).success ? sellerId : null,
    p_amount_paisa: negative ? -paisa : paisa,
    p_method: method,
    p_note: String(form.get("note") ?? "") || null,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, negative ? "Correction saved." : "Money received saved.");
}

export async function deletePrintCash(orgSlug: string, entryId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(entryId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_print_cash", { p_entry_id: entryId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Entry deleted.");
}

export async function settlePrintSeller(orgSlug: string, sellerId: string, close: boolean): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sellerId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_print_seller", { p_seller_id: sellerId, p_close: close });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, close ? "Account closed and locked." : "Account reopened.");
}

export async function setPrintBatchOptions(orgSlug: string, batchId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(batchId).success) return { ok: false, error: "Not allowed." };
  const costRaw = String(form.get("printingCost") ?? "").trim();
  const cost = costRaw ? rupeesToPaisa(costRaw) : 0;
  if (!Number.isFinite(cost) || cost < 0) return { ok: false, error: "Enter the printing cost in rupees.", fieldErrors: { printingCost: "Invalid amount" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_print_batch_options", {
    p_batch_id: batchId,
    p_require_sale: form.get("requireSale") === "on",
    p_printing_cost_paisa: cost,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Batch settings saved.");
}

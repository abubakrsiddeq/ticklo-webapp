"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { fromPKTInputValue, rupeesToPaisa } from "@/lib/format";
import { normalizeCode } from "@/lib/referrals";


// Ambassadors, promo codes and rewards (D-043). Every write is a Postgres
// function that checks the organizer again; these actions only parse forms.

const uuid = z.string().uuid();

async function staffContext(orgSlug: string) {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return null;
  return access;
}

const refresh = (orgSlug: string) => revalidatePath(`/org/${orgSlug}`, "layout");

type ValueKind = "none" | "fixed" | "percent";
const kind = (v: FormDataEntryValue | null): ValueKind => (v === "fixed" || v === "percent" ? v : "none");

/** Rupees → paisa for "fixed", whole number for "percent". NaN when invalid. */
function amount(k: ValueKind, raw: FormDataEntryValue | null): number {
  if (k === "none") return 0;
  const s = String(raw ?? "").trim();
  if (k === "percent") return /^\d{1,3}$/.test(s) ? Number(s) : NaN;
  return rupeesToPaisa(s);
}

export async function saveReferralSettings(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const rewardType = kind(form.get("reward_type"));
  const discountType = kind(form.get("discount_type"));
  const rewardValue = amount(rewardType, form.get("reward_value"));
  const discountValue = amount(discountType, form.get("discount_value"));
  if (!Number.isFinite(rewardValue) || (rewardType !== "none" && rewardValue <= 0)) {
    return { ok: false, error: "Enter the reward.", fieldErrors: { reward_value: rewardType === "percent" ? "Whole percent, 1–100" : "Rupees" } };
  }
  if (!Number.isFinite(discountValue) || (discountType !== "none" && discountValue <= 0)) {
    return { ok: false, error: "Enter the buyer discount.", fieldErrors: { discount_value: discountType === "percent" ? "Whole percent, 1–100" : "Rupees" } };
  }
  const milestones: { tickets: number; reward: string }[] = [];
  const counts = form.getAll("milestone_tickets");
  const rewards = form.getAll("milestone_reward");
  for (let i = 0; i < counts.length; i++) {
    const t = String(counts[i] ?? "").trim();
    const r = String(rewards[i] ?? "").trim();
    if (!t && !r) continue;
    if (!/^\d{1,6}$/.test(t) || Number(t) < 1 || !r) return { ok: false, error: "Each milestone needs a number of tickets and a reward.", fieldErrors: { milestones: "Check the milestones" } };
    milestones.push({ tickets: Number(t), reward: r.slice(0, 80) });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_referral_settings", {
    p_event_id: eventId,
    p_reward_type: rewardType,
    p_reward_value: rewardValue,
    p_discount_type: discountType,
    p_discount_value: discountValue,
    p_credit_on: form.get("credit_on") === "checked_in" ? "checked_in" : "approved",
    p_leaderboard: form.get("leaderboard") === "on",
    p_applications_open: form.get("applications_open") === "on",
    p_milestones: milestones,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Ambassador program saved.");
}

export async function setSellerCode(orgSlug: string, sellerId: string, code: string): Promise<ActionResult<{ code: string }>> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sellerId).success) return { ok: false, error: "Not allowed." };
  const c = normalizeCode(code);
  if (!c || c.length < 3 || c.length > 16) return { ok: false, error: "Use 3 to 16 letters or digits.", fieldErrors: { code: "3–16 letters or digits" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_seller_code", { p_seller_id: sellerId, p_code: c });
  if (error) return fail(error, { code: "Try another code" });
  refresh(orgSlug);
  return ok({ code: String(data) }, `Code changed to ${data}. Old links with the previous code stop working.`);
}

export async function savePromoCode(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const id = String(form.get("id") ?? "");
  const code = normalizeCode(String(form.get("code") ?? ""));
  if (!code || code.length < 3 || code.length > 16) return { ok: false, error: "Use 3 to 16 letters or digits.", fieldErrors: { code: "3–16 letters or digits" } };
  const type = form.get("discount_type") === "fixed" ? "fixed" : "percent";
  const value = amount(type, form.get("discount_value"));
  if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100)) {
    return { ok: false, error: "Enter the discount.", fieldErrors: { discount_value: type === "percent" ? "Whole percent, 1–100" : "Rupees off each ticket" } };
  }
  const maxRaw = String(form.get("max_uses") ?? "").trim();
  const maxUses = maxRaw ? Number(maxRaw) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return { ok: false, error: "Uses must be a whole number.", fieldErrors: { max_uses: "Whole number" } };
  const minRaw = String(form.get("min_tickets") ?? "1").trim() || "1";
  const minTickets = Number(minRaw);
  if (!Number.isInteger(minTickets) || minTickets < 1 || minTickets > 50) return { ok: false, error: "Minimum tickets: 1 to 50.", fieldErrors: { min_tickets: "1–50" } };
  const typeIds = form.getAll("ticket_type_ids").map(String).filter((v) => uuid.safeParse(v).success);
  const startsRaw = String(form.get("starts_at") ?? "").trim();
  const endsRaw = String(form.get("ends_at") ?? "").trim();
  const startsAt = startsRaw ? fromPKTInputValue(startsRaw) : null;
  const endsAt = endsRaw ? fromPKTInputValue(endsRaw) : null;
  if ((startsRaw && !startsAt) || (endsRaw && !endsAt)) return { ok: false, error: "Check the dates." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_promo_code", {
    p_event_id: eventId,
    p_promo_id: uuid.safeParse(id).success ? id : null,
    p_code: code,
    p_discount_type: type,
    p_discount_value: value,
    p_max_uses: maxUses,
    p_min_tickets: minTickets,
    p_ticket_type_ids: typeIds.length ? typeIds : null,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_active: form.get("active") !== "off",
    p_note: String(form.get("note") ?? "").slice(0, 120) || null,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, `Promo code ${code} saved.`);
}

export async function setPromoActive(orgSlug: string, promoId: string, active: boolean): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(promoId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_promo_code_active", { p_promo_id: promoId, p_active: active });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, active ? "Code turned on." : "Code turned off.");
}

export async function deletePromoCode(orgSlug: string, promoId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(promoId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_promo_code", { p_promo_id: promoId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Promo code deleted.");
}

export async function addReferralPayout(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const sellerId = String(form.get("sellerId") ?? "");
  if (!uuid.safeParse(sellerId).success) return { ok: false, error: "Choose the ambassador." };
  const raw = String(form.get("amount") ?? "").trim();
  const negative = raw.startsWith("-");
  const paisa = raw ? rupeesToPaisa(raw.replace(/^-/, "")) : 0;
  if (!Number.isFinite(paisa) || paisa < 0) return { ok: false, error: "Enter the amount in rupees.", fieldErrors: { amount: "Rupees" } };
  const note = String(form.get("note") ?? "").trim().slice(0, 200);
  if (paisa === 0 && !note) return { ok: false, error: "Enter an amount or write what was given (e.g. VIP pass).", fieldErrors: { note: "Required without an amount" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_referral_payout", {
    p_event_id: eventId,
    p_seller_id: sellerId,
    p_amount_paisa: negative ? -paisa : paisa,
    p_note: note || null,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Reward recorded.");
}

export async function deleteReferralPayout(orgSlug: string, payoutId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(payoutId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_referral_payout", { p_payout_id: payoutId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Entry deleted.");
}

export async function decideApplication(orgSlug: string, applicationId: string, approve: boolean): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(applicationId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_ambassador_application", { p_application_id: applicationId, p_approve: approve });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, approve ? "Accepted – they now have their own link and code." : "Application declined.");
}

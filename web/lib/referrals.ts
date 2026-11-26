/**
 * Ambassadors, referral links and promo codes (D-043). Pure functions shared by
 * the booking widget, the ambassador screen and the organizer pages, so the
 * numbers on screen always match Postgres (`discount_for`, `ambassador_rows`).
 */
import { formatPKR } from "./format";

export const REF_PARAM = "ref";
export const REF_DAYS = 7;
export const refCookieName = (eventId: string) => `tl_ref_${eventId}`;

/** "ali-10 " → "ALI10" (same as SQL normalize_code). Null when nothing is left. */
export function normalizeCode(code: string | null | undefined): string | null {
  const c = (code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return c ? c : null;
}

export const isValidCode = (code: string | null | undefined) => /^[A-Z0-9]{3,16}$/.test(code ?? "");

export type DiscountType = "none" | "fixed" | "percent";

export interface DiscountRule {
  type: DiscountType;
  value: number; // paisa off each ticket, or whole percent
  ticketTypeIds?: string[] | null; // null/empty = all
  minTickets?: number;
}

export interface PricedItem {
  ticketTypeId: string;
  quantity: number;
  pricePaisa: number;
}

/** Discount in paisa for these items (fixed = off EACH ticket, never below 0; percent rounded per ticket). */
export function discountFor(items: PricedItem[], rule: DiscountRule | null | undefined): number {
  if (!rule || rule.type === "none" || !rule.value) return 0;
  const only = rule.ticketTypeIds?.length ? new Set(rule.ticketTypeIds) : null;
  let sum = 0;
  for (const it of items) {
    if (it.quantity <= 0 || (only && !only.has(it.ticketTypeId))) continue;
    const per = rule.type === "fixed" ? Math.min(rule.value, it.pricePaisa) : Math.round((it.pricePaisa * rule.value) / 100);
    sum += it.quantity * per;
  }
  return sum;
}

/** Tickets the rule applies to (for "choose at least N tickets"). */
export function eligibleQuantity(items: PricedItem[], rule: Pick<DiscountRule, "ticketTypeIds">): number {
  const only = rule.ticketTypeIds?.length ? new Set(rule.ticketTypeIds) : null;
  return items.reduce((n, it) => (only && !only.has(it.ticketTypeId) ? n : n + Math.max(0, it.quantity)), 0);
}

/** "Rs 100 off each ticket" / "10% off" / null */
export function discountLabel(type: DiscountType | string | null | undefined, value: number | null | undefined): string | null {
  if (!value || !type || type === "none") return null;
  return type === "percent" ? `${value}% off` : `${formatPKR(value)} off each ticket`;
}

/** "Rs 50 per ticket" / "5% of sales" / null */
export function rewardLabel(type: DiscountType | string | null | undefined, value: number | null | undefined): string | null {
  if (!value || !type || type === "none") return null;
  return type === "percent" ? `${value}% of the money you bring` : `${formatPKR(value)} per ticket`;
}

export interface Milestone {
  tickets: number;
  reward: string;
}

/** Reached milestones and the next one with progress 0..1. */
export function milestoneProgress(milestones: Milestone[], tickets: number) {
  const sorted = [...milestones].sort((a, b) => a.tickets - b.tickets);
  const reached = sorted.filter((m) => tickets >= m.tickets);
  const next = sorted.find((m) => tickets < m.tickets) ?? null;
  const prev = reached.length ? reached[reached.length - 1].tickets : 0;
  const progress = next ? Math.max(0, Math.min(1, (tickets - prev) / (next.tickets - prev))) : 1;
  return { reached, next, progress, left: next ? next.tickets - tickets : 0 };
}

/** The ambassador's share link: /e/<society>/<event>?ref=ALI */
export function ambassadorPath(orgSlug: string, eventSlug: string, code: string): string {
  return `/e/${orgSlug}/${eventSlug}?${REF_PARAM}=${encodeURIComponent(code)}`;
}

/** Ready-made WhatsApp text an ambassador sends to friends (Roman Urdu, like the rest of TickLO's chat copy). */
export function shareMessage(p: { eventName: string; when: string; url: string; code: string; discount: string | null }): string {
  const lines = [
    `🎟️ *${p.eventName}*`,
    p.when,
    "",
    p.discount ? `Mere link se ticket lo aur ${p.discount} pao 👇` : "Ticket yahan se book karo 👇",
    p.url,
    "",
    `Code: *${p.code}*`,
  ];
  return lines.join("\n");
}

export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Due = reward − already paid (never negative on screen). */
export const rewardDue = (rewardPaisa: number, paidPaisa: number) => Math.max(0, rewardPaisa - paidPaisa);

/** 3+ orders from one phone number for one ambassador is worth a look. */
export const SAME_PHONE_FLAG = 3;

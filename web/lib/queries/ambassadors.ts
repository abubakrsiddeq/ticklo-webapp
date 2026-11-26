import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DiscountType, Milestone } from "@/lib/referrals";

export interface AmbassadorRow {
  seller_id: string;
  name: string;
  phone: string | null;
  user_id: string | null;
  ref_code: string;
  joined_via: string;
  settled_at: string | null;
  clicks: number;
  pending_tickets: number;
  online_orders: number;
  online_tickets: number;
  online_checked_in: number;
  online_revenue_paisa: number;
  discount_paisa: number;
  paper_sold: number;
  paper_used: number;
  paper_revenue_paisa: number;
  credited_tickets: number;
  credited_revenue_paisa: number;
  reward_paisa: number;
  paid_paisa: number;
  max_orders_same_phone: number;
  rank: number;
}

export interface ReferralSettings {
  reward_type: DiscountType;
  reward_value: number;
  discount_type: DiscountType;
  discount_value: number;
  credit_on: "approved" | "checked_in";
  leaderboard: boolean;
  applications_open: boolean;
  milestones: Milestone[];
}

export const DEFAULT_SETTINGS: ReferralSettings = {
  reward_type: "none",
  reward_value: 0,
  discount_type: "none",
  discount_value: 0,
  credit_on: "approved",
  leaderboard: true,
  applications_open: false,
  milestones: [],
};

export interface PromoRow {
  id: string;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: number;
  max_uses: number | null;
  min_tickets: number;
  ticket_type_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  note: string | null;
  uses: number; // held, in review or approved
  approved: number;
  discount_paisa: number; // given on approved orders
}

const num = (v: unknown) => Number(v ?? 0);

/** D-043: everything the organizer's Ambassadors page and CSV need (organizers only – RLS + function checks). */
export async function getAmbassadorPage(eventId: string) {
  const supabase = await createClient();
  const now = Date.now();
  const [rowsRes, settingsRes, promoRes, promoOrdersRes, payoutsRes, appsRes] = await Promise.all([
    supabase.rpc("ambassador_summary", { p_event_id: eventId }),
    supabase.from("referral_settings").select("*").eq("event_id", eventId).maybeSingle(),
    supabase.from("promo_codes").select("*").eq("event_id", eventId).order("created_at"),
    supabase.from("orders").select("promo_code_id, status, hold_expires_at, discount_paisa").eq("event_id", eventId).not("promo_code_id", "is", null),
    supabase.from("referral_payouts").select("id, seller_id, amount_paisa, note, created_at").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.rpc("ambassador_applications_for", { p_event_id: eventId }),
  ]);

  const rows: AmbassadorRow[] = (rowsRes.data ?? []).map((r) => ({
    ...r,
    clicks: num(r.clicks),
    pending_tickets: num(r.pending_tickets),
    online_orders: num(r.online_orders),
    online_tickets: num(r.online_tickets),
    online_checked_in: num(r.online_checked_in),
    online_revenue_paisa: num(r.online_revenue_paisa),
    discount_paisa: num(r.discount_paisa),
    paper_sold: num(r.paper_sold),
    paper_used: num(r.paper_used),
    paper_revenue_paisa: num(r.paper_revenue_paisa),
    credited_tickets: num(r.credited_tickets),
    credited_revenue_paisa: num(r.credited_revenue_paisa),
    reward_paisa: num(r.reward_paisa),
    paid_paisa: num(r.paid_paisa),
    max_orders_same_phone: num(r.max_orders_same_phone),
    rank: num(r.rank),
  }));

  const s = settingsRes.data;
  const settings: ReferralSettings = s
    ? {
        reward_type: s.reward_type as DiscountType,
        reward_value: s.reward_value,
        discount_type: s.discount_type as DiscountType,
        discount_value: s.discount_value,
        credit_on: s.credit_on as ReferralSettings["credit_on"],
        leaderboard: s.leaderboard,
        applications_open: s.applications_open,
        milestones: (Array.isArray(s.milestones) ? s.milestones : []) as unknown as Milestone[],
      }
    : DEFAULT_SETTINGS;

  const usage = new Map<string, { uses: number; approved: number; discount: number }>();
  for (const o of promoOrdersRes.data ?? []) {
    if (!o.promo_code_id) continue;
    const u = usage.get(o.promo_code_id) ?? { uses: 0, approved: 0, discount: 0 };
    const live = o.status === "approved" || o.status === "under_review" || (o.status === "awaiting_payment" && o.hold_expires_at && new Date(o.hold_expires_at).getTime() > now);
    if (live) u.uses += 1;
    if (o.status === "approved") {
      u.approved += 1;
      u.discount += num(o.discount_paisa);
    }
    usage.set(o.promo_code_id, u);
  }
  const promos: PromoRow[] = (promoRes.data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    discount_type: p.discount_type as PromoRow["discount_type"],
    discount_value: p.discount_value,
    max_uses: p.max_uses,
    min_tickets: p.min_tickets,
    ticket_type_ids: p.ticket_type_ids,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    active: p.active,
    note: p.note,
    uses: usage.get(p.id)?.uses ?? 0,
    approved: usage.get(p.id)?.approved ?? 0,
    discount_paisa: usage.get(p.id)?.discount ?? 0,
  }));

  const totals = rows.reduce(
    (t, r) => ({
      tickets: t.tickets + r.credited_tickets,
      revenue: t.revenue + r.credited_revenue_paisa,
      reward: t.reward + r.reward_paisa,
      paid: t.paid + r.paid_paisa,
      pending: t.pending + r.pending_tickets,
      clicks: t.clicks + r.clicks,
      discount: t.discount + r.discount_paisa,
    }),
    { tickets: 0, revenue: 0, reward: 0, paid: 0, pending: 0, clicks: 0, discount: 0 },
  );

  return {
    rows,
    settings,
    promos,
    payouts: (payoutsRes.data ?? []).map((p) => ({ ...p, amount_paisa: num(p.amount_paisa) })),
    applications: appsRes.data ?? [],
    totals,
  };
}

export type AmbassadorPage = Awaited<ReturnType<typeof getAmbassadorPage>>;

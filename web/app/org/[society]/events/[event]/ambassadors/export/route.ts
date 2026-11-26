import { type NextRequest } from "next/server";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAmbassadorPage } from "@/lib/queries/ambassadors";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { ambassadorPath, discountLabel, rewardDue } from "@/lib/referrals";

const rupees = (p: number) => (p / 100).toFixed(2);

// D-043 (AMB-08): ambassadors, promo codes and rewards given, as CSV
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const access = await getOrgAccess(society);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug").eq("org_id", access.org.id).eq("slug", eventSlug).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const { rows, promos, payouts } = await getAmbassadorPage(event.id);
  const names = new Map(rows.map((r) => [r.seller_id, r.name]));

  const out: (string | number | null)[][] = rows.map((r) => [
    "Ambassador",
    r.rank,
    r.name,
    r.phone,
    r.ref_code,
    absoluteUrl(ambassadorPath(access.org.slug, event.slug, r.ref_code)),
    r.clicks,
    r.online_tickets,
    r.pending_tickets,
    r.online_checked_in,
    r.paper_sold,
    r.credited_tickets,
    rupees(r.credited_revenue_paisa),
    rupees(r.discount_paisa),
    rupees(r.reward_paisa),
    rupees(r.paid_paisa),
    rupees(rewardDue(r.reward_paisa, r.paid_paisa)),
    r.max_orders_same_phone,
  ]);
  out.push([]);
  out.push(["Promo code", "Code", "Discount", "Min tickets", "Max uses", "Used", "Paid orders", "Discount given (Rs)", "Active"]);
  for (const p of promos) {
    out.push(["Promo", p.code, discountLabel(p.discount_type, p.discount_value), p.min_tickets, p.max_uses ?? "", p.uses, p.approved, rupees(p.discount_paisa), p.active ? "yes" : "no"]);
  }
  out.push([]);
  out.push(["Reward given", "When (PKT)", "Ambassador", "Amount (Rs)", "Note"]);
  for (const p of payouts) out.push(["Reward", formatDateTime(p.created_at), names.get(p.seller_id) ?? "", rupees(p.amount_paisa), p.note]);

  const csv = toCsv(
    [
      "Row",
      "Rank",
      "Name",
      "Phone",
      "Code",
      "Link",
      "Link opens",
      "Online tickets (approved)",
      "Online in review",
      "Online scanned",
      "Paper sold",
      "Counts for them",
      "Money brought (Rs)",
      "Discounts (Rs)",
      "Reward earned (Rs)",
      "Given (Rs)",
      "Due (Rs)",
      "Most orders from one phone",
    ],
    out,
  );
  return csvResponse(`${event.slug}-ambassadors.csv`, csv);
}

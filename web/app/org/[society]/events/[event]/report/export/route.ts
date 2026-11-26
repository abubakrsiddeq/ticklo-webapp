import { type NextRequest } from "next/server";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventReport } from "@/lib/queries/report";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

// ORG-12: report CSV
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const access = await getOrgAccess(society);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug").eq("org_id", access.org.id).eq("slug", eventSlug).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const r = await getEventReport(event.id);
  const rows: (string | number | null)[][] = r.orders.map((o) => [
    o.ref_code,
    o.buyer_name,
    o.buyer_phone,
    o.order_items.map((i) => `${i.quantity}x ${i.ticket_types.name}`).join("; "),
    o.ticket_count,
    (Number(o.total_paisa) / 100).toFixed(2),
    (Number(o.discount_paisa ?? 0) / 100).toFixed(2),
    o.promo_codes?.code ?? "",
    o.print_sellers ? `${o.print_sellers.name} (${o.print_sellers.ref_code})` : "",
    o.accountName,
    o.transactionId,
    o.approved_at ? formatDateTime(o.approved_at) : "",
  ]);
  rows.push([]);
  rows.push(["TOTAL", "", "", "", r.tickets, (r.total / 100).toFixed(2), (r.discount / 100).toFixed(2), "", "", "", "", ""]);
  for (const a of r.byAccount) rows.push([`Account: ${a.name}`, "", "", `${a.orders} orders`, "", (a.amount / 100).toFixed(2), "", "", "", "", "", ""]);
  const csv = toCsv(
    ["Order", "Buyer", "Phone", "Tickets", "Ticket count", "Amount (PKR)", "Discount (PKR)", "Promo code", "Ambassador", "Paid to", "Transaction ID", "Approved at (PKT)"],
    rows,
  );
  return csvResponse(`${event.slug}-report.csv`, csv);
}

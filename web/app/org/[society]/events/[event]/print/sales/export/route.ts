import { type NextRequest } from "next/server";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrintSales } from "@/lib/queries/print-sales";
import { csvResponse, toCsv } from "@/lib/csv";
import { methodLabel } from "@/lib/print/sales";
import { formatDateTime } from "@/lib/format";

const rupees = (p: number) => (p / 100).toFixed(2);

// D-041: printed ticket sales per seller + money entries, as CSV
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const access = await getOrgAccess(society);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug").eq("org_id", access.org.id).eq("slug", eventSlug).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const { summary, cash } = await getPrintSales(event.id);
  const names = new Map(summary.sellers.map((s) => [s.id, s.name]));
  const rows: (string | number | null)[][] = summary.sellers.map((s) => [
    "Seller",
    s.name,
    s.phone,
    s.ranges,
    s.given,
    s.returned,
    s.voided,
    s.comp,
    s.inStock,
    s.sold,
    s.soldAtGate,
    s.used,
    rupees(s.expected),
    rupees(s.cash),
    rupees(s.difference),
    s.settledAt ? formatDateTime(s.settledAt) : "",
  ]);
  const t = summary.totals;
  rows.push(["Total", "", "", "", t.given, t.returned, t.voided, t.comp, t.inStock, t.sold, t.soldAtGate, t.used, rupees(t.expected), rupees(t.cash), rupees(t.difference), ""]);
  rows.push([]);
  rows.push(["Money received", "When (PKT)", "From", "How", "Amount (Rs)", "Note"]);
  for (const e of cash) rows.push(["Money", formatDateTime(e.created_at), names.get(e.seller_id) ?? "Organizer", methodLabel(e.method), rupees(Number(e.amount_paisa)), e.note]);
  rows.push([]);
  rows.push(["Printing cost (Rs)", rupees(t.printingCost)]);
  const csv = toCsv(
    ["Row", "Seller", "Phone", "Serials now", "Given", "Returned", "Voided", "Free passes", "In stock", "Sold", "Sold found at gate", "Came in", "Should hand over (Rs)", "Received (Rs)", "Difference (Rs)", "Closed at"],
    rows,
  );
  return csvResponse(`${event.slug}-printed-sales.csv`, csv);
}

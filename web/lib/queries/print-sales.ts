import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeSalesSummary, type CashEntry, type SaleSeller, type SaleTicket } from "@/lib/print/sales";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

/** D-041: everything the printed-sales page, report and CSV need (organizers only – RLS). */
export async function getPrintSales(eventId: string) {
  const supabase = await createClient();

  const loadTickets = async () => {
    const rows: SaleTicket[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("tickets")
        .select(
          "serial_no, status, sale_status, sale_source, sale_method, sale_price_paisa, sold_at, seller_id, print_batches!inner ( prefix ), ticket_types!inner ( name, price_paisa )",
        )
        .eq("event_id", eventId)
        .eq("source", "printed")
        .order("serial_no")
        .range(from, from + PAGE - 1);
      for (const r of data ?? []) {
        rows.push({
          serial_no: r.serial_no ?? 0,
          prefix: r.print_batches.prefix,
          status: r.status,
          sale_status: r.sale_status as SaleTicket["sale_status"],
          sale_source: r.sale_source as SaleTicket["sale_source"],
          sale_method: r.sale_method,
          sale_price_paisa: r.sale_price_paisa,
          sold_at: r.sold_at,
          seller_id: r.seller_id,
          type_name: r.ticket_types.name,
          price_paisa: r.ticket_types.price_paisa,
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return rows;
  };

  const [tickets, { data: sellers }, { data: cash }, { data: batches }] = await Promise.all([
    loadTickets(),
    supabase.from("print_sellers").select("id, name, phone, user_id, settled_at, created_at").eq("event_id", eventId).order("created_at"),
    supabase.from("print_cash_entries").select("id, seller_id, amount_paisa, method, note, created_at, received_by").eq("event_id", eventId).order("created_at", { ascending: false }),
    supabase.from("print_batches").select("id, printing_cost_paisa").eq("event_id", eventId),
  ]);
  const printingCost = (batches ?? []).reduce((s, b) => s + Number(b.printing_cost_paisa ?? 0), 0);
  const summary = computeSalesSummary(tickets, (sellers ?? []) as SaleSeller[], (cash ?? []) as CashEntry[], printingCost);
  return { summary, sellers: sellers ?? [], cash: cash ?? [], hasBatches: (batches ?? []).length > 0 };
}

export type PrintSales = Awaited<ReturnType<typeof getPrintSales>>;

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { accountLabel } from "@/lib/payments/accounts";

/** ORG-12: approved orders, total collected, totals per payment account and per ticket type. */
export async function getEventReport(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `id, ref_code, buyer_name, buyer_phone, total_paisa, ticket_count, approved_at, created_at,
       order_items ( quantity, unit_price_paisa, ticket_types!inner ( name ) ),
       payment_proofs ( status, transaction_id, created_at, payment_accounts ( id, kind, bank_name, account_number ) )`,
    )
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("approved_at", { ascending: true });

  const orders = (data ?? []).map((o) => {
    const proof = [...(o.payment_proofs ?? [])]
      .filter((p) => p.status === "approved")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const acc = proof?.payment_accounts ?? null;
    return {
      ...o,
      transactionId: proof?.transaction_id ?? null,
      accountKey: acc?.id ?? (o.total_paisa === 0 ? "free" : "unknown"),
      accountName: acc ? `${accountLabel(acc)} · ${acc.account_number}` : o.total_paisa === 0 ? "Free tickets" : "Not specified",
    };
  });

  const byAccount = new Map<string, { name: string; orders: number; amount: number }>();
  const byType = new Map<string, { tickets: number; amount: number }>();
  let total = 0;
  let tickets = 0;
  for (const o of orders) {
    total += Number(o.total_paisa);
    tickets += o.ticket_count;
    const a = byAccount.get(o.accountKey) ?? { name: o.accountName, orders: 0, amount: 0 };
    a.orders += 1;
    a.amount += Number(o.total_paisa);
    byAccount.set(o.accountKey, a);
    for (const i of o.order_items) {
      const t = byType.get(i.ticket_types.name) ?? { tickets: 0, amount: 0 };
      t.tickets += i.quantity;
      t.amount += i.quantity * i.unit_price_paisa;
      byType.set(i.ticket_types.name, t);
    }
  }
  // PRT-10: printed (paper) tickets – sold for cash outside TickLO, so not in "Collected"
  const { data: printedRows } = await supabase
    .from("tickets")
    .select("status, ticket_types!inner ( name, price_paisa )")
    .eq("event_id", eventId)
    .eq("source", "printed");
  const printedMap = new Map<string, { name: string; printed: number; used: number; voided: number; faceValue: number }>();
  for (const t of printedRows ?? []) {
    const p = printedMap.get(t.ticket_types.name) ?? { name: t.ticket_types.name, printed: 0, used: 0, voided: 0, faceValue: 0 };
    if (t.status === "cancelled") p.voided++;
    else {
      p.printed++;
      p.faceValue += t.ticket_types.price_paisa;
      if (t.status === "checked_in") p.used++;
    }
    printedMap.set(t.ticket_types.name, p);
  }

  return {
    printed: [...printedMap.values()],
    orders,
    total,
    tickets,
    byAccount: [...byAccount.values()].sort((a, b) => b.amount - a.amount),
    byType: [...byType.entries()].map(([name, v]) => ({ name, ...v })),
  };
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** The signed-in buyer's order with everything the checkout/status pages need (RLS: owner only). */
export async function getOrderForBuyer(orderId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `*, events!inner ( id, name, slug, venue, starts_at, ends_at, status, poster_url,
         organizations!inner ( slug, name ) ),
       order_items ( quantity, unit_price_paisa, ticket_types!inner ( id, name, requires_student_card, sale_ends_at ) )`,
    )
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!order) return null;

  const [{ data: links }, { data: proofs }, { data: disputes }] = await Promise.all([
    supabase
      .from("event_payment_accounts")
      .select("payment_accounts!inner ( id, kind, bank_name, account_title, account_number, iban, is_active )")
      .eq("event_id", order.event_id),
    supabase
      .from("payment_proofs")
      .select("id, status, transaction_id, sender_name, reject_reason, created_at, is_possible_duplicate")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false }),
    supabase.from("disputes").select("id, status, message, admin_note, created_at").eq("order_id", order.id).order("created_at", { ascending: false }),
  ]);

  const accounts = (links ?? []).map((l) => l.payment_accounts).filter((a) => a.is_active);
  return { order, accounts, proofs: proofs ?? [], disputes: disputes ?? [] };
}

export type BuyerOrder = NonNullable<Awaited<ReturnType<typeof getOrderForBuyer>>>;

/** Status shown to the student: an awaiting order whose hold ended counts as expired. */
export function effectiveStatus(order: { status: string; hold_expires_at: string | null }, now: number): string {
  if (order.status === "awaiting_payment" && order.hold_expires_at && new Date(order.hold_expires_at).getTime() <= now) {
    return "expired";
  }
  return order.status;
}

/** PAY-08: a rejected order can get a new screenshot while the sale is open. */
export function canRetry(order: BuyerOrder["order"], now: number): boolean {
  if (order.status !== "rejected" || order.events.status !== "published") return false;
  return order.order_items.every((i) => now < new Date(i.ticket_types.sale_ends_at ?? order.events.starts_at).getTime());
}

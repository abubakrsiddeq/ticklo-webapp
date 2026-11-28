import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { EditorTicketType } from "@/lib/ticket-groups";

/** ORG-05 / D-087: an event's ticket types with what they open, how many are taken and whether they are booked. */
export async function getEditorTicketTypes(supabase: ServerSupabase, eventId: string, sessionName: Map<string, string>): Promise<EditorTicketType[]> {
  const [{ data: types }, { data: availability }, { data: access }] = await Promise.all([
    supabase.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order").order("created_at"),
    supabase.rpc("event_availability", { p_event_id: eventId }),
    supabase.from("ticket_type_sessions").select("ticket_type_id, session_id, event_sessions!inner ( event_id )").eq("event_sessions.event_id", eventId),
  ]);
  const typeIds = (types ?? []).map((t) => t.id);
  const [{ data: bookedRows }, { data: printedRows }] = typeIds.length
    ? await Promise.all([
        supabase.from("order_items").select("ticket_type_id, orders!inner ( status )").in("ticket_type_id", typeIds).neq("orders.status", "expired"),
        supabase.from("tickets").select("ticket_type_id").in("ticket_type_id", typeIds).eq("source", "printed").limit(1000),
      ])
    : [{ data: [] }, { data: [] }];
  const booked = new Set([...(bookedRows ?? []), ...(printedRows ?? [])].map((r) => r.ticket_type_id));
  const remaining = new Map((availability ?? []).map((a) => [a.ticket_type_id, a.remaining]));

  return (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    price_paisa: t.price_paisa,
    quantity: t.quantity,
    sale_starts_at: t.sale_starts_at,
    sale_ends_at: t.sale_ends_at,
    requires_student_card: t.requires_student_card,
    early_price_paisa: t.early_price_paisa,
    early_until: t.early_until,
    booked: booked.has(t.id),
    taken: t.quantity - (remaining.get(t.id) ?? t.quantity),
    all_sessions: t.all_sessions,
    session_ids: (access ?? []).filter((a) => a.ticket_type_id === t.id).map((a) => a.session_id),
    registration_for: t.registration_session_id ? (sessionName.get(t.registration_session_id) ?? "a competition") : null,
  }));
}

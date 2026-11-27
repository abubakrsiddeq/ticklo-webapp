import "server-only";
import { createClient } from "@/lib/supabase/server";
import { serialLabel } from "@/lib/print/design";
import { fetchAll } from "./fetch-all";

/** ORG-09: attendees of an event (organizers only – RLS). Printed tickets (PRT-10) have no order. */
export async function listAttendees(eventId: string) {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase
    .from("tickets")
    .select(
      `id, code, holder_name, holder_university, holder_phone, status, checked_in_at, checkin_method, created_at, checked_in_by, source, serial_no,
       ticket_types!inner ( name, requires_student_card ),
       orders ( ref_code, buyer_phone, buyer_email, created_at ),
       print_batches ( prefix )`,
    )
    .eq("event_id", eventId)
    .order("holder_name")
    .order("id")
    .range(from, to),
  );
  const rows = data ?? [];
  // Names of the people who checked tickets in (ORG-13 log with scanner name)
  const scannerIds = [...new Set(rows.map((r) => r.checked_in_by).filter((x): x is string => Boolean(x)))];
  const { data: people } = scannerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", scannerIds)
    : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Team member"]));
  return rows.map((r) => ({
    ...r,
    serial: r.print_batches && r.serial_no ? serialLabel(r.print_batches.prefix, r.serial_no) : null,
    orderRef: r.orders?.ref_code ?? (r.print_batches && r.serial_no ? `Printed ${serialLabel(r.print_batches.prefix, r.serial_no)}` : "–"),
    orderCreatedAt: r.orders?.created_at ?? r.created_at,
    phone: r.orders?.buyer_phone ?? r.holder_phone,
    email: r.orders?.buyer_email ?? null,
    checked_in_by_name: r.checked_in_by ? (names.get(r.checked_in_by) ?? "Team member") : null,
  }));
}

export type Attendee = Awaited<ReturnType<typeof listAttendees>>[number];

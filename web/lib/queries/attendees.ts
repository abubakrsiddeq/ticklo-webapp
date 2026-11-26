import "server-only";
import { createClient } from "@/lib/supabase/server";

/** ORG-09: attendees of an event (organizers only – RLS). */
export async function listAttendees(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select(
      `id, code, holder_name, status, checked_in_at, checkin_method, created_at, checked_in_by,
       ticket_types!inner ( name, requires_student_card ),
       orders!inner ( ref_code, buyer_phone, buyer_email, created_at )`,
    )
    .eq("event_id", eventId)
    .order("holder_name");
  const rows = data ?? [];
  // Names of the people who checked tickets in (ORG-13 log with scanner name)
  const scannerIds = [...new Set(rows.map((r) => r.checked_in_by).filter((x): x is string => Boolean(x)))];
  const { data: people } = scannerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", scannerIds)
    : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Team member"]));
  return rows.map((r) => ({ ...r, checked_in_by_name: r.checked_in_by ? (names.get(r.checked_in_by) ?? "Team member") : null }));
}

export type Attendee = Awaited<ReturnType<typeof listAttendees>>[number];

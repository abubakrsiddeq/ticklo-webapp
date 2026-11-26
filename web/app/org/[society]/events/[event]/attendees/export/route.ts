import { type NextRequest } from "next/server";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listAttendees } from "@/lib/queries/attendees";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

// ORG-09: attendee CSV export
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const access = await getOrgAccess(society);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug").eq("org_id", access.org.id).eq("slug", eventSlug).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const rows = await listAttendees(event.id);
  const csv = toCsv(
    ["Name", "Ticket type", "Ticket code", "Source", "Serial", "Order", "Order time (PKT)", "Phone", "Email", "Status", "Checked in at (PKT)", "Checked in by", "Method"],
    rows.map((r) => [
      r.holder_name,
      r.ticket_types.name,
      r.code,
      r.source,
      r.serial ?? "",
      r.orders?.ref_code ?? "",
      formatDateTime(r.orderCreatedAt),
      r.phone,
      r.email,
      r.status,
      r.checked_in_at ? formatDateTime(r.checked_in_at) : "",
      r.checked_in_by_name ?? "",
      r.checkin_method ?? "",
    ]),
  );
  return csvResponse(`${event.slug}-attendees.csv`, csv);
}

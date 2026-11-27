import { type NextRequest } from "next/server";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listAttendees } from "@/lib/queries/attendees";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { answerLabel, ticketFieldsOf } from "@/lib/registration-form";

// ORG-09: attendee CSV export
export async function GET(_req: NextRequest, { params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const access = await getOrgAccess(society);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return new Response("Not allowed", { status: 403 });
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, slug, format, ticket_form, attendee_names, attendee_university").eq("org_id", access.org.id).eq("slug", eventSlug).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const rows = await listAttendees(event.id);
  // D-069: custom fields of the event's ticket form as columns (festival sessions: see each session's export)
  const custom = event.format === "festival" ? [] : ticketFieldsOf({ member: event.ticket_form }, { names: event.attendee_names, university: event.attendee_university }).filter((f) => !f.builtin);
  const csv = toCsv(
    ["Name", "University", "Ticket type", "Ticket code", "Source", "Serial", "Order", "Order time (PKT)", "Phone", "Email", "Status", "Checked in at (PKT)", "Checked in by", "Method", ...custom.map((f) => f.label)],
    rows.map((r) => [
      r.holder_name,
      r.holder_university ?? "",
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
      ...custom.map((f) => answerLabel(f, ((r.answers ?? {}) as Record<string, Record<string, unknown>>).event?.[f.id])),
    ]),
  );
  return csvResponse(`${event.slug}-attendees.csv`, csv);
}

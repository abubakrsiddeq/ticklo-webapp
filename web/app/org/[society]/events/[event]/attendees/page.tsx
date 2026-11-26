import type { Metadata } from "next";
import { Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { requireOrgEvent } from "@/lib/auth";
import { listAttendees } from "@/lib/queries/attendees";
import { formatShortDateTime, formatTime } from "@/lib/format";
import { serverNow } from "@/lib/time";
import { AttendeeTable } from "./attendee-table";

export const metadata: Metadata = { title: "Attendees" };

export default async function AttendeesPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/attendees`);
  const attendees = await listAttendees(event.id);
  const canCheckIn = event.status === "published" && serverNow() <= new Date(event.ends_at).getTime() + 6 * 3600 * 1000;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Phone numbers and emails are private to your team (NFR-07).</p>
        <Button asChild variant="outline">
          <a href={`/org/${org.slug}/events/${event.slug}/attendees/export`} download>
            <Download /> Download CSV
          </a>
        </Button>
      </div>
      {attendees.length ? (
        <AttendeeTable
          orgSlug={org.slug}
          canCheckIn={canCheckIn}
          rows={attendees.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.holder_name,
            type: a.ticket_types.name,
            card: a.ticket_types.requires_student_card,
            orderRef: a.orderRef,
            orderTime: formatShortDateTime(a.orderCreatedAt),
            phone: a.phone,
            email: a.email,
            status: a.status,
            checkedInAt: a.checked_in_at ? formatTime(a.checked_in_at) : null,
            checkedInBy: a.checked_in_by_name,
            method: a.checkin_method,
          }))}
        />
      ) : (
        <EmptyState icon={Users} title="No attendees yet" description="Tickets appear here once orders are approved or printed tickets are created." />
      )}
    </div>
  );
}

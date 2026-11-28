import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { requireOrgEvent } from "@/lib/auth";
import { ticketFieldsOf } from "@/lib/registration-form";
import { createClient } from "@/lib/supabase/server";
import { toPKTInputValue } from "@/lib/format";
import { duplicateEvent, updateEvent } from "@/app/org/_actions/events";
import { asEventFormat } from "@/lib/sessions";
import { ticketsTabLabel } from "@/lib/ticket-groups";
import { EventForm } from "../../event-form";

export const metadata: Metadata = { title: "Event details" };

/** D-087: name, dates, venue, poster – its own tab, so the tickets tab is only about tickets. */
export default async function EventDetailsPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/details`);
  const supabase = await createClient();
  // D-069: the ticket form is locked once tickets were booked (not team entries)
  const { count: bookedOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .in("status", ["approved", "under_review", "awaiting_payment"]);
  const base = `/org/${org.slug}/events/${event.slug}`;
  const editable = event.status !== "cancelled";

  return (
    <div className="grid gap-6">
      {event.status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTitle>Not approved by TickLO</AlertTitle>
          <AlertDescription>
            {event.review_note ?? "No reason given."} Fix the details, then submit again on{" "}
            <Link href={`${base}/edit`} className="font-medium underline">
              {ticketsTabLabel(event.format)}
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}
      {editable ? (
        <Card id="details" className="scroll-mt-28">
          <CardHeader>
            <CardTitle>Event details</CardTitle>
            <CardDescription>Name, dates, venue and poster. Tickets and payment accounts are on the {ticketsTabLabel(event.format)} tab.</CardDescription>
          </CardHeader>
          <CardContent>
            <EventForm
              mode="edit"
              action={updateEvent.bind(null, org.slug, event.id)}
              posterUrl={event.poster_url}
              ticketFields={ticketFieldsOf({ member: event.ticket_form }, { names: event.attendee_names, university: event.attendee_university })}
              ticketFormLocked={(bookedOrders ?? 0) > 0}
              defaults={{
                name: event.name,
                description: event.description ?? "",
                venue: event.venue,
                starts_at: toPKTInputValue(event.starts_at),
                ends_at: toPKTInputValue(event.ends_at),
                capacity: event.format === "festival" ? "" : String(event.capacity),
                visibility: event.visibility,
                attendee_names: (event.attendee_names ?? "off") as "off" | "optional" | "required",
                attendee_university: (event.attendee_university ?? "off") as "off" | "optional" | "required",
                max_tickets_per_order: String(event.max_tickets_per_order),
                format: asEventFormat(event.format),
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">This event is cancelled, so its details can no longer be changed.</p>
      )}

      <div>
        <ActionButton variant="outline" action={duplicateEvent.bind(null, org.slug, event.id)}>
          Duplicate event
        </ActionButton>
      </div>
    </div>
  );
}

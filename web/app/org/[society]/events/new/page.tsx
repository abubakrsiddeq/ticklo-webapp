import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgStaff } from "@/lib/auth";
import { createEvent } from "../../../_actions/events";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org } = await requireOrgStaff(society, `/org/${society}/events/new`);
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">New event</CardTitle>
        <CardDescription>Saved as a draft. Next you&apos;ll set up tickets (and sessions for a festival), then submit it for approval.</CardDescription>
      </CardHeader>
      <CardContent>
        <EventForm
          mode="create"
          action={createEvent.bind(null, org.slug)}
          defaults={{
            name: "",
            description: "",
            venue: "",
            starts_at: "",
            ends_at: "",
            capacity: "100",
            visibility: "public",
            max_tickets_per_order: "5",
            format: "single",
          }}
        />
      </CardContent>
    </Card>
  );
}

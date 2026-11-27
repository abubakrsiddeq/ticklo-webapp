import type { Metadata } from "next";
import { requireOrgEvent } from "@/lib/auth";
import { OrgDecisionHistory } from "../../../../decision-history";

export const metadata: Metadata = { title: "History" };

// D-077: this event's record of approvals and rejections
export default async function EventHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/history`);
  return (
    <OrgDecisionHistory
      orgId={org.id}
      orgSlug={org.slug}
      eventId={event.id}
      basePath={`/org/${org.slug}/events/${event.slug}/history`}
      searchParams={await searchParams}
    />
  );
}

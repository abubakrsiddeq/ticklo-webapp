import Link from "next/link";
import { serverNow } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/action-button";
import { setEventSalesPaused } from "./control-actions";
import { CancelEventButton, DeleteEventButton, PauseSalesButton, UnpublishEventButton } from "./control-buttons";

export interface AdminEventRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  ends_at: string;
  sales_paused_at: string | null;
  hasBookings: boolean;
}

/** Bookings count from an events row with embedded `orders(count)`-style aggregates. */
export function countOf(rel: unknown): number {
  return Array.isArray(rel) ? Number((rel[0] as { count?: number } | undefined)?.count ?? 0) : 0;
}

/** D-084: what an admin can do with one event, wherever it is listed. */
export function EventAdminActions({ event, orgSlug, orgLive }: { event: AdminEventRow; orgSlug: string; orgLive: boolean }) {
  const upcoming = new Date(event.ends_at).getTime() > serverNow();
  const published = event.status === "published";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {orgLive ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/org/${orgSlug}/events/${event.slug}`}>Open</Link>
        </Button>
      ) : null}
      {published && upcoming ? (
        event.sales_paused_at ? (
          <ActionButton size="sm" variant="outline" action={setEventSalesPaused.bind(null, event.id, false, undefined)}>
            Resume sales
          </ActionButton>
        ) : (
          <PauseSalesButton eventId={event.id} name={event.name} />
        )
      ) : null}
      {published && !event.hasBookings ? <UnpublishEventButton eventId={event.id} name={event.name} /> : null}
      {published && upcoming ? <CancelEventButton eventId={event.id} name={event.name} /> : null}
      {!event.hasBookings ? <DeleteEventButton eventId={event.id} name={event.name} /> : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventGrid } from "@/components/event-card";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { listPublicEvents, listUniversities } from "@/lib/queries/public";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Events", description: "Find university society events across Pakistan." };

const PAGE_SIZE = 24;

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const past = sp.tab === "past";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const uni = sp.uni && /^[0-9a-f-]{36}$/i.test(sp.uni) ? sp.uni : undefined;
  const [{ events, total }, universities] = await Promise.all([
    listPublicEvents({ q: sp.q, universityId: uni, past, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listUniversities(),
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, uni, tab: past ? "past" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/events?${s}` : "/events";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-3xl font-bold text-navy">Events</h1>
      <div className="mb-4">
        <EventFilters universities={universities} q={sp.q} uni={uni} past={past} />
      </div>
      {/* EVT-09: past events in a separate tab (booking closed) */}
      <div className="mb-6 flex gap-2" role="tablist" aria-label="Upcoming or past">
        {[
          { label: "Upcoming", href: qs({ tab: undefined, page: undefined }), active: !past },
          { label: "Past events", href: qs({ tab: "past", page: undefined }), active: past },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            role="tab"
            aria-selected={t.active}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium",
              t.active ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-border hover:bg-secondary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {events.length ? (
        <>
          <EventGrid events={events} />
          {total > page * PAGE_SIZE ? (
            <div className="mt-8 flex justify-center">
              <Button asChild variant="outline">
                <Link href={qs({ page: String(page + 1) })}>Show more</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={CalendarSearch}
          title={past ? "No past events found" : "No events found"}
          description={sp.q || uni ? "Try a different search or university." : "Check back soon."}
        />
      )}
    </div>
  );
}

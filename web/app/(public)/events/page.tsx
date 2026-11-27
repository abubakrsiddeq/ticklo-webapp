import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventGrid } from "@/components/event-card";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { listPublicEvents, listPublicSessions, listUniversities } from "@/lib/queries/public";
import { SessionGrid } from "@/components/session-card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Events", description: "Find university society events across Pakistan." };

const PAGE_SIZE = 24;

// D-070: what to show – events, festivals, or the sessions inside festivals
const TYPES = [
  { key: "", label: "All" },
  { key: "festival", label: "🎪 Festivals" },
  { key: "competition", label: "🏆 Competitions" },
  { key: "workshop", label: "🛠 Workshops" },
  { key: "concert", label: "🎤 Concerts & nights" },
] as const;

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const past = sp.tab === "past";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const uni = sp.uni && /^[0-9a-f-]{36}$/i.test(sp.uni) ? sp.uni : undefined;
  const type = TYPES.some((t) => t.key === sp.type) ? (sp.type as string) : "";
  const sessionsOnly = type === "workshop" || type === "concert";
  const kinds = type === "competition" ? ["competition"] : type === "workshop" ? ["workshop"] : type === "concert" ? ["concert"] : type === "" ? undefined : null;
  const [{ events, total }, universities, sessions] = await Promise.all([
    sessionsOnly
      ? Promise.resolve({ events: [], total: 0 })
      : listPublicEvents({
          q: sp.q,
          universityId: uni,
          past,
          format: type === "festival" || type === "competition" ? type : undefined,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
    listUniversities(),
    !past && page === 1 && kinds !== null ? listPublicSessions({ q: sp.q, universityId: uni, kinds, limit: sessionsOnly ? 48 : 12 }) : Promise.resolve([]),
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, uni, tab: past ? "past" : undefined, type: type || undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/events?${s}` : "/events";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Discover</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight text-navy">Events near your campus</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Concerts, fests, workshops and more – by verified university societies.</p>
      <div className="mt-6 mb-5">
        <EventFilters universities={universities} q={sp.q} uni={uni} past={past} hidden={type ? { type } : undefined} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Type">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={qs({ type: t.key || undefined, page: undefined })}
            aria-current={type === t.key ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors",
              type === t.key ? "bg-brand-soft text-brand-strong ring-brand/40" : "bg-white text-slate-600 ring-navy/10 hover:bg-secondary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {/* EVT-09: past events in a separate tab (booking closed) */}
      <div className="mb-8 inline-flex gap-1 rounded-full bg-white p-1 shadow-card ring-1 ring-navy/[0.06]" role="tablist" aria-label="Upcoming or past">
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
              "inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition-colors",
              t.active ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:text-navy",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {sessionsOnly ? null : events.length ? (
        <>
          <EventGrid events={events} />
          {total > page * PAGE_SIZE ? (
            <div className="mt-8 flex justify-center">
              <Button asChild variant="outline" className="rounded-full px-6">
                <Link href={qs({ page: String(page + 1) })}>Show more</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : sessions.length ? null : (
        <EmptyState
          icon={CalendarSearch}
          title={past ? "No past events found" : "No events found"}
          description={sp.q || uni || type ? "Try a different search, type or university." : "Check back soon."}
        />
      )}
      {sessions.length ? (
        <section className={sessionsOnly || !events.length ? "" : "mt-12"} aria-labelledby="inside-festivals">
          <h2 id="inside-festivals" className="mb-1 text-2xl font-bold text-navy">
            {sessionsOnly ? TYPES.find((t) => t.key === type)?.label : "🎪 Inside festivals"}
          </h2>
          <p className="mb-5 text-sm text-slate-600">Competitions, workshops and nights you can join on their own.</p>
          <SessionGrid sessions={sessions} />
        </section>
      ) : sessionsOnly ? (
        <EmptyState icon={CalendarSearch} title="Nothing of this kind yet" description="Try another type or check back soon." />
      ) : null}
    </div>
  );
}

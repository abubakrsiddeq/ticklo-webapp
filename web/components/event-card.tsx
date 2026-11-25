import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { Poster } from "@/components/poster";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatPKR, formatTime } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import type { EventCardData } from "@/lib/queries/public";

function priceFrom(types: { price_paisa: number }[]): string {
  if (!types.length) return "";
  const min = Math.min(...types.map((t) => t.price_paisa));
  const max = Math.max(...types.map((t) => t.price_paisa));
  if (max === 0) return "Free";
  return min === 0 ? "Free – " + formatPKR(max) : `From ${formatPKR(min)}`;
}

export function EventCard({ event }: { event: EventCardData }) {
  const org = event.organizations;
  const uni = org.universities;
  const ended = new Date(event.ends_at).getTime() < serverNow();
  return (
    <Link
      href={eventPath(org.slug, event.slug)}
      className="group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Poster src={event.poster_url} name={event.name} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-heading text-lg font-semibold text-navy group-hover:underline">{event.name}</h3>
          {event.status === "cancelled" ? <StatusBadge status="cancelled" /> : ended ? <StatusBadge status="expired" label="Ended" /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {org.name}
          {uni ? ` · ${uni.short_name ?? uni.name}` : ""}
        </p>
        <div className="mt-auto grid gap-1 text-sm text-slate-700">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-brand-strong" aria-hidden />
            {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-brand-strong" aria-hidden />
            <span className="truncate">{event.venue}</span>
          </span>
        </div>
        {event.ticket_types.length ? <p className="text-sm font-semibold text-navy">{priceFrom(event.ticket_types)}</p> : null}
      </div>
    </Link>
  );
}

export function EventGrid({ events }: { events: EventCardData[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

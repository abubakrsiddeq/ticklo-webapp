import Link from "next/link";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import { Poster } from "@/components/poster";
import { formatPKR, formatTime, PKT_TIME_ZONE } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import type { EventCardData } from "@/lib/queries/public";

function priceFrom(types: { price_paisa: number }[]): string {
  if (!types.length) return "";
  const min = Math.min(...types.map((t) => t.price_paisa));
  const max = Math.max(...types.map((t) => t.price_paisa));
  if (max === 0) return "Free";
  return min === 0 ? "Free+" : `From ${formatPKR(min)}`;
}

const day = (d: string) => new Intl.DateTimeFormat("en-PK", { timeZone: PKT_TIME_ZONE, day: "numeric" }).format(new Date(d));
const month = (d: string) => new Intl.DateTimeFormat("en-PK", { timeZone: PKT_TIME_ZONE, month: "short" }).format(new Date(d));
const weekday = (d: string) => new Intl.DateTimeFormat("en-PK", { timeZone: PKT_TIME_ZONE, weekday: "short" }).format(new Date(d));

export function EventCard({ event }: { event: EventCardData }) {
  const org = event.organizations;
  const uni = org.universities;
  const ended = new Date(event.ends_at).getTime() < serverNow();
  const cancelled = event.status === "cancelled";
  const price = priceFrom(event.ticket_types);
  return (
    <Link
      href={eventPath(org.slug, event.slug)}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/[0.06] transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative">
        <Poster src={event.poster_url} name={event.name} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute top-3 left-3 flex flex-col items-center rounded-2xl bg-white/95 px-3 py-1.5 text-center shadow-sm backdrop-blur">
          <span className="text-[11px] font-semibold tracking-wide text-brand-strong uppercase">{month(event.starts_at)}</span>
          <span className="font-heading text-2xl leading-none font-bold text-navy">{day(event.starts_at)}</span>
        </div>
        {cancelled || ended ? (
          <span className="absolute top-3 right-3 rounded-full bg-navy/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            {cancelled ? "Cancelled" : "Ended"}
          </span>
        ) : price ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-navy shadow-sm backdrop-blur">
            {price}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-strong uppercase">
            {org.name}
            {uni ? <span className="text-slate-400"> · {uni.short_name ?? uni.name}</span> : null}
          </p>
          <h3 className="mt-1 line-clamp-2 font-heading text-lg leading-snug font-semibold text-navy">{event.name}</h3>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 text-sm text-slate-600">
          <div className="grid min-w-0 gap-1">
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-slate-400" aria-hidden />
              {weekday(event.starts_at)}, {formatTime(event.starts_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate">{event.venue}</span>
            </span>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-navy transition group-hover:bg-brand-strong group-hover:text-white" aria-hidden>
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EventGrid({ events }: { events: EventCardData[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

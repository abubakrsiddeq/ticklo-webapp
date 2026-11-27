import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, MapPin } from "lucide-react";
import { Poster } from "@/components/poster";
import { formatEventRange, formatPKR, formatTime, PKT_TIME_ZONE } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { cn } from "@/lib/utils";
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

function cardInfo(event: EventCardData) {
  const org = event.organizations;
  const uni = org.universities;
  const ended = new Date(event.ends_at).getTime() < serverNow();
  const cancelled = event.status === "cancelled";
  return {
    org,
    uniLabel: uni ? (uni.short_name ?? uni.name) : null,
    href: eventPath(org.slug, event.slug),
    status: cancelled ? "Cancelled" : ended ? "Ended" : null,
    price: priceFrom(event.ticket_types),
  };
}

function DateBadge({ date, className }: { date: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-14 flex-col items-center rounded-2xl bg-white/95 px-3 py-1.5 text-center shadow-md ring-1 ring-black/5 backdrop-blur",
        className,
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-brand-strong uppercase">{month(date)}</span>
      <span className="font-heading text-2xl leading-none font-bold text-navy">{day(date)}</span>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return <span className="rounded-full bg-navy/85 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{label}</span>;
}

const cardShell =
  "group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/[0.06] transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function EventCard({ event }: { event: EventCardData }) {
  const { org, uniLabel, href, status, price } = cardInfo(event);
  return (
    <Link href={href} className={cn(cardShell, "flex flex-col")}>
      {/* Square frame + contain: landscape and portrait posters both show in full. */}
      <div className="relative">
        <Poster
          src={event.poster_url}
          name={event.name}
          fit="contain"
          className="aspect-square w-full"
          imageClassName="transition duration-500 group-hover:scale-[1.03]"
        />
        <DateBadge date={event.starts_at} className="absolute top-3 left-3" />
        {/* D-070 */}
        {"format" in event && (event.format === "festival" || event.format === "competition") && !status ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy shadow-card">
            {event.format === "festival" ? "🎪 Festival" : "🏆 Competition"}
          </span>
        ) : null}
        {status ? (
          <span className="absolute top-3 right-3">
            <StatusPill label={status} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-brand-strong uppercase">
            {org.name}
            {uniLabel ? <span className="text-slate-400"> · {uniLabel}</span> : null}
          </p>
          <h3 className="mt-1 line-clamp-2 font-heading text-lg leading-snug font-semibold text-navy">{event.name}</h3>
        </div>
        <div className="grid gap-1.5 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-slate-400" aria-hidden />
            {weekday(event.starts_at)}, {formatTime(event.starts_at)}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{event.venue}</span>
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-navy/10 pt-4">
          {price && !status ? (
            <span className="font-heading text-base font-bold text-navy">{price}</span>
          ) : (
            <span className="text-sm text-slate-500">{status ? "Booking closed" : "Details inside"}</span>
          )}
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-navy transition group-hover:bg-brand-strong group-hover:text-white"
            aria-hidden
          >
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Wide card used when a list has a single event, so the row doesn't look empty. */
export function FeaturedEventCard({ event }: { event: EventCardData }) {
  const { org, uniLabel, href, status, price } = cardInfo(event);
  return (
    <Link href={href} className={cn(cardShell, "grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
      <div className="relative">
        <Poster
          src={event.poster_url}
          name={event.name}
          fit="contain"
          priority
          sizes="(max-width: 768px) 100vw, 600px"
          className="aspect-[4/3] h-full w-full md:aspect-auto md:min-h-[380px]"
          imageClassName="transition duration-500 group-hover:scale-[1.02]"
        />
        <DateBadge date={event.starts_at} className="absolute top-4 left-4" />
        {status ? (
          <span className="absolute top-4 right-4">
            <StatusPill label={status} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-brand-strong uppercase">
            {org.name}
            {uniLabel ? <span className="text-slate-400"> · {uniLabel}</span> : null}
          </p>
          <h3 className="mt-2 line-clamp-3 font-heading text-2xl leading-tight font-bold text-navy sm:text-3xl">{event.name}</h3>
        </div>
        <ul className="grid gap-3 text-sm text-slate-700">
          <li className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
            <span>{formatEventRange(event.starts_at, event.ends_at)}</span>
          </li>
          <li className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5">
            <MapPin className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
            <span className="min-w-0 break-words">{event.venue}</span>
          </li>
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-navy/10 pt-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{status ? "Status" : "Tickets"}</p>
            <p className="font-heading text-xl font-bold text-navy">{status ? "Booking closed" : price || "See details"}</p>
          </div>
          <span className="inline-flex h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-white transition group-hover:bg-brand-strong">
            {status ? "View event" : "Get tickets"}
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EventGrid({ events }: { events: EventCardData[] }) {
  if (events.length === 1) return <FeaturedEventCard event={events[0]} />;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

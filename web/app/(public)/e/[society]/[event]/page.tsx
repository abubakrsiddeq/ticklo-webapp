import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CalendarDays, CalendarPlus, Clock, MapPin } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/poster";
import { getEventPage } from "@/lib/queries/public";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatEventRange, formatTime } from "@/lib/format";
import { absoluteUrl, eventPath, orgPath } from "@/lib/site";
import { googleCalendarUrl } from "@/lib/calendar";
import { serverNow } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { BookingWidget, type WidgetTicketType } from "./booking-widget";

type Params = { society: string; event: string };

// EVT-04: share preview (poster, name, date) for WhatsApp / Instagram
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { society, event: eventSlug } = await params;
  const data = await getEventPage(society, eventSlug);
  if (!data) return { title: "Event not found" };
  const { event, org } = data;
  const when = `${formatDate(event.starts_at)} · ${formatTime(event.starts_at)} PKT`;
  const description = `${when} · ${event.venue} · by ${org.name}`;
  const url = absoluteUrl(eventPath(org.slug, event.slug));
  return {
    title: event.name,
    description,
    alternates: { canonical: url },
    robots: event.visibility === "link_only" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: `${event.name} – ${when}`,
      description,
      url,
      type: "website",
      images: event.poster_url
        ? [{ url: event.poster_url, alt: `${event.name} poster` }]
        : [{ url: "/brand/ticklo-og.png", width: 1200, height: 630, alt: "TickLO" }],
    },
    twitter: {
      card: event.poster_url ? "summary_large_image" : "summary",
      title: event.name,
      description,
      images: [event.poster_url ?? "/brand/ticklo-og.png"],
    },
  };
}

export default async function EventPage({ params }: { params: Promise<Params> }) {
  const { society, event: eventSlug } = await params;
  const data = await getEventPage(society, eventSlug);
  if (!data) notFound();
  const { event, org, ticketTypes } = data;
  const user = await getCurrentUser();

  const now = serverNow();
  const started = new Date(event.starts_at).getTime() <= now;
  const ended = new Date(event.ends_at).getTime() < now;
  const cancelled = event.status === "cancelled";
  const isPreview = event.status !== "published" && !cancelled; // organizer/admin viewing a draft

  const types: WidgetTicketType[] = ticketTypes.map((t) => {
    const start = t.sale_starts_at ? new Date(t.sale_starts_at).getTime() : null;
    const end = new Date(t.sale_ends_at ?? event.starts_at).getTime();
    const saleState = start && now < start ? "not_started" : now >= end ? "ended" : "on";
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      price_paisa: t.price_paisa,
      remaining: t.remaining,
      requires_student_card: t.requires_student_card,
      saleState,
      saleStartsAt: t.sale_starts_at,
    };
  });

  const onSale = !cancelled && !ended && !isPreview && types.some((t) => t.saleState === "on" && t.remaining > 0);
  const closedReason = cancelled
    ? "This event was cancelled. Ticket sales are closed."
    : ended
      ? "This event has ended."
      : isPreview
        ? "Preview – tickets go on sale after TickLO approves this event."
        : types.every((t) => t.remaining <= 0)
          ? "Sold out."
          : started
            ? "Online booking closed when the event started."
            : types.some((t) => t.saleState === "not_started")
              ? "Ticket sale has not started yet."
              : "Ticket sale is closed.";

  const pagePath = eventPath(org.slug, event.slug);
  const needs =
    user && (!user.profile.full_name || !user.profile.phone)
      ? { full_name: user.profile.full_name ?? "", phone: formatPhone(user.profile.phone) }
      : null;
  const uni = org.universities;

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      {cancelled ? (
        <Alert variant="destructive" className="mb-6">
          <Ban />
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            {org.name} cancelled this event.{event.cancel_reason ? ` Reason: ${event.cancel_reason}` : ""} Ticket holders have been
            emailed. For payments, contact the society directly.
          </AlertDescription>
        </Alert>
      ) : null}
      {isPreview ? (
        <Alert className="mb-6">
          <AlertTitle>Preview</AlertTitle>
          <AlertDescription>Only your team and TickLO admins can see this page until the event is approved.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:gap-10">
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-2xl bg-navy">
            {event.poster_url ? (
              <>
                <Image src={event.poster_url} alt="" fill sizes="10vw" className="scale-110 object-cover opacity-40 blur-2xl" aria-hidden />
                <div className="relative mx-auto aspect-[4/5] max-h-[70vh] w-full max-w-md">
                  <Image src={event.poster_url} alt={`${event.name} poster`} fill priority sizes="(max-width: 768px) 100vw, 448px" className="object-contain" />
                </div>
              </>
            ) : (
              <Poster src={null} name={event.name} className="aspect-[16/9] w-full" />
            )}
          </div>

          <header className="mt-6">
            <Link href={orgPath(org.slug)} className="flex items-center gap-2 text-sm font-medium text-brand-strong hover:underline">
              {org.logo_url ? <Image src={org.logo_url} alt="" width={24} height={24} className="rounded-full" /> : null}
              {org.name}
              {uni ? <span className="text-muted-foreground">· {uni.short_name ?? uni.name}</span> : null}
            </Link>
            <h1 className={`mt-2 text-3xl font-bold text-navy sm:text-4xl ${cancelled ? "line-through decoration-2" : ""}`}>{event.name}</h1>
            <ul className="mt-4 grid gap-2 text-slate-700">
              <li className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                <span>{formatEventRange(event.starts_at, event.ends_at)}</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                <span>{event.venue}</span>
              </li>
              {!ended && !cancelled ? (
                <li className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                  <span className="text-sm text-muted-foreground">All times are Pakistan time (PKT).</span>
                </li>
              ) : null}
            </ul>
            {!ended && !cancelled ? (
              <Button asChild variant="outline" size="sm" className="mt-4">
                <a
                  href={googleCalendarUrl({
                    name: event.name,
                    starts_at: event.starts_at,
                    ends_at: event.ends_at,
                    venue: event.venue,
                    url: absoluteUrl(pagePath),
                    details: event.description,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <CalendarPlus /> Add to Google Calendar
                </a>
              </Button>
            ) : null}
          </header>

          {event.description ? (
            <section className="mt-8">
              <h2 className="mb-2 text-xl font-semibold text-navy">About this event</h2>
              <div className="whitespace-pre-line leading-relaxed text-slate-700">{event.description}</div>
            </section>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingWidget
            eventId={event.id}
            types={types}
            maxPerOrder={event.max_tickets_per_order}
            onSale={onSale}
            closedReason={closedReason}
            loggedIn={Boolean(user)}
            loginHref={`/login?next=${encodeURIComponent(pagePath)}`}
            needs={needs}
          />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            You pay {org.name} directly by bank transfer or wallet. TickLO charges no fees.
          </p>
        </aside>
      </div>
    </article>
  );
}

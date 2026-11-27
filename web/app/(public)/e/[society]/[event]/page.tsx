import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
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
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeCode, refCookieName, rewardLabel, REF_PARAM, type DiscountType } from "@/lib/referrals";
import { BookingWidget, type AttendeeSetting, type WidgetReferral, type WidgetTicketType } from "./booking-widget";
import { CompetitionCard } from "@/components/sessions/competition-card";
import { ticketSaleEnd } from "@/lib/sessions";
import { RefCapture } from "./ref-capture";
import { AmbassadorCta } from "./ambassador-cta";
import { PublicSchedule } from "@/components/sessions/public-schedule";

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

type AmbassadorInfo = { applications_open: boolean; reward_type: string; reward_value: number; has_milestones: boolean; my_status: "pending" | "approved" | "rejected" | "ambassador" | null };

/** AMB-03: who sent this visitor (?ref=ALI, or remembered for 7 days) and is the program taking ambassadors? */
async function referralContext(eventId: string, published: boolean, urlRef: string | null) {
  if (!published || !isSupabaseConfigured) return { referral: null, fromUrl: false, info: null };
  const jar = await cookies();
  const code = urlRef ?? normalizeCode(jar.get(refCookieName(eventId))?.value);
  const supabase = await createClient();
  const [preview, info] = await Promise.all([
    code && code.length <= 16 ? supabase.rpc("referral_preview", { p_event_id: eventId, p_code: code }) : Promise.resolve({ data: null }),
    supabase.rpc("event_ambassador_info", { p_event_id: eventId }),
  ]);
  const p = preview.data as null | { kind: string | null; valid: boolean; code: string; name?: string; discount_type?: DiscountType; discount_value?: number };
  const referral: WidgetReferral | null =
    p && p.valid && p.kind === "ambassador"
      ? { code: p.code, name: p.name ?? null, discountType: p.discount_type ?? "none", discountValue: p.discount_value ?? 0 }
      : null;
  return { referral, fromUrl: Boolean(urlRef && referral), info: (info.data as AmbassadorInfo | null) ?? null };
}

export default async function EventPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { society, event: eventSlug } = await params;
  const sp = await searchParams;
  const [data, user] = await Promise.all([getEventPage(society, eventSlug), getCurrentUser()]);
  if (!data) notFound();
  const { event, org, ticketTypes, sessions } = data;
  const urlRef = normalizeCode(typeof sp[REF_PARAM] === "string" ? sp[REF_PARAM] : null);
  const { referral, fromUrl, info } = await referralContext(event.id, event.status === "published", urlRef);

  const now = serverNow();
  const started = new Date(event.starts_at).getTime() <= now;
  const ended = new Date(event.ends_at).getTime() < now;
  const cancelled = event.status === "cancelled";
  const isPreview = event.status !== "published" && !cancelled; // organizer/admin viewing a draft

  // D-044: competition entry fees are paid through team registration, not the ticket list
  const types: WidgetTicketType[] = ticketTypes.filter((t) => !t.registration_session_id).map((t) => {
    const start = t.sale_starts_at ? new Date(t.sale_starts_at).getTime() : null;
    // D-064: festival tickets sell until their session starts
    const end = new Date(ticketSaleEnd(event.format, t, sessions, event)).getTime();
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
      all_sessions: t.all_sessions,
      session_ids: t.session_ids,
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
          : started && event.format !== "festival"
            ? "Online booking closed when the event started."
            : types.some((t) => t.saleState === "not_started")
              ? "Ticket sale has not started yet."
              : "Ticket sale is closed.";

  const pagePath = eventPath(org.slug, event.slug);
  const eventOpen = !cancelled && !ended && event.status === "published";
  // D-064: a session's "Get ticket" button picks a ticket on sale that opens it by name
  const sessionTickets: Record<string, string> = {};
  for (const s of sessions) {
    if (s.kind === "competition") continue;
    const t = types.find((x) => !x.all_sessions && x.session_ids.includes(s.id) && x.saleState === "on" && x.remaining > 0);
    if (t) sessionTickets[s.id] = t.id;
  }
  const competitions = sessions.filter((s) => s.kind === "competition");
  const showCompetitionCard = competitions.length > 0 && (event.format === "competition" || !types.length);
  const preselect = typeof sp.ticket === "string" ? sp.ticket : null;
  const needs =
    user && (!user.profile.full_name || !user.profile.phone)
      ? { full_name: user.profile.full_name ?? "", phone: formatPhone(user.profile.phone) }
      : null;
  const uni = org.universities;

  const ambassadorPerk = info ? rewardLabel(info.reward_type, info.reward_value) ?? (info.has_milestones ? "earn rewards" : null) : null;
  const showAmbassador = Boolean(info && !cancelled && !ended && (info.applications_open || info.my_status === "ambassador" || info.my_status === "pending"));

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      {fromUrl && referral ? <RefCapture eventId={event.id} code={referral.code} /> : null}
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
          <div className="relative overflow-hidden rounded-3xl bg-navy shadow-lift">
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
            <h1 className={`mt-2 text-3xl font-bold tracking-tight text-navy sm:text-5xl ${cancelled ? "line-through decoration-2" : ""}`}>{event.name}</h1>
            <ul className="mt-5 grid gap-3 text-slate-700 sm:grid-cols-2">
              <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                <span>{formatEventRange(event.starts_at, event.ends_at)}</span>
              </li>
              <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <MapPin className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                <span>{event.venue}</span>
              </li>
              {!ended && !cancelled ? (
                <li className="flex items-start gap-2 sm:col-span-2">
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
            <section className="mt-10 rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06] sm:p-8">
              <h2 className="mb-3 text-2xl font-bold text-navy">About this event</h2>
              <div className="whitespace-pre-line leading-relaxed text-slate-700">{event.description}</div>
            </section>
          ) : null}
          {sessions.length ? (
            <PublicSchedule
              sessions={sessions}
              eventVenue={event.venue}
              registerBase={`${pagePath}/register`}
              eventUrl={absoluteUrl(pagePath)}
              open={eventOpen}
              now={now}
              sessionTickets={sessionTickets}
            />
          ) : null}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-28 lg:self-start">
          {showCompetitionCard ? (
            <CompetitionCard
              competitions={competitions}
              registerBase={`${pagePath}/register`}
              now={now}
              eventOpen={eventOpen}
              notOpenText={cancelled ? "This event was cancelled." : ended ? "This event has ended." : "Registration opens after TickLO approves this event."}
            />
          ) : null}
          {types.length ? (
          <BookingWidget
            eventId={event.id}
            types={types}
            maxPerOrder={event.max_tickets_per_order}
            onSale={onSale}
            closedReason={closedReason}
            loggedIn={Boolean(user)}
            loginHref={`/login?next=${encodeURIComponent(pagePath)}`}
            needs={needs}
            referral={referral}
            attendeeNames={event.attendee_names as AttendeeSetting}
            attendeeUniversity={event.attendee_university as AttendeeSetting}
            buyerName={user?.profile.full_name ?? ""}
            preselect={preselect}
            format={event.format}
            sessions={sessions.map((x) => ({ id: x.id, name: x.name, kind: x.kind, starts_at: x.starts_at, ends_at: x.ends_at, pass_access: x.pass_access, questions: x.questions, attendee_names: x.attendee_names, attendee_university: x.attendee_university }))}
          />
          ) : null}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            You pay {org.name} directly by bank transfer or wallet. TickLO charges no fees.
          </p>
          {showAmbassador && info ? (
            <AmbassadorCta
              eventId={event.id}
              loggedIn={Boolean(user)}
              loginHref={`/login?next=${encodeURIComponent(pagePath)}`}
              status={info.my_status}
              perk={ambassadorPerk ? (ambassadorPerk.startsWith("Rs") || /^\d/.test(ambassadorPerk) ? `earn ${ambassadorPerk}` : ambassadorPerk) : null}
            />
          ) : null}
        </aside>
      </div>
    </article>
  );
}

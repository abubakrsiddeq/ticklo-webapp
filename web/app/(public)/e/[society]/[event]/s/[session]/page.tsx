import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarPlus, MapPin, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEventPage } from "@/lib/queries/public";
import { formatDate, formatEventRange, formatPKR, formatTime } from "@/lib/format";
import { absoluteUrl, eventPath } from "@/lib/site";
import { googleCalendarUrl } from "@/lib/calendar";
import { serverNow } from "@/lib/time";
import { competitionCta, competitionState, kindEmoji, kindLabel, seatsLabel, teamSizeLabel, ticketSaleEnd, competitionFeeText } from "@/lib/sessions";

type Params = { society: string; event: string; session: string };

async function load(p: Params) {
  const data = await getEventPage(p.society, p.event);
  if (!data) return null;
  const s = data.sessions.find((x) => x.slug === p.session || x.id === p.session);
  return s ? { ...data, s } : null;
}

// D-070: a session's own page – share it on WhatsApp / Instagram with its own poster
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const d = await load(p);
  if (!d) return { title: "Not found" };
  const { s, event, org } = d;
  const when = `${formatDate(s.starts_at)} · ${formatTime(s.starts_at)} PKT`;
  const description = `${when} · ${s.venue ?? event.venue} · part of ${event.name} by ${org.name}`;
  const url = absoluteUrl(`${eventPath(org.slug, event.slug)}/s/${s.slug}`);
  const image = s.poster_url ?? event.poster_url;
  return {
    title: `${s.name} – ${event.name}`,
    description,
    alternates: { canonical: url },
    robots: event.visibility === "link_only" ? { index: false, follow: false } : undefined,
    openGraph: {
      title: `${s.name} – ${when}`,
      description,
      url,
      type: "website",
      images: image ? [{ url: image, alt: `${s.name} poster` }] : [{ url: "/brand/ticklo-og.png", width: 1200, height: 630, alt: "TickLO" }],
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: s.name, description, images: [image ?? "/brand/ticklo-og.png"] },
  };
}

export default async function SessionPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const d = await load(p);
  if (!d) notFound();
  const { s, event, org, ticketTypes, sessions } = d;
  const base = eventPath(org.slug, event.slug);
  const now = serverNow();
  const eventOpen = event.status === "published" && new Date(event.ends_at).getTime() >= now;
  const competition = s.kind === "competition";
  const state = competition ? competitionState(s, now, eventOpen) : null;

  // How to get in: its own ticket on sale, or a pass that includes it
  const onSale = (t: (typeof ticketTypes)[number]) => {
    const start = t.sale_starts_at ? new Date(t.sale_starts_at).getTime() : null;
    const end = new Date(ticketSaleEnd(event.format, t, sessions, event)).getTime();
    return (!start || now >= start) && now < end && t.remaining > 0 && !t.registration_session_id;
  };
  const own = competition ? undefined : ticketTypes.find((t) => !t.all_sessions && t.session_ids.includes(s.id) && onSale(t));
  const pass = competition || !s.pass_access ? undefined : ticketTypes.find((t) => t.all_sessions && onSale(t));
  const results = (s.results ?? []) as { place: number; label: string; name: string }[];

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link href={base} className="text-sm font-medium text-brand-strong hover:underline">
        ← Part of {event.format === "festival" ? "🎪 " : ""}
        {event.name}
      </Link>
      {s.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.poster_url} alt={`${s.name} poster`} className="mt-4 max-h-[28rem] w-full rounded-3xl bg-navy object-contain shadow-lift" />
      ) : null}
      <p className="mt-6 text-sm font-semibold tracking-wide text-brand-strong uppercase">
        {kindEmoji(s.kind)} {kindLabel(s.kind)} · {org.name}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy sm:text-4xl">{s.name}</h1>
      <ul className="mt-5 grid gap-3 text-slate-700 sm:grid-cols-2">
        <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          <span>{formatEventRange(s.starts_at, s.ends_at)}</span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
          <MapPin className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
          <span>{s.venue ?? event.venue}</span>
        </li>
        {competition ? (
          <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] sm:col-span-2">
            <Users className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
            <span>
              {teamSizeLabel(s.team_min, s.team_max)} · {competitionFeeText(s, now)}
              {seatsLabel(s) ? ` · ${seatsLabel(s)}` : ""}
            </span>
          </li>
        ) : null}
      </ul>

      <div className="mt-6 grid gap-3 rounded-3xl bg-white p-5 shadow-lift ring-1 ring-navy/[0.06]">
        {competition ? (
          state === "open" ? (
            <Button asChild variant="brand" size="lg">
              <Link href={`${base}/register/${s.id}`}>{competitionCta(s)}</Link>
            </Button>
          ) : (
            <p className="text-center font-medium text-navy">
              {state === "full" ? "This competition is full." : state === "closed" ? "Registration is closed." : "Registration is not open yet."}
            </p>
          )
        ) : own ? (
          <Button asChild variant="brand" size="lg">
            <Link href={`${base}?ticket=${own.id}#tickets`}>Get ticket · {formatPKR(own.price_paisa, { freeLabel: "Free" })}</Link>
          </Button>
        ) : pass ? (
          <Button asChild variant="brand" size="lg">
            <Link href={`${base}?ticket=${pass.id}#tickets`}>Included in {pass.name} · {formatPKR(pass.price_paisa, { freeLabel: "Free" })}</Link>
          </Button>
        ) : (
          <p className="text-center text-muted-foreground">{eventOpen ? "Tickets for this are not on sale right now." : "This event is not open."}</p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Part of <Link href={base} className="font-medium text-brand-strong hover:underline">{event.name}</Link> · see the full schedule and all tickets.
        </p>
      </div>

      {s.description ? (
        <section className="mt-8 rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06]">
          <h2 className="mb-2 text-xl font-bold text-navy">About</h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-700">{s.description}</p>
        </section>
      ) : null}

      {results.length ? (
        <section className="mt-8 rounded-3xl bg-brand-soft p-6">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-navy">
            <Trophy className="size-5 text-amber-500" aria-hidden /> Results
          </h2>
          <ol className="grid gap-1 text-navy">
            {results.map((r) => (
              <li key={r.place}>
                <span className="font-semibold">{r.label}</span> {r.name}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {eventOpen ? (
        <Button asChild variant="outline" size="sm" className="mt-6">
          <a
            href={googleCalendarUrl({ name: s.name, starts_at: s.starts_at, ends_at: s.ends_at, venue: s.venue ?? event.venue, url: absoluteUrl(`${base}/s/${s.slug}`), details: s.description })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus /> Add to Google Calendar
          </a>
        </Button>
      ) : null}
    </article>
  );
}

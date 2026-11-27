"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarPlus, Clock, MapPin, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatPKR, formatTime } from "@/lib/format";
import { googleCalendarUrl } from "@/lib/calendar";
import { competitionCta, competitionState, feeLabel, groupByDay, kindEmoji, kindLabel, seatsLabel, SESSION_KINDS, teamSizeLabel } from "@/lib/sessions";
import { cn } from "@/lib/utils";

export interface PublicSession {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  venue: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  remaining: number | null;
  pass_access: boolean;
  team_min: number;
  team_max: number;
  fee_mode: string;
  fee_paisa: number | null;
  needs_approval: boolean;
  registration_ends_at: string | null;
  registration_type_id?: string | null;
  poster_url?: string | null;
  slug?: string;
  results: { place: number; label: string; name: string }[];
}

/** FES-04: the festival programme on the event page – by day, filter by kind. */
export function PublicSchedule(props: {
  sessions: PublicSession[];
  eventVenue: string;
  registerBase: string; // /e/<society>/<event>/register
  eventUrl: string;
  open: boolean; // event live (not cancelled/ended)
  now: number;
  /** D-064: session id → a ticket type on sale that opens it ("Get ticket") */
  sessionTickets?: Record<string, { id: string; price: number }>;
  /** D-070: a pass is on sale (sessions in passes say "Included in pass") */
  hasPass?: boolean;
  /** D-070: /e/<society>/<event>/s – each session's own page */
  sessionBase?: string;
}) {
  const days = useMemo(() => groupByDay(props.sessions), [props.sessions]);
  const [day, setDay] = useState(days[0]?.day ?? "");
  const [kind, setKind] = useState<string>("all");
  const kinds = SESSION_KINDS.filter((k) => props.sessions.some((s) => s.kind === k.key));
  const current = days.find((d) => d.day === day) ?? days[0];
  const shown = (current?.sessions ?? []).filter((s) => kind === "all" || s.kind === kind);

  return (
    <section className="mt-10 rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06] sm:p-8" aria-labelledby="schedule-heading">
      <h2 id="schedule-heading" className="text-2xl font-bold text-navy">
        Schedule
      </h2>
      {days.length > 1 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Days">
          {days.map((d) => (
            <button
              key={d.day}
              role="tab"
              aria-selected={d.day === current?.day}
              onClick={() => setDay(d.day)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                d.day === current?.day ? "bg-navy text-white" : "bg-secondary text-navy hover:bg-secondary/70",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{current?.label}</p>
      )}
      {kinds.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter">
          {[{ key: "all", label: "All", emoji: "" }, ...kinds].map((k) => (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors",
                kind === k.key ? "bg-brand-soft text-brand-strong ring-brand/40" : "text-slate-600 ring-navy/10 hover:bg-secondary",
              )}
            >
              {k.emoji ? `${k.emoji} ` : ""}
              {k.label}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-5 grid gap-3">
        {shown.map((s) => {
          const competition = s.kind === "competition";
          const seats = seatsLabel(s);
          const full = s.capacity !== null && s.remaining !== null && s.remaining <= 0;
          const regClosed = competition && s.registration_ends_at ? props.now >= new Date(s.registration_ends_at).getTime() : false;
          // D-064: one rule with the sidebar card and the register page
          const state = competition ? competitionState(s, props.now, props.open) : null;
          const ticket = !competition && props.open ? props.sessionTickets?.[s.id] : undefined;
          return (
            <li key={s.id} className="grid gap-2 rounded-2xl border border-navy/10 p-4 sm:grid-cols-[88px_1fr_auto] sm:items-start">
              <div className="text-sm font-semibold text-navy tabular-nums">
                {formatTime(s.starts_at)}
                <span className="block text-xs font-normal text-muted-foreground">to {formatTime(s.ends_at)}</span>
              </div>
              <div className="flex min-w-0 gap-3">
                {s.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.poster_url} alt={`${s.name} poster`} loading="lazy" className="h-24 w-20 shrink-0 rounded-xl object-cover ring-1 ring-navy/10" />
                ) : null}
                <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                  <span aria-hidden>{kindEmoji(s.kind)}</span>{" "}
                  {props.sessionBase && s.slug ? (
                    <Link href={`${props.sessionBase}/${s.slug}`} className="hover:underline">
                      {s.name}
                    </Link>
                  ) : (
                    s.name
                  )}
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-slate-600">{kindLabel(s.kind)}</span>
                  {s.pass_access && !competition && props.hasPass !== false ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-strong">✓ Included in pass</span> : null}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {s.venue ?? props.eventVenue}
                  </span>
                  {competition ? (
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden /> {teamSizeLabel(s.team_min, s.team_max)} · {feeLabel(s.fee_paisa, s.fee_mode)}
                    </span>
                  ) : null}
                  {competition && s.registration_ends_at && !regClosed ? (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> Register by {formatDateTime(s.registration_ends_at)}
                    </span>
                  ) : null}
                  {seats ? <span className={full ? "font-semibold text-destructive" : s.remaining !== null && s.remaining <= 10 ? "font-semibold text-warning" : ""}>{seats}</span> : null}
                </p>
                {s.description ? <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{s.description}</p> : null}
                {s.results.length ? (
                  <ol className="mt-3 grid gap-1 rounded-xl bg-brand-soft p-3 text-sm">
                    {s.results.map((r) => (
                      <li key={r.place} className="flex items-center gap-2 text-navy">
                        <Trophy className={cn("size-4", r.place === 1 ? "text-amber-500" : "text-brand-strong")} aria-hidden />
                        <span className="font-semibold">{r.label}</span> {r.name}
                      </li>
                    ))}
                  </ol>
                ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                {state === "open" ? (
                  <Button asChild size="sm" variant="brand">
                    <Link href={`${props.registerBase}/${s.id}`}>{competitionCta(s)}</Link>
                  </Button>
                ) : state === "full" || state === "closed" ? (
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-slate-600">{state === "full" ? "Full" : "Registration closed"}</span>
                ) : null}
                {ticket && !full ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={`?ticket=${ticket.id}#tickets`}>Get ticket · {formatPKR(ticket.price, { freeLabel: "Free" })}</a>
                  </Button>
                ) : null}
                {props.open ? (
                  <a
                    href={googleCalendarUrl({ name: s.name, starts_at: s.starts_at, ends_at: s.ends_at, venue: s.venue ?? props.eventVenue, url: props.eventUrl, details: s.description })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline"
                  >
                    <CalendarPlus className="size-3.5" aria-hidden /> Calendar
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
        {!shown.length ? <li className="text-sm text-muted-foreground">Nothing of this kind on this day.</li> : null}
      </ul>
    </section>
  );
}

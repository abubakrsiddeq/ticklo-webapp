import { PKT_TIME_ZONE, formatDate, formatPKR, formatTime } from "@/lib/format";
import { kindEmoji } from "@/lib/sessions";
import type { PlaceholderValues } from "./design";

const part = (d: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: PKT_TIME_ZONE, ...options }).format(d);
const dayKey = (d: Date) => part(d, { year: "numeric", month: "2-digit", day: "2-digit" });

/** A festival session as the printed-ticket screens need it (D-079). */
export interface PrintSession {
  id: string;
  name: string;
  kind: string;
  /** D-081: the kind of night / event, a template category key ("qawwali", "dj-night"…). */
  style?: string | null;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  poster_url?: string | null;
  pass_access: boolean;
}

/**
 * What a ticket type gets you in (D-079):
 *  - event:    not a festival, the event itself (as before)
 *  - session:  a festival ticket for one session (Qawwali Night)
 *  - sessions: a festival ticket for some chosen sessions (a combo)
 *  - pass:     a festival pass (every session included in passes)
 *  - entry:    a festival ticket that opens no session (gate entry)
 */
export type PrintScopeKind = "event" | "session" | "sessions" | "pass" | "entry";
export interface PrintScope {
  kind: PrintScopeKind;
  /** The sessions it opens, by start time. */
  sessions: PrintSession[];
  /** Entry tickets: every session of the festival, by start time (when the gate opens). */
  festivalSessions?: PrintSession[];
}

export function ticketScope(
  format: string | null | undefined,
  type: { all_sessions?: boolean; session_ids?: string[] } | null | undefined,
  sessions: PrintSession[],
): PrintScope {
  if (format !== "festival" || !type) return { kind: "event", sessions: [] };
  const byStart = [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (type.all_sessions) return { kind: "pass", sessions: byStart.filter((s) => s.pass_access) };
  const ids = new Set(type.session_ids ?? []);
  const own = byStart.filter((s) => ids.has(s.id));
  if (!own.length) return { kind: "entry", sessions: [], festivalSessions: byStart };
  return { kind: own.length === 1 ? "session" : "sessions", sessions: own };
}

/** "Tue, 1 Dec 2026", or "1 – 2 Dec 2026" / "30 Nov – 2 Dec 2026" / "30 Dec 2026 – 2 Jan 2027" across days. */
export function printDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end <= start || dayKey(start) === dayKey(end)) return formatDate(start);
  const d = (x: Date) => part(x, { day: "numeric" });
  const m = (x: Date) => part(x, { month: "short" });
  const y = (x: Date) => part(x, { year: "numeric" });
  if (y(start) !== y(end)) return `${d(start)} ${m(start)} ${y(start)} – ${d(end)} ${m(end)} ${y(end)}`;
  if (m(start) !== m(end)) return `${d(start)} ${m(start)} – ${d(end)} ${m(end)} ${y(end)}`;
  return `${d(start)} – ${d(end)} ${m(end)} ${y(end)}`;
}

/** The big name on the ticket: the session for a one-session ticket, the ticket for a combo, else the event. */
export function scopeHeadline(event: { name: string }, type: { name: string } | null | undefined, scope: PrintScope): string {
  if (scope.kind === "session") return scope.sessions[0].name;
  if (scope.kind === "sessions") return type?.name ?? event.name;
  return event.name;
}

/** D-080: the emoji on a ticket's card (the session's kind for a one-session ticket). */
export function scopeEmoji(scope: PrintScope): string {
  return { event: "🎫", session: kindEmoji(scope.sessions[0]?.kind ?? ""), sessions: "🎫", pass: "🎟", entry: "🚪" }[scope.kind];
}

/** "Wed, 2 Dec 2026 · 8:00 PM · Main Lawn" from a ticket's printed values. */
export function scopeWhen(values: PlaceholderValues): string {
  return [values.date, values.time, values.venue].filter(Boolean).join(" · ");
}

/** D-080: festival ticket groups, in the order of the festival page (D-070). */
export const SCOPE_GROUPS: { key: string; title: string; hint: string; scopes: PrintScopeKind[] }[] = [
  { key: "single", title: "🎫 Tickets for one event", hint: "Prints that event's name, time and place.", scopes: ["session", "sessions"] },
  { key: "passes", title: "🎟 Festival passes", hint: "Prints the festival's name and dates.", scopes: ["pass"] },
  { key: "entry", title: "🚪 Entry tickets", hint: "Entry to the festival, no session.", scopes: ["entry", "event"] },
];

/**
 * The values for {{event_name}}, {{date}}, {{logo}} … of one ticket type (Pakistan time).
 * D-079: inside a festival a ticket shows what it gets you in – a session ticket prints the
 * session's name, time, venue and poster with "AUREX PRESENTS" above it; a pass prints the
 * festival with its dates.
 */
export function printValues(
  event: { name: string; venue: string; starts_at: string; ends_at?: string; poster_url?: string | null },
  org: { name: string; logo_url?: string | null },
  ticketType?: { name: string; price_paisa: number } | null,
  scope: PrintScope = { kind: "event", sessions: [] },
): PlaceholderValues {
  const festival = scope.kind !== "event";
  const first = scope.sessions[0];
  const last = scope.sessions[scope.sessions.length - 1];
  const eventEnd = event.ends_at ?? event.starts_at;

  // When it starts (the big date) and the day range printed in {{date}}
  let startIso = event.starts_at;
  let date = formatDate(new Date(event.starts_at));
  if (scope.kind === "session") {
    startIso = first.starts_at;
    date = formatDate(new Date(first.starts_at));
  } else if (scope.kind === "sessions") {
    startIso = first.starts_at;
    date = printDateRange(first.starts_at, last.starts_at);
  } else if (scope.kind === "pass" || scope.kind === "entry") {
    // a pass is good for every day: "From 9:00 PM" (its first session) reads better than the
    // festival's "12:00 AM"; an entry ticket opens with the festival's first session
    const opens = first ?? scope.festivalSessions?.[0];
    startIso = opens?.starts_at ?? event.starts_at;
    date = printDateRange(event.starts_at, eventEnd);
  }
  const start = new Date(startIso);
  let time = formatTime(start);
  if (scope.kind === "pass" || scope.kind === "entry") {
    if (startIso !== event.starts_at) time = `From ${time}`;
    else if (time === "12:00 AM") time = "All day";
  }

  let venue = event.venue;
  if (scope.kind === "session") venue = first.venue?.trim() || event.venue;
  else if (scope.kind === "sessions") {
    const venues = new Set(scope.sessions.map((s) => s.venue?.trim() || event.venue));
    if (venues.size === 1) venue = [...venues][0];
  }

  const presents = {
    event: "",
    session: `${event.name} presents`.toUpperCase(),
    sessions: `${event.name} presents`.toUpperCase(),
    pass: "FESTIVAL PASS",
    entry: "ENTRY TICKET",
  }[scope.kind];

  return {
    event_name: scopeHeadline(event, ticketType, scope),
    presents,
    festival: festival ? event.name : "",
    includes: scope.kind === "sessions" ? scope.sessions.map((s) => s.name).join(", ") : "",
    society: org.name,
    date,
    day: part(start, { day: "numeric" }),
    month: part(start, { month: "short" }).toUpperCase(),
    weekday: part(start, { weekday: "short" }).toUpperCase(),
    year: part(start, { year: "numeric" }),
    time,
    venue,
    ticket_type: ticketType?.name ?? "General",
    price: ticketType ? formatPKR(ticketType.price_paisa, { freeLabel: "FREE" }) : "Rs 0",
    poster: (scope.kind === "session" ? first.poster_url : null) ?? event.poster_url ?? undefined,
    logo: org.logo_url ?? undefined,
  };
}

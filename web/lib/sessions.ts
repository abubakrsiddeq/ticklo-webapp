/**
 * Festival sessions (D-044). Pure helpers shared by the schedule page, the
 * booking widget, team registration and the organizer screens.
 */
import { PKT_TIME_ZONE, formatPKR } from "./format";

export const SESSION_KINDS = [
  { key: "workshop", label: "Workshop", emoji: "🛠" },
  { key: "competition", label: "Competition", emoji: "🏆" },
  { key: "concert", label: "Concert / night", emoji: "🎤" },
  { key: "talk", label: "Talk / panel", emoji: "🎙" },
  { key: "other", label: "Other", emoji: "📌" },
] as const;
export type SessionKind = (typeof SESSION_KINDS)[number]["key"];
export const kindLabel = (k: string) => SESSION_KINDS.find((x) => x.key === k)?.label ?? "Session";
export const kindEmoji = (k: string) => SESSION_KINDS.find((x) => x.key === k)?.emoji ?? "📌";

export const QUESTION_TYPES = [
  { key: "text", label: "Short answer" },
  { key: "long_text", label: "Long answer" },
  { key: "number", label: "Number" },
  { key: "select", label: "Choose one" },
  { key: "yes_no", label: "Yes / No" },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]["key"];

export interface Question {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  required: boolean;
}

export const asQuestions = (v: unknown): Question[] => (Array.isArray(v) ? (v as Question[]) : []);

/** Show an answer the way people typed/chose it ("yes" → "Yes"). */
export function answerText(q: Question, value: string | undefined | null): string {
  if (!value) return "";
  if (q.type === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : value;
  return value;
}

/** Local check before sending (the database checks again). Returns question id → message. */
export function checkAnswers(questions: Question[], answers: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = (answers[q.id] ?? "").trim();
    if (!v) {
      if (q.required) errors[q.id] = "Required";
      continue;
    }
    if (q.type === "number" && !/^-?\d{1,12}(\.\d{1,4})?$/.test(v)) errors[q.id] = "Enter a number";
    if (q.type === "select" && !q.options.includes(v)) errors[q.id] = "Choose one";
    if (q.type === "yes_no" && v !== "yes" && v !== "no") errors[q.id] = "Choose yes or no";
  }
  return errors;
}

export interface TimeRange {
  starts_at: string;
  ends_at: string;
}

export const overlaps = (a: TimeRange, b: TimeRange) =>
  new Date(a.starts_at).getTime() < new Date(b.ends_at).getTime() && new Date(b.starts_at).getTime() < new Date(a.ends_at).getTime();

/** Pairs of sessions that run at the same time (for "these clash" warnings). */
export function clashes<T extends TimeRange & { id: string; name: string }>(sessions: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) if (overlaps(sessions[i], sessions[j])) out.push([sessions[i], sessions[j]]);
  return out;
}

/** "2026-12-14" in Pakistan time – the day a session belongs to. */
export function pktDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PKT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Sessions grouped by PKT day, in time order: [{ day, label: "Day 1 · Sat 14 Dec", sessions }]. */
export function groupByDay<T extends { starts_at: string }>(sessions: T[]): { day: string; label: string; sessions: T[] }[] {
  const sorted = [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const days = new Map<string, T[]>();
  for (const s of sorted) {
    const d = pktDay(s.starts_at);
    days.set(d, [...(days.get(d) ?? []), s]);
  }
  const fmt = new Intl.DateTimeFormat("en-PK", { timeZone: PKT_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
  return [...days.entries()].map(([day, list], i) => ({
    day,
    label: `${days.size > 1 ? `Day ${i + 1} · ` : ""}${fmt.format(new Date(list[0].starts_at))}`,
    sessions: list,
  }));
}

/** "Rs 1,500 per team" / "Rs 500 per member" / "Free" */
export function feeLabel(feePaisa: number | null | undefined, mode: string | null | undefined): string {
  if (!feePaisa) return "Free";
  return `${formatPKR(feePaisa)} per ${mode === "per_member" ? "member" : "team"}`;
}

/** "Teams of 2–3" / "Teams of 4" / "Individual" */
export function teamSizeLabel(min: number, max: number): string {
  if (max <= 1) return "Individual";
  return min === max ? `Teams of ${max}` : `Teams of ${min}–${max}`;
}

export const TEAM_SIZE_LIMIT = 20;

/** D-064: member details an organizer can require for a competition. */
export const MEMBER_FIELDS = [
  { key: "phone", label: "Mobile number" },
  { key: "email", label: "Email" },
  { key: "roll_no", label: "Roll / student ID" },
  { key: "university", label: "University" },
] as const;
export type MemberField = (typeof MEMBER_FIELDS)[number]["key"];
export type Participation = "individual" | "team";

/** Competition: individuals (1 per entry) or teams of min–max members. */
export function participationOf(teamMax: number | null | undefined): Participation {
  return (teamMax ?? 1) > 1 ? "team" : "individual";
}

/**
 * Check what the organizer typed for who can take part. Individuals → 1/1.
 * Teams → whole numbers, 1 ≤ min ≤ max ≤ 20 and max at least 2.
 */
export function parseTeamSize(
  participation: string,
  minRaw: string,
  maxRaw: string,
): { ok: true; team_min: number; team_max: number } | { ok: false; errors: Record<string, string> } {
  if (participation !== "team") return { ok: true, team_min: 1, team_max: 1 };
  const errors: Record<string, string> = {};
  const min = /^\d{1,2}$/.test(minRaw.trim()) ? Number(minRaw.trim()) : NaN;
  const max = /^\d{1,2}$/.test(maxRaw.trim()) ? Number(maxRaw.trim()) : NaN;
  if (!Number.isInteger(min) || min < 1 || min > TEAM_SIZE_LIMIT) errors.team_min = `A number from 1 to ${TEAM_SIZE_LIMIT}`;
  if (!Number.isInteger(max) || max < 2 || max > TEAM_SIZE_LIMIT) errors.team_max = `A number from 2 to ${TEAM_SIZE_LIMIT}`;
  if (!errors.team_min && !errors.team_max && min > max) errors.team_max = "Must be at least the minimum";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, team_min: min, team_max: max };
}

/** Seats text for a session card. */
export function seatsLabel(s: { kind: string; capacity: number | null; remaining: number | null; team_max?: number | null }): string | null {
  if (s.capacity === null || s.remaining === null) return null;
  // Individual competitions say "places"; teams (or unknown size) say "team places"
  const competitionUnit = s.team_max != null && s.team_max <= 1 ? ["place", "places"] : ["team place", "team places"];
  const unit = s.kind === "competition" ? competitionUnit[s.remaining === 1 ? 0 : 1] : s.remaining === 1 ? "seat" : "seats";
  if (s.remaining <= 0) return s.kind === "competition" ? "Full" : "Sold out";
  return `${s.remaining} ${unit} left`;
}

export interface TeamMember {
  name: string;
  phone?: string;
  email?: string;
  roll_no?: string;
  university?: string;
}

/** FES-15 (D-045): asked first when creating an event – guides the next steps. */
export const EVENT_FORMATS = [
  {
    key: "single",
    label: "Single event",
    emoji: "🎟",
    hint: "One show with one entry – a concert, qawwali night, seminar, dinner or trip.",
    example: "e.g. Winter Gala, Qawwali Night",
  },
  {
    key: "festival",
    label: "Festival – many sessions",
    emoji: "🎪",
    hint: "Workshops, competitions, talks and nights inside one event, with passes and separate tickets.",
    example: "e.g. Aurex, tech fest, sports week",
  },
  {
    key: "competition",
    label: "Competition / registration",
    emoji: "🏆",
    hint: "Teams or individuals register (and pay an entry fee), with optional shortlisting and results.",
    example: "e.g. hackathon, MUN, futsal tournament",
  },
] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number]["key"];
/** D-062: a festival has no festival-wide seat limit (sessions have their own), so it is stored at the max. */
export const FESTIVAL_CAPACITY = 100000;
/** D-062: per-order limit used for festivals (not asked on the form). */
export const FESTIVAL_MAX_PER_ORDER = 10;

export const asEventFormat = (v: string | null | undefined): EventFormat => (v === "festival" || v === "competition" ? v : "single");

/**
 * D-064: when a ticket type stops selling when it has no "sale ends" (mirrors
 * ticket_type_default_sale_end in Postgres). Festivals: until its session starts
 * (passes: the last pass session), else when the event starts.
 */
export function ticketSaleEnd(
  format: string | null | undefined,
  t: { sale_ends_at: string | null; all_sessions: boolean; session_ids: string[] },
  sessions: { id: string; starts_at: string; pass_access: boolean }[],
  event: { starts_at: string; ends_at: string },
): string {
  if (t.sale_ends_at) return t.sale_ends_at;
  if (format !== "festival") return event.starts_at;
  const relevant = t.all_sessions ? sessions.filter((s) => s.pass_access) : sessions.filter((s) => t.session_ids.includes(s.id));
  if (!relevant.length) return event.ends_at;
  return relevant.reduce((latest, s) => (s.starts_at > latest ? s.starts_at : latest), relevant[0].starts_at);
}

export type CompetitionState = "open" | "full" | "closed" | "not_open";

/** D-064: one rule for the schedule card, the sidebar card and the register page. */
export function competitionState(
  s: { capacity: number | null; remaining: number | null; needs_approval: boolean; registration_ends_at: string | null; starts_at: string; registration_type_id?: string | null },
  now: number,
  eventOpen: boolean,
): CompetitionState {
  if (!eventOpen || s.registration_type_id === null) return "not_open";
  const closesAt = new Date(s.registration_ends_at ?? s.starts_at).getTime();
  if (now >= closesAt) return "closed";
  // with shortlisting people may still apply when places are taken (someone may not pay)
  if (!s.needs_approval && s.capacity !== null && s.remaining !== null && s.remaining <= 0) return "full";
  return "open";
}

export function competitionCta(s: { needs_approval: boolean; team_max: number }): string {
  if (s.needs_approval) return "Apply";
  return participationOf(s.team_max) === "team" ? "Register team" : "Register";
}

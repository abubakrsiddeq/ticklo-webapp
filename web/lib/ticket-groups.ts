// D-087: festival tickets set up next to their session, and grouped the way buyers see them.
// Pure helpers shared by the Schedule tab, the Tickets tab and their tests.

export interface EditorTicketType {
  id: string;
  name: string;
  description: string | null;
  price_paisa: number;
  quantity: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  requires_student_card: boolean;
  early_price_paisa?: number | null;
  early_until?: string | null;
  booked: boolean; // has non-expired orders or printed tickets → price & card locked (ORG-07)
  taken: number; // sold + held
  // D-044: what the ticket opens
  all_sessions: boolean;
  session_ids: string[];
  registration_for: string | null; // competition name when this is a team entry fee
}

export type TicketGroupKey = "pass" | "session" | "entry" | "team";

export const TICKET_GROUPS: { key: TicketGroupKey; emoji: string; title: string; hint: string }[] = [
  { key: "pass", emoji: "🎟", title: "Festival passes", hint: "Main entry + every session included in passes." },
  { key: "session", emoji: "🎫", title: "Tickets for one event", hint: "Open only the sessions they name, e.g. a DJ night or a workshop." },
  { key: "entry", emoji: "🚪", title: "Entry tickets", hint: "Main entry only, no session." },
  { key: "team", emoji: "🏆", title: "Competition entries", hint: "Made by each competition's form on the Schedule tab." },
];

export function ticketGroupOf(t: Pick<EditorTicketType, "all_sessions" | "session_ids" | "registration_for">): TicketGroupKey {
  if (t.registration_for) return "team";
  if (t.all_sessions) return "pass";
  return t.session_ids.length ? "session" : "entry";
}

/** Ticket types in buyer order: passes, then tickets for one event (by the session's start), entry, team entries. */
export function groupTicketTypes<T extends Pick<EditorTicketType, "all_sessions" | "session_ids" | "registration_for">>(
  types: T[],
  sessionOrder: string[] = [],
): { key: TicketGroupKey; emoji: string; title: string; hint: string; types: T[] }[] {
  const pos = (t: T) => Math.min(...t.session_ids.map((id) => (sessionOrder.indexOf(id) < 0 ? 1e6 : sessionOrder.indexOf(id))), 1e6);
  return TICKET_GROUPS.map((g) => {
    const list = types.filter((t) => ticketGroupOf(t) === g.key);
    if (g.key === "session") list.sort((a, b) => pos(a) - pos(b));
    return { ...g, types: list };
  }).filter((g) => g.types.length > 0);
}

/**
 * The tickets that open a session (not passes, not team entries). `own` is the one the session
 * form can edit in place: the only such ticket, and it opens this session alone.
 */
export function sessionTickets<T extends Pick<EditorTicketType, "all_sessions" | "session_ids" | "registration_for">>(
  sessionId: string,
  types: T[],
): { own: T | null; all: T[] } {
  const all = types.filter((t) => !t.registration_for && !t.all_sessions && t.session_ids.includes(sessionId));
  const own = all.length === 1 && all[0].session_ids.length === 1 ? all[0] : null;
  return { own, all };
}

/** The name a ticket for one session starts with. */
export function defaultSessionTicketName(sessionName: string): string {
  const name = sessionName.trim();
  if (!name) return "";
  const full = /ticket$/i.test(name) ? name : `${name} ticket`;
  return full.slice(0, 80);
}

/** What the tickets tab is called, by kind of event. */
export function ticketsTabLabel(format: string | null | undefined): string {
  return format === "festival" ? "Passes & tickets" : "Tickets";
}

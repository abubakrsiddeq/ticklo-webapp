import type { PrintScope } from "./values";

/**
 * D-081: which printed-ticket design category fits an event or session. Organizers say it once
 * in the session dialog ("What kind of night?"); otherwise it is guessed from the name.
 * Keys are the template categories of lib/print/templates.ts.
 */

/** "What kind of night?" (Concert / night sessions). */
export const NIGHT_STYLES = [
  { key: "qawwali", label: "Qawwali / Sufi night" },
  { key: "mushaira", label: "Mushaira / Poetry" },
  { key: "concert", label: "Concert / live music" },
  { key: "dj-night", label: "DJ night / party" },
  { key: "gala", label: "Gala / Dinner" },
  { key: "theatre", label: "Theatre / Comedy" },
  { key: "graduation", label: "Convocation / Farewell" },
] as const;

/** "What kind of event?" ("Other" sessions). */
export const OTHER_STYLES = [
  { key: "sports", label: "Sports / match" },
  { key: "exhibition", label: "Exhibition / Expo" },
  { key: "trip", label: "Trip / Tour" },
  { key: "auto-show", label: "Auto show" },
  { key: "festival", label: "Mela / Fun fair" },
  { key: "theatre", label: "Theatre / Comedy" },
  { key: "gala", label: "Gala / Dinner" },
  { key: "general", label: "Something else" },
] as const;

export const SESSION_STYLE_KEYS: readonly string[] = [...new Set([...NIGHT_STYLES, ...OTHER_STYLES].map((s) => s.key))];

/** The style choices of a session kind (none for workshops, competitions and talks). */
export function stylesForKind(kind: string): readonly { key: string; label: string }[] {
  if (kind === "concert") return NIGHT_STYLES;
  if (kind === "other") return OTHER_STYLES;
  return [];
}

// Order matters: the first match wins ("Sufi music concert" is a qawwali night).
const GUESSES: [string, RegExp][] = [
  ["qawwali", /qaw+w?al|qaw+al|sufi|\bsama\b|mehfil.?e.?sama|قوالی|صوفی/i],
  ["mushaira", /musha.?ira|poetry|poet|sukhan|ghazal|sha.?yari|shair|مشاعرہ|شاعری/i],
  ["dj-night", /\bdj\b|rave|\bedm\b|party|neon|club night|techno/i],
  ["graduation", /convocation|graduat|farewell|alumni|welcome party|freshers/i],
  ["gala", /\bgala\b|dinner|\bball\b|awards?\b|banquet|iftar/i],
  ["workshop", /workshop|masterclass|bootcamp|training|hands.?on|crash course/i],
  ["competition", /competition|hackathon|quiz|debate|contest|olympiad|declamation|\bmun\b|coding|speed programming/i],
  ["sports", /sport|cricket|futsal|football|basketball|volleyball|badminton|tournament|\bmatch\b|marathon|\brace\b|athletic/i],
  ["exhibition", /exhibit|\bexpo\b|art show|showcase|gallery|open house|career fair|job fair/i],
  ["theatre", /theat|drama|comedy|stand.?up|\bplay\b|improv|skit/i],
  ["trip", /\btrip\b|\btour\b|hike|hiking|excursion|picnic|visit/i],
  ["auto-show", /auto show|car show|motor|rally|drag|supercar|bike show/i],
  ["conference", /conference|seminar|summit|\btalk|panel|symposium|keynote|session with|ted/i],
  ["concert", /concert|music|\bband\b|\blive\b|unplugged|acoustic|singer|musical/i],
  ["festival", /festival|\bmela\b|\bfest\b|carnival|fun fair|food fair|culture day/i],
];

/** A category from a name, or null when nothing fits. */
export function guessCategory(name: string): string | null {
  for (const [key, re] of GUESSES) if (re.test(name)) return key;
  return null;
}

/** The style a new session starts with (from its name), only when it is one of the kind's choices. */
export function guessStyle(kind: string, name: string): string | null {
  const choices = stylesForKind(kind);
  const guess = guessCategory(name);
  return guess && choices.some((c) => c.key === guess) ? guess : null;
}

const KIND_CATEGORY: Record<string, string> = { workshop: "workshop", competition: "competition", talk: "conference", concert: "concert" };

/** The category of one session: the organizer's choice, else the name, else its kind. */
export function sessionCategory(s: { kind: string; name: string; style?: string | null }): string | null {
  if (s.style) return s.style;
  // workshops, competitions and talks have one design category each
  if (!stylesForKind(s.kind).length) return KIND_CATEGORY[s.kind] ?? guessCategory(s.name);
  return guessStyle(s.kind, s.name) ?? KIND_CATEGORY[s.kind] ?? guessCategory(s.name);
}

/** Which designs to show first for a ticket (D-081). */
export function suggestedCategory(format: string | null | undefined, eventName: string, scope: PrintScope): string | null {
  if (scope.kind === "session" || scope.kind === "sessions") return sessionCategory(scope.sessions[0]);
  if (scope.kind === "pass" || scope.kind === "entry") return "festival";
  if (format === "competition") return "competition";
  return guessCategory(eventName);
}

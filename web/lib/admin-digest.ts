// Pure helpers for the admin emails (D-088). No server imports, so unit tests can use them.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PKT_OFFSET = 5 * HOUR; // Pakistan has no daylight saving

/** Midnight in Pakistan for the day `now` falls on, as a UTC Date. */
export function startOfPktDay(now: Date): Date {
  return new Date(Math.floor((now.getTime() + PKT_OFFSET) / DAY) * DAY - PKT_OFFSET);
}

/** "3 h", "2 days" since `since`. Under an hour reads "just now". */
export function waitingLabel(since: string | Date, now: Date): string {
  const hours = Math.floor((now.getTime() - new Date(since).getTime()) / HOUR);
  if (hours < 1) return "just now";
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

/** A request is overdue when it has waited longer than 24 hours. */
export function isOverdue(since: string | Date, now: Date): boolean {
  return now.getTime() - new Date(since).getTime() > DAY;
}

/** Whole days until `startsAt` (rounded up), or null when it is more than `within` days away or past. */
export function daysUntil(startsAt: string | Date, now: Date, within = 3): number | null {
  const ms = new Date(startsAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / DAY);
  return days <= within ? days : null;
}

export interface DigestCounts {
  /** Requests waiting for an admin decision (societies, events, universities). */
  waiting: number;
  /** Other things to look at (disputes, duplicate proofs, deletion requests, failed emails). */
  attention: number;
}

/** Nothing to act on: the digest is not sent at all, so it never trains people to ignore it. */
export const digestIsEmpty = (c: DigestCounts) => c.waiting === 0 && c.attention === 0;

export function digestSubject(c: DigestCounts): string {
  const parts: string[] = [];
  if (c.waiting) parts.push(`${c.waiting} waiting`);
  if (c.attention) parts.push(`${c.attention} need${c.attention === 1 ? "s" : ""} attention`);
  return `TickLO daily: ${parts.join(", ")}`;
}

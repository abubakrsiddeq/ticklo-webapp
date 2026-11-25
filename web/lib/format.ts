// Money and time formatting. Stored values: paisa (integer) and UTC
// timestamps. Shown values: "Rs 1,500" and Pakistan time (NFR-08, NFR-09).

export const PKT_TIME_ZONE = "Asia/Karachi";
const PKT_OFFSET = "+05:00"; // Pakistan has no daylight saving time

/** 150000 paisa -> "Rs 1,500"; 0 -> "Free" when freeLabel is set. */
export function formatPKR(paisa: number | bigint | null | undefined, opts: { freeLabel?: string } = {}): string {
  const value = Number(paisa ?? 0);
  if (value === 0 && opts.freeLabel) return opts.freeLabel;
  const rupees = value / 100;
  const hasFraction = Math.round(rupees * 100) % 100 !== 0;
  return `Rs ${rupees.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** "1500" or "1,500" (rupees, as typed by an organizer) -> 150000 paisa. */
export function rupeesToPaisa(input: string | number): number {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function paisaToRupeesInput(paisa: number): string {
  const r = paisa / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

type DateInput = string | number | Date;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

function fmt(d: DateInput, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-PK", { timeZone: PKT_TIME_ZONE, ...options }).format(toDate(d));
}

/** "Sat, 14 Dec 2026" */
export const formatDate = (d: DateInput) =>
  fmt(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "6:00 PM" */
export const formatTime = (d: DateInput) =>
  fmt(d, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?(am|pm)$/i, (m) => m.toUpperCase());

/** "Sat, 14 Dec 2026, 6:00 PM" */
export const formatDateTime = (d: DateInput) => `${formatDate(d)}, ${formatTime(d)}`;

/** "14 Dec, 6:00 PM" (compact, for tables) */
export const formatShortDateTime = (d: DateInput) =>
  `${fmt(d, { day: "numeric", month: "short" })}, ${formatTime(d)}`;

/** Event range: "Sat, 14 Dec 2026 · 6:00 PM – 11:00 PM PKT" */
export function formatEventRange(start: DateInput, end: DateInput): string {
  const sameDay = formatDate(start) === formatDate(end);
  return sameDay
    ? `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)} PKT`
    : `${formatDateTime(start)} – ${formatDateTime(end)} PKT`;
}

/** UTC timestamp -> value for <input type="datetime-local"> in PKT ("2026-12-14T18:00"). */
export function toPKTInputValue(d: DateInput | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(toDate(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** "2026-12-14T18:00" typed in PKT -> ISO UTC string, or null if empty/invalid. */
export function fromPKTInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const d = new Date(`${withSeconds}${PKT_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Seconds -> "59:07" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

import { PKT_TIME_ZONE, formatDate, formatPKR, formatTime } from "@/lib/format";
import type { PlaceholderValues } from "./design";

const part = (d: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: PKT_TIME_ZONE, ...options }).format(d);

/** The values for {{event_name}}, {{date}} … of one event + ticket type (Pakistan time). */
export function printValues(
  event: { name: string; venue: string; starts_at: string; poster_url?: string | null },
  orgName: string,
  ticketType?: { name: string; price_paisa: number } | null,
): PlaceholderValues {
  const start = new Date(event.starts_at);
  return {
    event_name: event.name,
    society: orgName,
    date: formatDate(start),
    day: part(start, { day: "numeric" }),
    month: part(start, { month: "short" }).toUpperCase(),
    weekday: part(start, { weekday: "short" }).toUpperCase(),
    year: part(start, { year: "numeric" }),
    time: formatTime(start),
    venue: event.venue,
    ticket_type: ticketType?.name ?? "General",
    price: ticketType ? formatPKR(ticketType.price_paisa, { freeLabel: "FREE" }) : "Rs 0",
    poster: event.poster_url ?? undefined,
  };
}

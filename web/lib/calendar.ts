// EVT-08: "Add to Google Calendar" link
const gcalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: { name: string; starts_at: string; ends_at: string; venue: string; url: string; details?: string | null }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${gcalDate(e.starts_at)}/${gcalDate(e.ends_at)}`,
    location: e.venue,
    details: `${e.details ? e.details.slice(0, 500) + "\n\n" : ""}Tickets: ${e.url}`,
    ctz: "Asia/Karachi",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

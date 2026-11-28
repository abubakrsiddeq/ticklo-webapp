import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { NavTabs } from "@/components/nav-tabs";
import { Pill, StatusBadge } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { formatEventRange } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ticketsTabLabel } from "@/lib/ticket-groups";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ society: string; event: string }>;
}) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}`);
  const base = `/org/${org.slug}/events/${event.slug}`;
  // FES-15: the Schedule tab is for festivals and competitions (or any event that already has sessions)
  let showSchedule = event.format !== "single";
  if (!showSchedule) {
    const supabase = await createClient();
    const { count } = await supabase.from("event_sessions").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    showSchedule = (count ?? 0) > 0;
  }
  return (
    <div>
      <div className="mb-3 flex flex-col gap-1">
        <Link href={`/org/${org.slug}`} className="no-print text-sm text-muted-foreground hover:underline">
          ← All events &amp; festivals
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl font-bold text-navy">{event.name}</h2>
          {/* D-067 */}
          {event.format === "festival" ? <Pill tone="success">🎪 Festival</Pill> : event.format === "competition" ? <Pill tone="success">🏆 Competition</Pill> : null}
          <StatusBadge status={event.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatEventRange(event.starts_at, event.ends_at)} · {event.venue}
        </p>
        <Link href={`/e/${org.slug}/${event.slug}`} className="no-print inline-flex items-center gap-1 text-sm text-brand-strong hover:underline">
          {event.status === "published" || event.status === "cancelled" ? "View public page" : "Preview page"} <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
      <NavTabs
        exact={[base]}
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/payments`, label: "Payments" },
          // D-087: details and tickets are separate tabs (festivals: Details → Schedule → Passes & tickets)
          { href: `${base}/details`, label: "Details" },
          ...(showSchedule ? [{ href: `${base}/schedule`, label: event.format === "competition" ? "Competition" : "Schedule" }] : []),
          { href: `${base}/edit`, label: ticketsTabLabel(event.format) },
          { href: `${base}/attendees`, label: "Attendees" },
          { href: `${base}/print`, label: "Printed tickets" },
          { href: `${base}/ambassadors`, label: "Ambassadors" },
          { href: `${base}/report`, label: "Report" },
          { href: `${base}/history`, label: "History" },
        ]}
      />
      {children}
    </div>
  );
}

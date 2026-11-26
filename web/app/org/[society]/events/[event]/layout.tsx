import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { NavTabs } from "@/components/nav-tabs";
import { StatusBadge } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { formatEventRange } from "@/lib/format";

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
  return (
    <div>
      <div className="mb-3 flex flex-col gap-1">
        <Link href={`/org/${org.slug}`} className="no-print text-sm text-muted-foreground hover:underline">
          ← All events
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-2xl font-bold text-navy">{event.name}</h2>
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
          { href: `${base}/schedule`, label: "Schedule" },
          { href: `${base}/attendees`, label: "Attendees" },
          { href: `${base}/print`, label: "Printed tickets" },
          { href: `${base}/ambassadors`, label: "Ambassadors" },
          { href: `${base}/edit`, label: "Edit & tickets" },
          { href: `${base}/report`, label: "Report" },
        ]}
      />
      {children}
    </div>
  );
}

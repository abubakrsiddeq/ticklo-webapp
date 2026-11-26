import Link from "next/link";
import { CalendarPlus, ChevronRight, Hourglass } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, Pill } from "@/components/status-badge";
import { requireOrgStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";
import { serverNow } from "@/lib/time";

export default async function OrgDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society } = await params;
  const sp = await searchParams;
  const { org } = await requireOrgStaff(society, `/org/${society}`);
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, slug, name, status, starts_at, ends_at, capacity, visibility")
    .eq("org_id", org.id)
    .order("starts_at", { ascending: false });
  const ids = (events ?? []).map((e) => e.id);

  const [{ data: reviews }, { data: tickets }] = ids.length
    ? await Promise.all([
        supabase.from("orders").select("event_id").in("event_id", ids).eq("status", "under_review"),
        supabase.from("tickets").select("event_id, status").in("event_id", ids).in("status", ["valid", "checked_in"]),
      ])
    : [{ data: [] }, { data: [] }];

  const pendingByEvent = new Map<string, number>();
  for (const r of reviews ?? []) pendingByEvent.set(r.event_id, (pendingByEvent.get(r.event_id) ?? 0) + 1);
  const soldByEvent = new Map<string, number>();
  for (const t of tickets ?? []) soldByEvent.set(t.event_id, (soldByEvent.get(t.event_id) ?? 0) + 1);
  const totalPending = reviews?.length ?? 0;
  const now = serverNow();

  return (
    <div className="grid gap-6">
      {sp.created ? (
        <Alert>
          <AlertDescription>Society registered! TickLO will review it soon – we&apos;ll email you.</AlertDescription>
        </Alert>
      ) : null}
      {sp.joined ? (
        <Alert>
          <AlertDescription>Welcome to the team!</AlertDescription>
        </Alert>
      ) : null}

      {/* PAY-14: "Review baqi" count */}
      {totalPending > 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-blue-900 ring-1 ring-blue-200">
          <Hourglass className="size-6 shrink-0" aria-hidden />
          <p className="font-medium">
            {totalPending} payment{totalPending === 1 ? "" : "s"} waiting for your review
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-navy">Events</h2>
        <Button asChild variant="brand">
          <Link href={`/org/${org.slug}/events/new`}>
            <CalendarPlus /> New event
          </Link>
        </Button>
      </div>

      {events?.length ? (
        <ul className="grid gap-3">
          {events.map((e) => {
            const pending = pendingByEvent.get(e.id) ?? 0;
            const sold = soldByEvent.get(e.id) ?? 0;
            const ended = new Date(e.ends_at).getTime() < now;
            return (
              <li key={e.id}>
                <Link
                  href={`/org/${org.slug}/events/${e.slug}`}
                  className="flex flex-col gap-2 rounded-xl border bg-white p-4 hover:bg-secondary/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy">{e.name}</span>
                      <StatusBadge status={e.status} />
                      {ended && e.status === "published" ? <Pill>Ended</Pill> : null}
                      {e.visibility === "link_only" ? <Pill tone="info">Link only</Pill> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(e.starts_at)} · {formatTime(e.starts_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {pending ? <Pill tone="info">{pending} to review</Pill> : null}
                    <span className="tabular-nums text-slate-700">
                      {sold}/{e.capacity} tickets
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create your first event, add ticket types, then submit it for approval."
          action={
            <Button asChild variant="brand">
              <Link href={`/org/${org.slug}/events/new`}>Create an event</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

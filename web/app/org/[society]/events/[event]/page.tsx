import type { Metadata } from "next";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { ActionButton } from "@/components/action-button";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl, eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { formatShortDateTime } from "@/lib/format";
import { kindEmoji } from "@/lib/sessions";
import { submitEvent } from "@/app/org/_actions/events";
import { LiveStats, type EventStats } from "./live-stats";
import { ScannersCard } from "./scanners";
import { CancelEventButton } from "./cancel-event";

export const metadata: Metadata = { title: "Event dashboard" };

export default async function EventDashboardPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event, isOwner } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}`);
  const supabase = await createClient();
  const [{ data: stats }, { data: team }, { data: staff }, { data: sessionStats }] = await Promise.all([
    supabase.rpc("event_stats", { p_event_id: event.id }),
    supabase.rpc("org_team", { p_org_id: org.id }),
    supabase.from("event_staff").select("user_id, expires_at, session_ids").eq("event_id", event.id),
    supabase.rpc("session_stats", { p_event_id: event.id }),
  ]);
  const sessions = sessionStats ?? [];
  const names = new Map((team ?? []).map((t) => [t.user_id, t.full_name ?? t.email ?? "Team member"]));
  const base = `/org/${org.slug}/events/${event.slug}`;
  const publicUrl = absoluteUrl(eventPath(org.slug, event.slug));
  const live = event.status === "published";
  const scanWindowOpen = live && serverNow() <= new Date(event.ends_at).getTime() + 6 * 3600 * 1000;

  return (
    <div className="grid gap-6">
      {event.status === "draft" || event.status === "rejected" ? (
        <Card className="border-brand">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-navy">This event is a {event.status === "draft" ? "draft" : "rejected draft"}. Add ticket types, then submit it.</p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={`${base}/edit`}>Edit & tickets</Link>
              </Button>
              <ActionButton variant="brand" action={submitEvent.bind(null, org.slug, event.id)}>
                Submit for approval
              </ActionButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stats ? <LiveStats eventId={event.id} initial={stats as unknown as EventStats} paymentsHref={`${base}/payments`} /> : null}

      {sessions.length ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>Tickets, seats and check-ins per session (FES-14).</CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}/schedule`}>Schedule</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Session</th>
                  <th className="py-2 pr-3 text-right font-medium">Tickets / teams</th>
                  <th className="py-2 pr-3 text-right font-medium">Seats</th>
                  <th className="py-2 text-right font-medium">Checked in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessions.map((x) => (
                  <tr key={x.session_id}>
                    <td className="py-2 pr-3">
                      <Link href={`/manage/${x.session_id}`} className="font-medium text-navy hover:underline">
                        {kindEmoji(x.kind)} {x.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{formatShortDateTime(x.starts_at)}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {x.kind === "competition" ? `${x.teams_paid} teams${x.teams_pending ? ` (+${x.teams_pending} waiting)` : ""}` : x.tickets}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{x.capacity ? `${x.taken}/${x.capacity}` : "-"}</td>
                    <td className="py-2 text-right tabular-nums">{x.checked_in}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Share</CardTitle>
            <CardDescription>
              {live
                ? event.visibility === "link_only"
                  ? "Link-only event: only people with this link can find it."
                  : "Post this link on WhatsApp and Instagram."
                : "The link works once TickLO approves the event."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary px-3 py-2.5 text-sm">{publicUrl}</code>
            <CopyButton value={publicUrl} label="Event link" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gate scanners</CardTitle>
            <CardDescription>Volunteers scan tickets with their phone browser at /scan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {event.status !== "cancelled" ? (
              <ScannersCard
                orgSlug={org.slug}
                eventId={event.id}
                isOwner={isOwner}
                team={(team ?? []).map((t) => ({ user_id: t.user_id, name: t.full_name ?? t.email ?? "Team member", role: t.role }))}
                assigned={(staff ?? []).map((s) => ({ user_id: s.user_id, name: names.get(s.user_id) ?? "Team member", expires_at: s.expires_at, session_ids: s.session_ids }))}
                sessions={sessions.map((x) => ({ id: x.session_id, name: x.name }))}
              />
            ) : null}
            {scanWindowOpen ? (
              <Button asChild variant="brand">
                <Link href={`/scan/${event.id}`}>
                  <ScanLine /> Open scanner
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {live ? (
        <div className="flex flex-wrap gap-2 border-t pt-6">
          <CancelEventButton orgSlug={org.slug} eventId={event.id} ticketCount={(stats as unknown as EventStats | null)?.total_tickets ?? 0} />
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/status-badge";
import { ActionButton } from "@/components/action-button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { serverNow } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { accountLabel } from "@/lib/payments/accounts";
import { universityLabel } from "@/lib/university-label";
import { DECISION_ACTIONS, decisionReason } from "@/lib/decisions";
import { restoreOrganization, setPaymentAccountActive } from "../../control-actions";
import { DeleteSocietyButton, EditSocietyForm, SuspendSocietyButton } from "../../control-buttons";
import { EventAdminActions, countOf } from "../../event-admin-actions";

export const metadata: Metadata = { title: "Society" };

// D-084: one society – edit, suspend / restore, delete, team, events, payment accounts, history
export default async function AdminSocietyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/societies/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: org }, { data: members }, { data: events }, { data: accounts }, { data: unis }, { data: log }] = await Promise.all([
    supabase.from("organizations").select("*, universities ( name, city )").eq("id", id).maybeSingle(),
    supabase.from("organization_members").select("user_id, role, created_at, profiles ( full_name, email, phone, is_suspended )").eq("org_id", id),
    supabase
      .from("events")
      .select("id, name, slug, status, starts_at, ends_at, sales_paused_at, sales_paused_reason, orders(count), tickets(count), print_batches(count), team_registrations(count)")
      .eq("org_id", id)
      .order("starts_at", { ascending: false }),
    supabase.from("payment_accounts").select("id, kind, bank_name, account_title, account_number, is_active").eq("org_id", id).order("created_at"),
    supabase.from("universities").select("id, name, city").eq("status", "approved").order("name"),
    supabase
      .from("audit_log")
      .select("id, action, actor_id, details, created_at")
      .eq("target_type", "organization")
      .eq("target_id", id)
      .order("id", { ascending: false })
      .limit(40),
  ]);
  if (!org) notFound();

  const actorIds = [...new Set((log ?? []).map((l) => l.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? "Unknown"]));

  const rows = (events ?? []).map((e) => ({
    ...e,
    hasBookings: countOf(e.orders) + countOf(e.tickets) + countOf(e.print_batches) + countOf(e.team_registrations) > 0,
    bookings: countOf(e.orders),
  }));
  const hasSales = rows.some((e) => e.hasBookings);
  const upcoming = rows.filter((e) => e.status === "published" && new Date(e.ends_at).getTime() > serverNow()).length;
  const deleted = Boolean(org.deleted_at);
  const live = !deleted;
  const owner = (members ?? []).find((m) => m.role === "owner");

  return (
    <div className="grid gap-4">
      <Link href="/admin/societies" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy">
        <ArrowLeft className="size-4" aria-hidden /> All societies
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {org.name} {deleted ? <Pill tone="danger">Deleted</Pill> : <StatusBadge status={org.status} />}
          </CardTitle>
          <CardDescription>
            /{org.slug} · {org.type} · {org.universities ? universityLabel(org.universities) : "No university"} · registered {formatShortDateTime(org.created_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {deleted ? (
            <Alert variant="destructive">
              <AlertTitle>Deleted {formatShortDateTime(org.deleted_at!)}</AlertTitle>
              <AlertDescription>
                {org.deleted_reason ? `Reason: ${org.deleted_reason}. ` : ""}Hidden everywhere and its team has no access. Orders and tickets are kept.
              </AlertDescription>
            </Alert>
          ) : null}
          {org.status === "suspended" && !deleted ? (
            <Alert variant="destructive">
              <AlertTitle>Suspended {org.suspended_at ? formatShortDateTime(org.suspended_at) : ""}</AlertTitle>
              <AlertDescription>
                {org.suspended_reason ? `Reason: ${org.suspended_reason}. ` : ""}No sales, no changes. Tickets already sold still work.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {live ? (
              <Button asChild size="sm" variant="brand">
                <Link href={`/org/${org.slug}`}>Open dashboard as owner</Link>
              </Button>
            ) : null}
            {live && org.status === "approved" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/s/${org.slug}`}>Public page</Link>
              </Button>
            ) : null}
            {live && (org.status === "approved" || org.status === "pending") ? <SuspendSocietyButton orgId={org.id} name={org.name} upcoming={upcoming} /> : null}
            {deleted || org.status === "suspended" ? (
              <ActionButton
                size="sm"
                variant="outline"
                action={restoreOrganization.bind(null, org.id)}
                confirm={{
                  title: deleted ? `Bring back ${org.name}?` : `Lift the suspension of ${org.name}?`,
                  description: deleted
                    ? "It shows on TickLO again and its team gets access back. Cancelled events stay cancelled."
                    : "Sales and changes are allowed again. The owner is emailed.",
                  confirmLabel: deleted ? "Bring back" : "Lift suspension",
                }}
              >
                {deleted ? "Bring back" : "Lift suspension"}
              </ActionButton>
            ) : null}
            {live ? <DeleteSocietyButton orgId={org.id} name={org.name} hasSales={hasSales} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            &quot;Open dashboard as owner&quot; lets you change everything the society can: events, tickets, sessions, payments, team, printed tickets.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Society details</CardTitle>
          <CardDescription>Logo, about and social links: open the dashboard → Society profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <EditSocietyForm
            orgId={org.id}
            initial={{ name: org.name, slug: org.slug, universityId: org.university_id ?? "", type: org.type }}
            universities={(unis ?? []).map((u) => ({ id: u.id, label: universityLabel(u) }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({members?.length ?? 0})</CardTitle>
          <CardDescription>Change roles or the owner from each person&apos;s page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(members ?? [])
              .sort((a, b) => ["owner", "member", "scanner"].indexOf(a.role) - ["owner", "member", "scanner"].indexOf(b.role))
              .map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/users/${m.user_id}`} className="font-medium text-navy hover:underline">
                      {m.profiles?.full_name ?? m.profiles?.email ?? "User"}
                    </Link>{" "}
                    {m.profiles?.is_suspended ? <StatusBadge status="suspended" /> : null}
                    <div className="text-xs text-muted-foreground">
                      {m.profiles?.email} · {formatPhone(m.profiles?.phone)}
                    </div>
                  </div>
                  <Pill tone={m.role === "owner" ? "info" : "neutral"}>{m.role}</Pill>
                </li>
              ))}
          </ul>
          {!owner ? <p className="text-sm text-warning">No owner. Make someone the owner from their user page.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events ({rows.length})</CardTitle>
          <CardDescription>Only events nobody booked can be unpublished or deleted. Others can be paused or cancelled.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {rows.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-navy">{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDateTime(e.starts_at)} · {e.bookings} order{e.bookings === 1 ? "" : "s"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <StatusBadge status={e.status} />
                  {e.sales_paused_at ? <Pill tone="warning">Sales paused{e.sales_paused_reason ? `: ${e.sales_paused_reason}` : ""}</Pill> : null}
                </div>
              </div>
              <EventAdminActions event={e} orgSlug={org.slug} orgLive={live} />
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment accounts</CardTitle>
          <CardDescription>Turn off an account you do not trust. Students stop seeing it at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(accounts ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-navy">
                    {accountLabel(a)} · {a.account_title}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{a.account_number}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.is_active ? <Pill tone="success">On</Pill> : <Pill>Off</Pill>}
                  <ActionButton size="sm" variant="outline" action={setPaymentAccountActive.bind(null, a.id, !a.is_active)}>
                    {a.is_active ? "Turn off" : "Turn on"}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
          {!accounts?.length ? <p className="text-sm text-muted-foreground">No payment accounts.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm">
            {(log ?? []).map((l) => {
              const reason = decisionReason(l.details as Record<string, unknown>);
              return (
                <li key={l.id}>
                  <span className="font-medium text-navy">{DECISION_ACTIONS[l.action]?.label ?? l.action}</span>{" "}
                  <span className="text-muted-foreground">
                    · {l.actor_id ? (actorName.get(l.actor_id) ?? "Deleted account") : "system"} · {formatShortDateTime(l.created_at)}
                  </span>
                  {reason ? <div className="text-muted-foreground">Reason: {reason}</div> : null}
                </li>
              );
            })}
          </ol>
          {!log?.length ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

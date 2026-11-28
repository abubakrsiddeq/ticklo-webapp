import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { formatPKR } from "@/lib/format";
import { universityLabel } from "@/lib/university-label";
import { ActionButton } from "@/components/action-button";
import { SuspendButton } from "../../suspend-button";
import { sendPasswordReset, signOutUserEverywhere } from "../../control-actions";
import { DeleteUserButton, EditProfileButton } from "../../control-buttons";
import { AddToOrgForm, OrgRoleRow, PlatformAdminToggle } from "./role-controls";

export const metadata: Metadata = { title: "User" };

// ADM-06 + D-037: one user – admin access, society roles, suspend
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAdmin(`/admin/users/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: user }, { data: memberships }, { data: orgs }, { data: orders }, { count: ticketCount }, { data: unis }, { count: proofCount }, { count: disputeCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, university_id, is_admin, is_suspended, suspended_reason, deletion_requested_at, deleted_at, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("organization_members").select("org_id, role, created_at, organizations(name, slug, status, deleted_at)").eq("user_id", id),
    supabase.from("organizations").select("id, name").in("status", ["approved", "pending"]).is("deleted_at", null).order("name"),
    supabase
      .from("orders")
      .select("id, ref_code, status, total_paisa, ticket_count, created_at, refunded_at, events ( name )")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("owner_id", id),
    supabase.from("universities").select("id, name, city").eq("status", "approved").order("name"),
    supabase.from("payment_proofs").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("disputes").select("id", { count: "exact", head: true }).eq("user_id", id),
  ]);
  if (!user) notFound();
  const { count: createdOrgs } = await supabase.from("organizations").select("id", { count: "exact", head: true }).eq("created_by", id);
  const hasRecords = (orders?.length ?? 0) > 0 || (ticketCount ?? 0) > 0 || (proofCount ?? 0) > 0 || (disputeCount ?? 0) > 0 || (createdOrgs ?? 0) > 0;
  const name = user.full_name ?? user.email ?? "this user";
  const isMe = user.id === me.id;
  const memberOf = new Set((memberships ?? []).map((m) => m.org_id));

  return (
    <div className="grid gap-4">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy">
        <ArrowLeft className="size-4" aria-hidden /> All users
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {user.full_name ?? "No name yet"} {user.is_admin ? <Pill tone="info">Admin</Pill> : null}
            {user.is_suspended ? <StatusBadge status="suspended" /> : null}
          </CardTitle>
          <CardDescription>
            {user.email} · {formatPhone(user.phone)} · joined {formatShortDateTime(user.created_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {user.deleted_at ? (
            <p className="text-sm text-destructive">Account deleted {formatShortDateTime(user.deleted_at)}. Personal details were removed; orders are kept.</p>
          ) : null}
          {user.suspended_reason && !user.deleted_at ? <p className="text-sm text-muted-foreground">Suspended: {user.suspended_reason}</p> : null}
          {user.deletion_requested_at ? (
            <p className="text-sm text-warning">Asked to delete their account on {formatShortDateTime(user.deletion_requested_at)}.</p>
          ) : null}
          {isMe ? (
            <p className="text-sm text-muted-foreground">This is you. Another admin has to change your own access.</p>
          ) : user.deleted_at ? null : (
            <div className="flex flex-wrap gap-2">
              <EditProfileButton
                userId={user.id}
                initial={{ fullName: user.full_name ?? "", email: user.email ?? "", phone: formatPhone(user.phone), universityId: user.university_id ?? "" }}
                universities={(unis ?? []).map((u) => ({ id: u.id, label: universityLabel(u) }))}
              />
              <ActionButton
                size="sm"
                variant="outline"
                action={sendPasswordReset.bind(null, user.id)}
                confirm={{ title: "Send a password reset link?", description: `An email goes to ${user.email ?? "their address"} with a link to set a new password.`, confirmLabel: "Send link" }}
              >
                Send password reset
              </ActionButton>
              <ActionButton
                size="sm"
                variant="outline"
                action={signOutUserEverywhere.bind(null, user.id)}
                confirm={{ title: "Sign out of every device?", description: "They have to log in again everywhere (within an hour at most).", confirmLabel: "Sign out" }}
              >
                Sign out everywhere
              </ActionButton>
              <PlatformAdminToggle userId={user.id} isAdmin={user.is_admin} name={name} />
              <SuspendButton userId={user.id} suspended={user.is_suspended} name={name} />
              {!user.is_admin ? <DeleteUserButton userId={user.id} name={name} hasRecords={hasRecords} /> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Society roles</CardTitle>
          <CardDescription>
            <strong>Owner</strong> runs the society (team, payment accounts). <strong>Members</strong> manage events and payments.{" "}
            <strong>Scanners</strong> only scan tickets. Each society has one owner – making someone owner turns the old owner into a member.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {memberships?.length ? (
            <ul className="divide-y">
              {memberships.map((m) => (
                <li key={m.org_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/org/${m.organizations?.slug}`} className="font-medium text-navy hover:underline">
                      {m.organizations?.name ?? "Society"}
                    </Link>
                    {m.organizations?.deleted_at ? (
                      <span className="ml-2">
                        <Pill tone="danger">Society deleted</Pill>
                      </span>
                    ) : m.organizations?.status && m.organizations.status !== "approved" ? (
                      <span className="ml-2">
                        <StatusBadge status={m.organizations.status} />
                      </span>
                    ) : null}
                    <p className="text-xs text-muted-foreground">Since {formatShortDateTime(m.created_at)}</p>
                  </div>
                  <OrgRoleRow orgId={m.org_id} userId={user.id} role={m.role} orgName={m.organizations?.name ?? "this society"} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not in any society.</p>
          )}
          <div className="grid gap-2 border-t pt-4">
            <p className="text-sm font-medium text-navy">Add to a society</p>
            <AddToOrgForm userId={user.id} orgs={(orgs ?? []).filter((o) => !memberOf.has(o.id))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders ({orders?.length ?? 0}{orders?.length === 20 ? "+" : ""})</CardTitle>
          <CardDescription>{ticketCount ?? 0} ticket{ticketCount === 1 ? "" : "s"} in total. Open an order to approve, refund or fix it.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders?.length ? (
            <ul className="divide-y text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-medium text-navy hover:underline">
                      {o.ref_code}
                    </Link>{" "}
                    <span className="text-muted-foreground">· {o.events?.name}</span>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDateTime(o.created_at)} · {o.ticket_count} ticket{o.ticket_count === 1 ? "" : "s"} · {formatPKR(o.total_paisa, { freeLabel: "Free" })}
                    </div>
                  </div>
                  <span className="flex items-center gap-1">
                    <StatusBadge status={o.status} />
                    {o.refunded_at ? <Pill tone="warning">Refunded</Pill> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No orders.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

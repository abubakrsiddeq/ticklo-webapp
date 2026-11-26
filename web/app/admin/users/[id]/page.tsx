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
import { SuspendButton } from "../../suspend-button";
import { AddToOrgForm, OrgRoleRow, PlatformAdminToggle } from "./role-controls";

export const metadata: Metadata = { title: "User" };

// ADM-06 + D-037: one user – admin access, society roles, suspend
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAdmin(`/admin/users/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: user }, { data: memberships }, { data: orgs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, is_admin, is_suspended, suspended_reason, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("organization_members").select("org_id, role, created_at, organizations(name, slug, status)").eq("user_id", id),
    supabase.from("organizations").select("id, name").in("status", ["approved", "pending"]).order("name"),
  ]);
  if (!user) notFound();
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
          {user.suspended_reason ? <p className="text-sm text-muted-foreground">Suspended: {user.suspended_reason}</p> : null}
          {isMe ? (
            <p className="text-sm text-muted-foreground">This is you. Another admin has to change your own access.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <PlatformAdminToggle userId={user.id} isAdmin={user.is_admin} name={name} />
              <SuspendButton userId={user.id} suspended={user.is_suspended} name={name} />
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
                    {m.organizations?.status && m.organizations.status !== "approved" ? (
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
    </div>
  );
}

import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Pill } from "@/components/status-badge";
import { ActionButton } from "@/components/action-button";
import { requireOrgOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { serverNow } from "@/lib/time";
import { revokeInvite } from "@/app/org/_actions/manage";
import { InviteForm } from "./invite-form";
import { MemberRowActions } from "./member-row-actions";

export const metadata: Metadata = { title: "Team" };

// ORG-03: invite members/scanners by email; owner can change roles or remove
export default async function TeamPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org, user } = await requireOrgOwner(society, `/org/${society}/team`);
  const supabase = await createClient();
  const now = serverNow();
  const [{ data: team }, { data: invites }] = await Promise.all([
    supabase.rpc("org_team", { p_org_id: org.id }),
    supabase
      .from("org_invites")
      .select("id, email, role, created_at, expires_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            <strong>Members</strong> can do everything except change the team and payment accounts. <strong>Scanners</strong> can
            only scan tickets for events you assign them to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm orgSlug={org.slug} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team ({team?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(team ?? []).map((m) => (
              <li key={m.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-navy">
                    {m.full_name ?? "No name yet"} {m.user_id === user.id ? <span className="text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                </div>
                {m.role === "owner" ? (
                  <Pill tone="success">Owner</Pill>
                ) : (
                  <MemberRowActions orgSlug={org.slug} userId={m.user_id} name={m.full_name ?? m.email ?? "member"} role={m.role} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {invites?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {invites.map((i) => {
                const expired = new Date(i.expires_at).getTime() < now;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium text-navy">{i.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {i.role} · sent {formatDate(i.created_at)} · expires {formatDate(i.expires_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {expired ? <StatusBadge status="expired" /> : null}
                      <ActionButton variant="ghost" size="sm" action={revokeInvite.bind(null, org.slug, i.id)}>
                        Revoke
                      </ActionButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

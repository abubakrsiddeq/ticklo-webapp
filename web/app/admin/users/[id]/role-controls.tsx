"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { removeOrgMember, setOrgRole, setPlatformAdmin } from "../../actions";

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  member: "Member (core team)",
  scanner: "Scanner (gate volunteer)",
};

/** D-037: turn TickLO admin access on or off. */
export function PlatformAdminToggle({ userId, isAdmin, name }: { userId: string; isAdmin: boolean; name: string }) {
  return (
    <ActionButton
      variant={isAdmin ? "outline" : "default"}
      size="sm"
      className={isAdmin ? "text-destructive" : ""}
      action={setPlatformAdmin.bind(null, userId, !isAdmin)}
      confirm={
        isAdmin
          ? { title: `Remove admin access from ${name}?`, description: "They lose access to the admin panel.", confirmLabel: "Remove admin" }
          : {
              title: `Make ${name} a TickLO admin?`,
              description: "Admins can approve societies and events, see all orders and payment proofs, suspend users and change roles.",
              confirmLabel: "Make admin",
            }
      }
    >
      {isAdmin ? "Remove admin" : "Make admin"}
    </ActionButton>
  );
}

/** D-037: change this user's role in one society, or remove them. */
export function OrgRoleRow({ orgId, userId, role, orgName }: { orgId: string; userId: string; role: string; orgName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isOwner = role === "owner";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={`Role in ${orgName}`}
        className="w-56"
        value={role}
        disabled={pending || isOwner}
        title={isOwner ? "Make someone else the owner to change this" : undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "owner" && !window.confirm(`Make this person the owner of ${orgName}? The current owner becomes a member.`)) return;
          start(async () => {
            const res = await setOrgRole(orgId, userId, next);
            if (res.ok) toast.success(res.message ?? "Updated");
            else toast.error(res.error);
            router.refresh();
          });
        }}
      >
        {Object.entries(ROLE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
      {!isOwner ? (
        <ActionButton
          variant="ghost"
          size="sm"
          className="text-destructive"
          action={removeOrgMember.bind(null, orgId, userId)}
          confirm={{ title: `Remove from ${orgName}?`, description: "They lose access to this society's dashboard and scanner.", confirmLabel: "Remove" }}
        >
          Remove
        </ActionButton>
      ) : null}
    </div>
  );
}

/** D-037: add this user to a society with a role. */
export function AddToOrgForm({ userId, orgs }: { userId: string; orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [orgId, setOrgId] = useState("");
  const [role, setRole] = useState("member");
  if (!orgs.length) return <p className="text-sm text-muted-foreground">This person is already in every society.</p>;
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_220px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!orgId) return toast.error("Choose a society.");
        start(async () => {
          const res = await setOrgRole(orgId, userId, role);
          if (res.ok) {
            toast.success("Added to the society.");
            setOrgId("");
          } else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <NativeSelect aria-label="Society" value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={pending}>
        <option value="">Choose a society…</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
        {Object.entries(ROLE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}

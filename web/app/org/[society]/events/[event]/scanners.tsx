"use client";

import { useState } from "react";
import Link from "next/link";
import { UserMinus, UserPlus } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { ActionButton } from "@/components/action-button";
import { formatDateTime } from "@/lib/format";
import { assignScanner, unassignScanner } from "@/app/org/_actions/manage";
import { roleLabel } from "@/lib/roles";
import { ScannerSessionsDialog } from "./scanner-sessions";

// ORG-10: choose gate volunteers for this event; access ends 6 hours after the event.
export function ScannersCard({
  orgSlug,
  eventId,
  team,
  assigned,
  isOwner,
  sessions = [],
}: {
  orgSlug: string;
  eventId: string;
  team: { user_id: string; name: string; role: string }[];
  assigned: { user_id: string; name: string; expires_at: string; session_ids?: string[] | null }[];
  isOwner: boolean;
  sessions?: { id: string; name: string }[];
}) {
  const assignedIds = new Set(assigned.map((a) => a.user_id));
  const options = team.filter((t) => !assignedIds.has(t.user_id) && t.role !== "owner");
  const [pick, setPick] = useState("");

  return (
    <div className="grid gap-3">
      {assigned.length ? (
        <ul className="divide-y rounded-lg border bg-white">
          {assigned.map((a) => (
            <li key={a.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div>
                <p className="font-medium text-navy">{a.name}</p>
                <p className="text-xs text-muted-foreground">Access until {formatDateTime(a.expires_at)}</p>
                {sessions.length ? (
                  <p className="text-xs text-slate-700">
                    {a.session_ids?.length ? `Only these doors: ${sessions.filter((x) => a.session_ids!.includes(x.id)).map((x) => x.name).join(", ")}` : "Every door (main gate + all sessions)"}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center">
              {sessions.length ? <ScannerSessionsDialog orgSlug={orgSlug} eventId={eventId} userId={a.user_id} name={a.name} sessions={sessions} selected={a.session_ids ?? []} /> : null}
              <ActionButton variant="ghost" size="icon" aria-label={`Remove ${a.name}`} action={unassignScanner.bind(null, orgSlug, eventId, a.user_id)}>
                <UserMinus />
              </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No gate volunteers added yet. Organizers (owner and members) can always scan their own events.</p>
      )}
      {options.length ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Team member to add">
            <option value="">Choose a team member…</option>
            {options.map((o) => (
              <option key={o.user_id} value={o.user_id}>
                {o.name} ({roleLabel(o.role)})
              </option>
            ))}
          </NativeSelect>
          <ActionButton variant="outline" disabled={!pick} action={() => assignScanner(orgSlug, eventId, pick)}>
            <UserPlus /> Add
          </ActionButton>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isOwner ? (
            <>
              Invite volunteers as <strong>Gate volunteer</strong> on the{" "}
              <Link href={`/org/${orgSlug}/team`} className="text-brand-strong underline">
                Team page
              </Link>
              , then add them here.
            </>
          ) : (
            "Ask the owner to invite gate volunteers on the Team page."
          )}
        </p>
      )}
    </div>
  );
}

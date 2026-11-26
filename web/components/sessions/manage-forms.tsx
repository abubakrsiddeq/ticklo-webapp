"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/native-select";
import { checkInForSession, decideTeam, saveResults } from "@/app/manage/actions";
import type { ActionResult } from "@/lib/errors";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        after?.();
      } else toast.error(res.error);
      router.refresh();
    });
  return { pending, run };
}

/** FES-11: accept / decline a team. */
export function TeamDecision({ sessionId, registrationId, team, canAccept }: { sessionId: string; registrationId: string; team: string; canAccept: boolean }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      {canAccept ? (
        <Button size="sm" variant="brand" disabled={pending} onClick={() => run(() => decideTeam(sessionId, registrationId, true, null))}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Accept
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(`Decline ${team}? Reason (sent to the team, optional):`);
          if (reason === null) return;
          run(() => decideTeam(sessionId, registrationId, false, reason || null));
        }}
      >
        <X /> Decline
      </Button>
    </div>
  );
}

export function SessionCheckInButton({ sessionId, ticketId, name }: { sessionId: string; ticketId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => window.confirm(`Check in ${name}?`) && run(() => checkInForSession(sessionId, ticketId))}>
      {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Check in
    </Button>
  );
}

/** FES-13: winners (1st, 2nd, 3rd… or own labels), optionally picked from the registered teams. */
export function ResultsEditor({
  sessionId,
  teams,
  initial,
  published,
}: {
  sessionId: string;
  teams: { id: string; name: string }[];
  initial: { label: string; name: string; registration_id?: string }[];
  published: boolean;
}) {
  const defaults = ["1st", "2nd", "3rd"];
  const [rows, setRows] = useState<{ label: string; name: string; registration_id: string | null }[]>(
    initial.length ? initial.map((r) => ({ label: r.label, name: r.name, registration_id: r.registration_id ?? null })) : defaults.map((label) => ({ label, name: "", registration_id: null })),
  );
  const [publish, setPublish] = useState(published);
  const { pending, run } = useAction();
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-center">
          <Input aria-label={`Place ${i + 1} label`} value={r.label} maxLength={40} onChange={(e) => set(i, { label: e.target.value })} placeholder={defaults[i] ?? `${i + 1}th`} />
          {teams.length ? (
            <NativeSelect
              aria-label={`Place ${i + 1} team`}
              value={r.registration_id ?? ""}
              onChange={(e) => {
                const t = teams.find((x) => x.id === e.target.value);
                set(i, { registration_id: t?.id ?? null, name: t ? t.name : r.name });
              }}
            >
              <option value="">Pick a team (or type a name) …</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <Input aria-label={`Place ${i + 1} name`} value={r.name} maxLength={120} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name shown on the event page" />
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      {rows.length < 10 ? (
        <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => setRows((all) => [...all, { label: "", name: "", registration_id: null }])}>
          <Plus /> Add place
        </Button>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={publish} onCheckedChange={(v) => setPublish(v === true)} /> Show the results on the event page
      </label>
      <Button className="justify-self-start" variant="brand" disabled={pending} onClick={() => run(() => saveResults(sessionId, rows, publish))}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save results
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { MemberFields, checkMember } from "@/components/sessions/member-fields";
import type { TeamMember } from "@/lib/sessions";
import { payTeam, updateTeam } from "@/app/me/tickets/team-actions";

/** D-064: pay for an accepted team, optionally with a promo / ambassador code. */
export function PayTeamButton({ registrationId, eventId, label, withCode }: { registrationId: string; eventId: string; label: string; withCode: boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const pay = () =>
    start(async () => {
      const res = await payTeam(registrationId, eventId, code || null);
      if (res && !res.ok) toast.error(res.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {withCode && open ? (
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="Code" aria-label="Promo or ambassador code" className="h-9 w-36 font-mono uppercase" />
      ) : null}
      <SubmitButton type="button" variant="brand" size="sm" pending={pending} pendingText="…" onClick={pay}>
        {label}
      </SubmitButton>
      {withCode && !open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline">
          <Tag className="size-3.5" aria-hidden /> Have a code?
        </button>
      ) : null}
    </div>
  );
}

/** D-064: the lead changes members (someone dropped out, a detail was wrong) until the competition starts. */
export function EditTeamButton(props: {
  registrationId: string;
  teamName: string;
  members: TeamMember[];
  teamMin: number;
  teamMax: number;
  memberRequired: string[];
  /** paid or payment sent: the number of members stays the same */
  fixedCount: boolean;
}) {
  const router = useRouter();
  const solo = props.teamMax <= 1;
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(props.teamName);
  const [members, setMembers] = useState<TeamMember[]>(props.members);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const min = props.fixedCount ? props.members.length : props.teamMin;
  const max = props.fixedCount ? props.members.length : props.teamMax;
  const blank: TeamMember = { name: "", phone: "", email: "", roll_no: "", university: "" };
  const setMember = (i: number, k: keyof TeamMember, v: string) => setMembers((all) => all.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  function save() {
    const errs: Record<string, string> = {};
    if (!solo && team.trim().length < 2) errs.team = "Team name";
    members.forEach((m, i) => {
      for (const [k, v] of Object.entries(checkMember(m, props.memberRequired))) errs[`m${i}-${k}`] = v;
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fill in the highlighted fields.");
      return;
    }
    start(async () => {
      const res = await updateTeam(props.registrationId, solo ? "" : team, members);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const memberErrors = (i: number) =>
    Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`m${i}-`)).map(([k, v]) => [k.slice(`m${i}-`.length), v]));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> {solo ? "Change details" : "Change members"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{solo ? "Your entry" : props.teamName}</DialogTitle>
            <DialogDescription>
              {props.fixedCount
                ? "You have paid for this many members, so replace people instead of adding or removing. Names on unused tickets update too."
                : "You can change the team until the competition starts."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {solo ? null : (
              <FormField id="edit-team-name" label="Team name" error={errors.team} required>
                <Input id="edit-team-name" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} />
              </FormField>
            )}
            {members.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-2xl border border-navy/10 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-navy">{solo ? "Participant" : `Member ${i + 1}`}</p>
                  {members.length > min ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove member ${i + 1}`} onClick={() => setMembers((all) => all.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  ) : null}
                </div>
                <MemberFields prefix={`e${i}`} member={m} required={props.memberRequired} errors={memberErrors(i)} onChange={(k, v) => setMember(i, k, v)} />
              </div>
            ))}
            {members.length < max ? (
              <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setMembers((all) => [...all, { ...blank }])}>
                <Plus /> Add member
              </Button>
            ) : null}
            <SubmitButton type="button" variant="brand" pending={pending} pendingText="Saving…" onClick={save} className="sm:justify-self-start">
              Save
            </SubmitButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

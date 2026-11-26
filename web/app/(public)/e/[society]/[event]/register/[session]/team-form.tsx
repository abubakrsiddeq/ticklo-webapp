"use client";

import { useState, useTransition } from "react";
import { Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { formatPKR } from "@/lib/format";
import { checkAnswers, type Question, type TeamMember } from "@/lib/sessions";
import { registerTeam } from "../actions";

/** FES-10: team name, members (min–max), questions, optional code. */
export function TeamForm(props: {
  eventId: string;
  sessionId: string;
  teamMin: number;
  teamMax: number;
  feePaisa: number;
  feeMode: string;
  needsApproval: boolean;
  questions: Question[];
  leader: { name: string; phone: string; email: string };
}) {
  const blank: TeamMember = { name: "", phone: "", email: "", roll_no: "", university: "" };
  const [team, setTeam] = useState("");
  const [members, setMembers] = useState<TeamMember[]>(() => [
    { ...blank, name: props.leader.name, phone: props.leader.phone, email: props.leader.email },
    ...Array.from({ length: Math.max(0, props.teamMin - 1) }, () => ({ ...blank })),
  ]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [pending, start] = useTransition();
  const solo = props.teamMax <= 1;
  const total = props.feeMode === "per_member" ? props.feePaisa * members.length : props.feePaisa;

  const setMember = (i: number, k: keyof TeamMember, v: string) => setMembers((all) => all.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  function submit() {
    const errs: Record<string, string> = {};
    if (team.trim().length < 2) errs.team = solo ? "Enter a name (your name or delegation)" : "Give your team a name";
    members.forEach((m, i) => {
      if ((m.name ?? "").trim().length < 2) errs[`m${i}`] = "Name required";
    });
    const qa = checkAnswers(props.questions, answers);
    for (const [k, v] of Object.entries(qa)) errs[`q-${k}`] = v;
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fill in the highlighted fields.");
      return;
    }
    start(async () => {
      const res = await registerTeam({ eventId: props.eventId, sessionId: props.sessionId, teamName: team, members, answers, code: code || null });
      if (res && !res.ok) toast.error(res.error);
    });
  }

  return (
    <form
      className="grid gap-5 rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06] sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormField id="team-name" label={solo ? "Name on the entry" : "Team name"} error={errors.team} required>
        <Input id="team-name" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} placeholder={solo ? "e.g. Delegation of Pakistan" : "e.g. Code Warriors"} />
      </FormField>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-navy">
          {solo ? "Participant" : `Members (${props.teamMin === props.teamMax ? props.teamMax : `${props.teamMin}–${props.teamMax}`})`}
        </legend>
        {members.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-navy/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-navy">{i === 0 ? "You (team lead)" : `Member ${i + 1}`}</p>
              {i > 0 && members.length > props.teamMin ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove member ${i + 1}`} onClick={() => setMembers((all) => all.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormField id={`m${i}-name`} label="Full name" error={errors[`m${i}`]} required>
                <Input id={`m${i}-name`} value={m.name} onChange={(e) => setMember(i, "name", e.target.value)} maxLength={80} />
              </FormField>
              <FormField id={`m${i}-phone`} label="Phone">
                <Input id={`m${i}-phone`} value={m.phone ?? ""} onChange={(e) => setMember(i, "phone", e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="0300 1234567" />
              </FormField>
              <FormField id={`m${i}-roll`} label="Roll / student ID">
                <Input id={`m${i}-roll`} value={m.roll_no ?? ""} onChange={(e) => setMember(i, "roll_no", e.target.value)} maxLength={40} />
              </FormField>
              <FormField id={`m${i}-uni`} label="University">
                <Input id={`m${i}-uni`} value={m.university ?? ""} onChange={(e) => setMember(i, "university", e.target.value)} maxLength={120} />
              </FormField>
            </div>
          </div>
        ))}
        {members.length < props.teamMax ? (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setMembers((all) => [...all, { ...blank }])}>
            <Plus /> Add member
          </Button>
        ) : null}
      </fieldset>

      {props.questions.length ? (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold text-navy">Questions from the organizer</legend>
          {props.questions.map((q) => {
            const id = `q-${q.id}`;
            const value = answers[q.id] ?? "";
            const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
            return (
              <FormField key={q.id} id={id} label={q.label} required={q.required} error={errors[id]}>
                {q.type === "select" ? (
                  <NativeSelect id={id} value={value} onChange={(e) => set(e.target.value)}>
                    <option value="">Choose…</option>
                    {q.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </NativeSelect>
                ) : q.type === "yes_no" ? (
                  <NativeSelect id={id} value={value} onChange={(e) => set(e.target.value)}>
                    <option value="">Choose…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </NativeSelect>
                ) : q.type === "long_text" ? (
                  <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} rows={3} maxLength={1000} />
                ) : (
                  <Input id={id} value={value} onChange={(e) => set(e.target.value)} inputMode={q.type === "number" ? "decimal" : undefined} maxLength={200} />
                )}
              </FormField>
            );
          })}
        </fieldset>
      ) : null}

      {props.feePaisa > 0 && !props.needsApproval ? (
        showCode ? (
          <FormField id="team-code" label="Promo or ambassador code">
            <Input id="team-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} className="font-mono uppercase sm:max-w-xs" />
          </FormField>
        ) : (
          <button type="button" onClick={() => setShowCode(true)} className="flex items-center gap-1.5 justify-self-start text-sm font-medium text-brand-strong hover:underline">
            <Tag className="size-4" aria-hidden /> Have a promo or ambassador code?
          </button>
        )
      ) : null}

      <div className="grid gap-2 border-t pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Entry fee{props.feeMode === "per_member" && props.feePaisa ? ` (${members.length} × ${formatPKR(props.feePaisa)})` : ""}
          </span>
          <span className="text-lg font-bold text-navy">{formatPKR(total, { freeLabel: "Free" })}</span>
        </div>
        <SubmitButton pending={pending} pendingText="Sending…" variant="brand" size="lg" className="w-full">
          {props.needsApproval ? "Send application" : total ? "Register & pay" : "Register"}
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">
          {props.needsApproval
            ? "The organizer reviews applications. If accepted, you pay from My tickets."
            : total
              ? "Your team's place is held for 60 minutes while you pay."
              : "Your entry pass appears in My tickets."}
        </p>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Plus, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { formatPKR } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { checkAnswers, type Question, type TeamMember } from "@/lib/sessions";
import { MemberFields, checkMember } from "@/components/sessions/member-fields";
import { registerTeam } from "../actions";

/** FES-10: team name, members (min–max), questions, optional code. D-064: individuals, required details. */
export function TeamForm(props: {
  eventId: string;
  sessionId: string;
  teamMin: number;
  teamMax: number;
  feePaisa: number;
  feeMode: string;
  needsApproval: boolean;
  questions: Question[];
  memberRequired: string[];
  leader: { name: string; phone: string; email: string };
  /** The account has no name or phone yet: ask them here and save them to the profile. */
  profileIncomplete: boolean;
}) {
  const solo = props.teamMax <= 1;
  const blank: TeamMember = { name: "", phone: "", email: "", roll_no: "", university: "" };
  const fromLeader: TeamMember = { ...blank, name: props.leader.name, phone: props.leader.phone, email: props.leader.email };
  const [team, setTeam] = useState("");
  const [leadPlays, setLeadPlays] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>(() => [fromLeader, ...Array.from({ length: Math.max(0, props.teamMin - 1) }, () => ({ ...blank }))]);
  const [profile, setProfile] = useState({ full_name: props.leader.name, phone: props.leader.phone });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [pending, start] = useTransition();
  const total = props.feeMode === "per_member" ? props.feePaisa * members.length : props.feePaisa;

  const setMember = (i: number, k: keyof TeamMember, v: string) => setMembers((all) => all.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  function toggleLeadPlays(on: boolean) {
    setLeadPlays(on);
    setMembers((all) => [on ? fromLeader : { ...blank }, ...all.slice(1)]);
  }

  function submit() {
    const errs: Record<string, string> = {};
    if (props.profileIncomplete) {
      if (profile.full_name.trim().length < 2) errs["p-name"] = "Your name";
      if (!normalizePhone(profile.phone)) errs["p-phone"] = "e.g. 0300 1234567";
    }
    if (!solo && team.trim().length < 2) errs.team = "Give your team a name";
    members.forEach((m, i) => {
      for (const [k, v] of Object.entries(checkMember(m, props.memberRequired))) errs[`m${i}-${k}`] = v;
    });
    const qa = checkAnswers(props.questions, answers);
    for (const [k, v] of Object.entries(qa)) errs[`q-${k}`] = v;
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fill in the highlighted fields.");
      return;
    }
    start(async () => {
      const res = await registerTeam({
        eventId: props.eventId,
        sessionId: props.sessionId,
        teamName: solo ? "" : team,
        members,
        answers,
        code: code || null,
        leaderProfile: props.profileIncomplete ? profile : null,
      });
      if (res && !res.ok) toast.error(res.error);
    });
  }

  const memberErrors = (i: number) =>
    Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`m${i}-`)).map(([k, v]) => [k.slice(`m${i}-`.length), v]));

  return (
    <form
      className="grid gap-5 rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06] sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      {props.profileIncomplete ? (
        <fieldset className="grid gap-3 rounded-2xl bg-secondary/60 p-3">
          <legend className="text-sm font-semibold text-navy">Your details (saved to your account)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField id="p-name" label="Your full name" error={errors["p-name"]} required>
              <Input id="p-name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} maxLength={100} autoComplete="name" />
            </FormField>
            <FormField id="p-phone" label="Your mobile number" error={errors["p-phone"]} required>
              <Input id="p-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} type="tel" inputMode="tel" placeholder="0300 1234567" autoComplete="tel" />
            </FormField>
          </div>
        </fieldset>
      ) : null}

      {solo ? null : (
        <FormField id="team-name" label="Team name" error={errors.team} required>
          <Input id="team-name" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={80} placeholder="e.g. Code Warriors" />
        </FormField>
      )}

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-semibold text-navy">
          {solo ? "Participant" : `Members (${props.teamMin === props.teamMax ? props.teamMax : `${props.teamMin}–${props.teamMax}`})`}
        </legend>
        {solo ? null : (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={!leadPlays} onCheckedChange={(v) => toggleLeadPlays(v !== true)} className="mt-0.5" />
            <span>
              <span className="font-medium text-navy">I am registering the team but not taking part</span>
              <span className="block text-xs text-muted-foreground">e.g. a faculty advisor or society rep. You still manage the team and pay.</span>
            </span>
          </label>
        )}
        {members.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-navy/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-navy">{i === 0 && leadPlays ? (solo ? "You" : "You (team lead)") : solo ? "Participant" : `Member ${i + 1}`}</p>
              {i > 0 && members.length > props.teamMin ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove member ${i + 1}`} onClick={() => setMembers((all) => all.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              ) : null}
            </div>
            <MemberFields prefix={`m${i}`} member={m} required={props.memberRequired} errors={memberErrors(i)} onChange={(k, v) => setMember(i, k, v)} />
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
            Entry fee{props.feeMode === "per_member" && props.feePaisa && !solo ? ` (${members.length} × ${formatPKR(props.feePaisa)})` : ""}
          </span>
          <span className="text-lg font-bold text-navy">{formatPKR(total, { freeLabel: "Free" })}</span>
        </div>
        <SubmitButton pending={pending} pendingText="Sending…" variant="brand" size="lg" className="w-full">
          {props.needsApproval ? "Send application" : total ? "Register & pay" : "Register"}
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">
          {props.needsApproval
            ? "The organizer reviews applications. If accepted, you have 48 hours to pay from My tickets (a code can be added there)."
            : total
              ? `Your ${solo ? "place" : "team's place"} is held for 60 minutes while you pay.`
              : solo
                ? "Your entry pass appears in My tickets."
                : "A ticket for every member appears in My tickets – share each one with its member."}
        </p>
      </div>
    </form>
  );
}

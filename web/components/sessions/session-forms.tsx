"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { paisaToRupeesInput, toPKTInputValue } from "@/lib/format";
import { SESSION_KINDS, TEAM_SIZE_LIMIT, participationOf, type Participation, type Question } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { FormBuilder, type FormSource } from "@/components/sessions/form-builder";
import { DEFAULT_FORM, DEFAULT_TICKET_FIELDS, asForm, checkForm, ticketFieldsOf, type RegistrationForm } from "@/lib/registration-form";
import type { ActionResult } from "@/lib/errors";
import { addSessionManager, deleteSession, removeSessionManager, saveSession, type SessionFormValues } from "@/app/org/_actions/sessions";

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

export interface SessionValue {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  venue: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  pass_access: boolean;
  questions: Question[];
  team_min: number;
  team_max: number;
  member_required?: string[];
  attendee_names?: string;
  attendee_university?: string;
  poster_url?: string | null;
  form?: unknown;
  listed?: boolean;
  fee_mode: string;
  fee_paisa: number | null;
  needs_approval: boolean;
  registration_ends_at: string | null;
}

/** FES-01/FES-08/FES-09/FES-10: add or edit a session (workshop, competition, night…). */
export function SessionDialog({
  orgSlug,
  eventId,
  session,
  defaultStart,
  eventVenue,
  defaultKind = "workshop",
  defaultOpen = false,
  addLabel = "Add session",
  formSources = [],
  formLocked = false,
}: {
  orgSlug: string;
  eventId: string;
  session?: SessionValue;
  defaultStart: string;
  eventVenue: string;
  defaultKind?: string;
  defaultOpen?: boolean;
  addLabel?: string;
  /** D-068: other competitions of the society (copy their form) */
  formSources?: FormSource[];
  /** D-068: people registered for this competition */
  formLocked?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const savedForm = session?.form ? asForm(session.form) : null;
  const [regForm, setRegForm] = useState<RegistrationForm>(() => savedForm ?? { member: DEFAULT_FORM.member.map((f) => ({ ...f })), team: [] });
  const [kind, setKind] = useState(session?.kind ?? defaultKind);
  const [passAccess, setPassAccess] = useState(session?.pass_access ?? false);
  const [needsApproval, setNeedsApproval] = useState(session?.needs_approval ?? false);
  // D-070: on the Events page – on by default for competitions, workshops and concerts
  const [listed, setListed] = useState<boolean | null>(session ? (session.listed ?? false) : null);
  const listedNow = listed ?? ["competition", "workshop", "concert"].includes(kind);
  // Competitions: individuals or teams (min–max members). New competitions start with teams.
  const [participation, setParticipation] = useState<Participation>(session ? participationOf(session.team_max) : "team");
  const solo = participation === "individual";
  // D-064: member details the organizer requires (new competitions: mobile + university)
  // D-065: festivals ask ticket-holder details per session (not for competitions – they have member details)
  // D-069: every other session has a ticket form (asked for every ticket holder)
  const savedTicketForm: RegistrationForm | null = session
    ? { member: ticketFieldsOf(session.form, { names: session.attendee_names, university: session.attendee_university, questions: session.questions }), team: [] }
    : null;
  const [ticketForm, setTicketForm] = useState<RegistrationForm>(() => savedTicketForm ?? { member: DEFAULT_TICKET_FIELDS.map((f) => ({ ...f })), team: [] });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const competition = kind === "competition";
  const p = session ? `s-${session.id}` : "s-new";

  return (
    <>
      {session ? (
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${session.name}`} onClick={() => setOpen(true)}>
          <Pencil />
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus /> {addLabel}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const v: SessionFormValues = {
                name: String(fd.get("name") ?? ""),
                kind,
                description: String(fd.get("description") ?? ""),
                venue: String(fd.get("venue") ?? ""),
                starts_at: String(fd.get("starts_at") ?? ""),
                ends_at: String(fd.get("ends_at") ?? ""),
                capacity: String(fd.get("capacity") ?? ""),
                pass_access: passAccess,
                questions: [],
                participation,
                listed: listedNow,
                form: competition ? regForm : undefined,
                ticket_fields: competition ? undefined : ticketForm.member,
                team_min: String(fd.get("team_min") ?? "1"),
                team_max: String(fd.get("team_max") ?? "1"),
                fee_mode: String(fd.get("fee_mode") ?? "per_team"),
                fee: String(fd.get("fee") ?? "0"),
                needs_approval: needsApproval,
                registration_ends_at: String(fd.get("registration_ends_at") ?? ""),
              };
              // D-068: the registration form must make sense before it is sent
              const formProblem = competition ? checkForm(regForm) : checkForm(ticketForm, "ticket");
              if (formProblem) {
                toast.error(formProblem);
                return;
              }
              // D-066: a poster is required (new sessions, and older ones that have none)
              const posterFile = fd.get("poster");
              const hasFile = posterFile instanceof File && posterFile.size > 0;
              if (!hasFile && !session?.poster_url) {
                setErrors((e) => ({ ...e, poster: "Add a poster or banner for this session" }));
                toast.error("Add a poster or banner for this session.");
                return;
              }
              if (hasFile && posterFile.size > 5 * 1024 * 1024) {
                setErrors((e) => ({ ...e, poster: "Poster must be 5 MB or smaller" }));
                return;
              }
              const files = new FormData();
              if (hasFile) files.set("poster", posterFile);
              run(async () => {
                const res = await saveSession(orgSlug, eventId, session?.id ?? null, v, files);
                setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
                return res;
              }, () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>{session ? `Edit ${session.name}` : addLabel}</DialogTitle>
              <DialogDescription>A workshop, competition, concert or talk inside this event, with its own time, place and (optional) seats.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <FormField id={`${p}-name`} label="Name" error={errors.name} required>
                <Input id={`${p}-name`} name="name" defaultValue={session?.name} maxLength={120} placeholder="e.g. AI Workshop, Qawwali Night" required />
              </FormField>
              <FormField id={`${p}-kind`} label="Kind">
                <NativeSelect
                  id={`${p}-kind`}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    if (!session) setPassAccess(e.target.value === "concert" || e.target.value === "talk" || e.target.value === "other");
                  }}
                >
                  {SESSION_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.emoji} {k.label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id={`${p}-start`} label="Starts (PKT)" error={errors.starts_at} required>
                <Input id={`${p}-start`} name="starts_at" type="datetime-local" defaultValue={session ? toPKTInputValue(session.starts_at) : defaultStart} required />
              </FormField>
              <FormField id={`${p}-end`} label="Ends (PKT)" error={errors.ends_at} required>
                <Input id={`${p}-end`} name="ends_at" type="datetime-local" defaultValue={session ? toPKTInputValue(session.ends_at) : ""} required />
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <FormField id={`${p}-venue`} label="Venue" hint={`Empty = ${eventVenue}`}>
                <Input id={`${p}-venue`} name="venue" defaultValue={session?.venue ?? ""} maxLength={200} placeholder="e.g. Lab 3, Main Ground" />
              </FormField>
              <FormField
                id={`${p}-cap`}
                label={competition ? (solo ? "Max participants" : "Max teams") : "Seats"}
                hint={competition ? undefined : "Empty = no limit"}
                error={errors.capacity}
                required={competition}
              >
                <Input id={`${p}-cap`} name="capacity" inputMode="numeric" defaultValue={session?.capacity ?? ""} placeholder={competition ? (solo ? "100" : "30") : "40"} />
              </FormField>
            </div>
            <FormField
              id={`${p}-poster`}
              label={session?.poster_url ? "Poster / banner (upload to replace)" : "Poster / banner"}
              hint="JPG, PNG or WebP, up to 5 MB. Shown on the schedule and the register page."
              error={errors.poster}
              required={!session?.poster_url}
            >
              <div className="flex items-center gap-3">
                {session?.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.poster_url} alt="" className="h-16 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border" />
                ) : null}
                <Input id={`${p}-poster`} name="poster" type="file" accept="image/jpeg,image/png,image/webp" className="pt-2" />
              </div>
            </FormField>
            <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
              <Checkbox checked={listedNow} onCheckedChange={(v) => setListed(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium text-navy">Show on the Events page</span>
                <span className="block text-xs text-muted-foreground">
                  Listed as its own card (with this poster) so people find it without opening the festival. Good for competitions, workshops and nights.
                </span>
              </span>
            </label>
            <FormField id={`${p}-desc`} label="Description (optional)">
              <Textarea id={`${p}-desc`} name="description" defaultValue={session?.description ?? ""} maxLength={2000} rows={3} placeholder="What happens, who should come, what to bring…" />
            </FormField>

            {competition ? (
              <fieldset className="grid gap-3 rounded-xl border border-navy/10 p-3">
                <legend className="px-1 text-sm font-semibold text-navy">🏆 Competition</legend>
                <div className="grid gap-2">
                  <p className="text-sm font-medium text-navy">
                    Who can take part? <span className="text-destructive" aria-hidden>*</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who can take part?">
                    {(
                      [
                        { key: "individual", title: "🙋 Individuals", text: "One person per entry, e.g. a quiz, speech or solo coding round." },
                        { key: "team", title: "👥 Teams / groups", text: "A team registers together, e.g. a hackathon, MUN delegation or futsal." },
                      ] as const
                    ).map((o) => (
                      <label
                        key={o.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-xl border-2 p-3 text-sm transition-colors",
                          participation === o.key ? "border-brand bg-brand-soft" : "border-navy/10 hover:border-brand/40",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${p}-participation`}
                          value={o.key}
                          checked={participation === o.key}
                          onChange={() => setParticipation(o.key)}
                          className="mt-0.5 size-4 accent-[#0B7D47]"
                        />
                        <span>
                          <span className="block font-semibold text-navy">{o.title}</span>
                          <span className="block text-xs text-muted-foreground">{o.text}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {solo ? null : (
                  <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                    <FormField id={`${p}-tmin`} label="Min members" hint="Smallest team allowed" error={errors.team_min} required>
                      <Input
                        id={`${p}-tmin`}
                        name="team_min"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={TEAM_SIZE_LIMIT}
                        defaultValue={session && session.team_max > 1 ? session.team_min : 2}
                      />
                    </FormField>
                    <FormField id={`${p}-tmax`} label="Max members" hint={`Up to ${TEAM_SIZE_LIMIT}`} error={errors.team_max} required>
                      <Input
                        id={`${p}-tmax`}
                        name="team_max"
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={TEAM_SIZE_LIMIT}
                        defaultValue={session && session.team_max > 1 ? session.team_max : 4}
                      />
                    </FormField>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                  <FormField id={`${p}-fee`} label={solo ? "Entry fee per person (Rs)" : "Entry fee (Rs)"} hint="0 = free" error={errors.fee}>
                    <Input id={`${p}-fee`} name="fee" inputMode="decimal" defaultValue={session?.fee_paisa ? paisaToRupeesInput(session.fee_paisa) : "0"} />
                  </FormField>
                  {solo ? null : (
                    <FormField id={`${p}-mode`} label="Fee is">
                      <NativeSelect id={`${p}-mode`} name="fee_mode" defaultValue={session?.fee_mode ?? "per_team"}>
                        <option value="per_team">per team</option>
                        <option value="per_member">per member</option>
                      </NativeSelect>
                    </FormField>
                  )}
                </div>
                <FormBuilder value={regForm} onChange={setRegForm} solo={solo} sources={formSources} locked={formLocked} saved={savedForm} />
                <FormField id={`${p}-regend`} label="Registration closes (PKT)" hint="Empty = when the competition starts" error={errors.registration_ends_at}>
                  <Input id={`${p}-regend`} name="registration_ends_at" type="datetime-local" defaultValue={toPKTInputValue(session?.registration_ends_at)} className="sm:max-w-xs" />
                </FormField>
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox checked={needsApproval} onCheckedChange={(v) => setNeedsApproval(v === true)} className="mt-0.5" />
                  <span>
                    <span className="font-medium text-navy">{solo ? "Shortlist participants before they pay" : "Shortlist teams before they pay"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {solo ? "People apply first" : "Teams apply first"}; you or the session manager accept them, then they pay.
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : (
              <>
              <FormBuilder value={ticketForm} onChange={setTicketForm} solo sources={[]} locked={formLocked} saved={savedTicketForm} mode="ticket" />
              <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
                <Checkbox checked={passAccess} onCheckedChange={(v) => setPassAccess(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-navy">Included in all-access passes</span>
                  <span className="block text-xs text-muted-foreground">
                    Pass holders get in. Turn off for limited-seat workshops that need their own ticket.
                  </span>
                </span>
              </label>
              </>
            )}

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteSessionButton({ orgSlug, sessionId, name }: { orgSlug: string; sessionId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete ${name}`}
      disabled={pending}
      onClick={() => window.confirm(`Delete ${name}? Only possible before anyone registers or checks in.`) && run(() => deleteSession(orgSlug, sessionId))}
    >
      <Trash2 className="text-destructive" />
    </Button>
  );
}

/** FES-12: who runs this session (any team member). */
export function SessionManagers({
  orgSlug,
  sessionId,
  managers,
  team,
}: {
  orgSlug: string;
  sessionId: string;
  managers: { user_id: string; name: string }[];
  team: { user_id: string; name: string }[];
}) {
  const [pick, setPick] = useState("");
  const { pending, run } = useAction();
  const ids = new Set(managers.map((m) => m.user_id));
  const options = team.filter((t) => !ids.has(t.user_id));
  return (
    <div className="grid gap-2">
      {managers.length ? (
        <ul className="flex flex-wrap gap-2">
          {managers.map((m) => (
            <li key={m.user_id} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-navy">
              {m.name}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${m.name}`}
                disabled={pending}
                onClick={() => run(() => removeSessionManager(orgSlug, sessionId, m.user_id))}
              >
                <UserMinus className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {options.length ? (
        <div className="flex gap-2">
          <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a session manager" className="h-9 text-sm">
            <option value="">Add a manager…</option>
            {options.map((o) => (
              <option key={o.user_id} value={o.user_id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pick || pending}
            onClick={() =>
              run(
                () => addSessionManager(orgSlug, sessionId, pick),
                () => setPick(""),
              )
            }
          >
            <UserPlus /> Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

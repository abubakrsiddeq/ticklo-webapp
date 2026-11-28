"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Lock, Pencil, Plus, Ticket, Trash2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { formatPKR, paisaToRupeesInput, toPKTInputValue } from "@/lib/format";
import { defaultSessionTicketName } from "@/lib/ticket-groups";
import { SESSION_KINDS, TEAM_SIZE_LIMIT, participationOf, type Participation, type Question } from "@/lib/sessions";
import { guessStyle, stylesForKind } from "@/lib/print/category";
import { cn } from "@/lib/utils";
import { FormBuilder, type FormSource } from "@/components/sessions/form-builder";
import { DEFAULT_FORM, DEFAULT_TICKET_FIELDS, asForm, checkForm, ticketFieldsOf, type RegistrationForm } from "@/lib/registration-form";
import type { ActionResult } from "@/lib/errors";
import { addSessionManager, deleteSession, removeSessionManager, saveSession, type OwnTicketValues, type SessionFormValues } from "@/app/org/_actions/sessions";
import { useActionTransition } from "@/lib/use-action-transition";

function useAction() {
  const router = useRouter();
  const [pending, start] = useActionTransition();
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
  /** D-081: what kind of night / event */
  style?: string | null;
  early_fee_paisa?: number | null;
  early_until?: string | null;
  fee_mode: string;
  fee_paisa: number | null;
  needs_approval: boolean;
  registration_ends_at: string | null;
  /** D-087: the one ticket that opens only this session (edited right here) */
  own_ticket?: SessionTicket | null;
  /** D-087: other tickets that open this session (several prices, or tickets for several sessions) */
  other_tickets?: SessionTicket[];
}

export interface SessionTicket {
  id: string;
  name: string;
  price_paisa: number;
  quantity: number;
  early_price_paisa?: number | null;
  early_until?: string | null;
  booked: boolean;
  taken: number;
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
  passNames = [],
  ticketsHref,
  trigger = "icon",
  startWithTicket = false,
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
  /** D-087: the event's festival passes (names), to say who gets in with "Included in passes" */
  passNames?: string[];
  /** D-087: the tickets tab, for more prices and new passes */
  ticketsHref?: string;
  /** D-087: "icon" = pencil, "add-ticket" / "edit-ticket" = a button that opens the form at "How do people get in?" */
  trigger?: "icon" | "add-ticket" | "edit-ticket";
  /** D-087: open with "Sell its own ticket" ticked */
  startWithTicket?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(defaultOpen);
  const wayInRef = useRef<HTMLFieldSetElement>(null);
  const focusTicket = trigger !== "icon" || startWithTicket;
  // D-087: opened from a link (?ticket=<session>) after the props change, e.g. right after adding a session
  const [seenDefaultOpen, setSeenDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== seenDefaultOpen) {
    setSeenDefaultOpen(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  useEffect(() => {
    if (!open || !focusTicket) return;
    const t = window.setTimeout(() => wayInRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
    return () => window.clearTimeout(t);
  }, [open, focusTicket]);
  const savedForm = session?.form ? asForm(session.form) : null;
  const [regForm, setRegForm] = useState<RegistrationForm>(() => savedForm ?? { member: DEFAULT_FORM.member.map((f) => ({ ...f })), team: [] });
  const [kind, setKind] = useState(session?.kind ?? defaultKind);
  // D-081: "What kind of night?" starts from the saved choice, else a guess from the name
  const [nameDraft, setNameDraft] = useState(session?.name ?? "");
  const [style, setStyle] = useState<string | null>(null);
  const styleChoices = stylesForKind(kind);
  const styleNow = style ?? session?.style ?? guessStyle(kind, nameDraft) ?? "";
  const [passAccess, setPassAccess] = useState(session?.pass_access ?? (defaultKind === "concert" || defaultKind === "talk" || defaultKind === "other"));
  // D-087: "Sell its own ticket" – on for a session that has one, and for new workshops (limited seats)
  const ownTicket = session?.own_ticket ?? null;
  const otherTickets = session?.other_tickets ?? [];
  const initialOwn = Boolean(ownTicket) || startWithTicket || (!session && defaultKind === "workshop");
  const [ownOn, setOwnOn] = useState(initialOwn);
  const [followUp, setFollowUp] = useState<{ id: string; name: string; v: SessionFormValues } | null>(null);
  const openDialog = () => {
    setNameDraft(session?.name ?? "");
    setStyle(null);
    setOwnOn(initialOwn || trigger === "add-ticket");
    setOpen(true);
  };
  const closeDialog = (next: boolean) => {
    setOpen(next);
    // D-087: drop ?ticket=… so a refresh does not open the form again
    if (!next && defaultOpen) router.replace(pathname, { scroll: false });
  };
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
      {session && trigger === "add-ticket" ? (
        <Button size="sm" variant="brand" onClick={openDialog}>
          <Plus /> Add a ticket
        </Button>
      ) : session && trigger === "edit-ticket" ? (
        <Button size="sm" variant="outline" onClick={openDialog}>
          <Pencil /> Edit ticket
        </Button>
      ) : session ? (
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${session.name}`} onClick={openDialog}>
          <Pencil />
        </Button>
      ) : (
        <Button variant="brand" onClick={openDialog}>
          <Plus /> {addLabel}
        </Button>
      )}
      <Dialog open={open} onOpenChange={closeDialog}>
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
                style: styleChoices.some((x) => x.key === styleNow) ? styleNow : "",
                form: competition ? regForm : undefined,
                ticket_fields: competition ? undefined : ticketForm.member,
                team_min: String(fd.get("team_min") ?? "1"),
                team_max: String(fd.get("team_max") ?? "1"),
                fee_mode: String(fd.get("fee_mode") ?? "per_team"),
                fee: String(fd.get("fee") ?? "0"),
                needs_approval: needsApproval,
                registration_ends_at: String(fd.get("registration_ends_at") ?? ""),
                early_fee: String(fd.get("early_fee") ?? ""),
                early_until: String(fd.get("early_until") ?? ""),
                own_ticket: competition || (!ownOn && !ownTicket) || (!ownTicket && otherTickets.length) ? undefined : ownTicketValues(fd, ownOn, ownTicket?.id ?? null),
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
                if (res.ok) {
                  if (res.data?.ticketProblem) toast.error(res.data.ticketProblem);
                  // D-087: a new session nobody can get into yet – ask how people get in
                  const madeTicket = Boolean(v.own_ticket?.enabled) && !res.data?.ticketProblem;
                  if (!session && !competition && res.data?.id && !madeTicket && !(passAccess && passNames.length)) {
                    setFollowUp({ id: res.data.id, name: v.name.trim(), v });
                  }
                }
                return res;
              }, () => closeDialog(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>{session ? `Edit ${session.name}` : addLabel}</DialogTitle>
              <DialogDescription>A workshop, competition, concert or talk inside this event, with its own time, place and (optional) seats.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <FormField id={`${p}-name`} label="Name" error={errors.name} required>
                <Input
                  id={`${p}-name`}
                  name="name"
                  defaultValue={session?.name}
                  maxLength={120}
                  placeholder="e.g. AI Workshop, Qawwali Night"
                  required
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </FormField>
              <FormField id={`${p}-kind`} label="Kind">
                <NativeSelect
                  id={`${p}-kind`}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    if (!session) {
                      setPassAccess(e.target.value === "concert" || e.target.value === "talk" || e.target.value === "other");
                      if (!startWithTicket) setOwnOn(e.target.value === "workshop");
                    }
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
            {styleChoices.length ? (
              <FormField
                id={`${p}-style`}
                label={kind === "concert" ? "What kind of night?" : "What kind of event?"}
                hint="Used to suggest the right printed ticket designs."
                error={errors.style}
              >
                <NativeSelect id={`${p}-style`} value={styleChoices.some((x) => x.key === styleNow) ? styleNow : ""} onChange={(e) => setStyle(e.target.value)}>
                  <option value="">Not sure</option>
                  {styleChoices.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            ) : null}
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
            {competition ? null : (
              <WayIn
                ref={wayInRef}
                p={p}
                errors={errors}
                passAccess={passAccess}
                setPassAccess={setPassAccess}
                passNames={passNames}
                ownOn={ownOn}
                setOwnOn={setOwnOn}
                ownTicket={ownTicket}
                otherTickets={otherTickets}
                namePlaceholder={defaultSessionTicketName(nameDraft) || "e.g. DJ Night ticket"}
                ticketsHref={ticketsHref}
                sessionId={session?.id ?? null}
              />
            )}
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
                {/* D-072 */}
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-brand-soft/60 p-3 sm:max-w-lg">
                  <FormField id={`${p}-efee`} label={solo ? "🐦 Early-bird fee per person (Rs)" : "🐦 Early-bird fee (Rs)"} hint="Optional, lower than the fee" error={errors.early_fee}>
                    <Input
                      id={`${p}-efee`}
                      name="early_fee"
                      inputMode="decimal"
                      placeholder="e.g. 2000"
                      defaultValue={session?.early_fee_paisa != null ? paisaToRupeesInput(session.early_fee_paisa) : ""}
                    />
                  </FormField>
                  <FormField id={`${p}-euntil`} label="Early bird until (PKT)" hint="Then the normal fee" error={errors.early_until}>
                    <Input id={`${p}-euntil`} name="early_until" type="datetime-local" defaultValue={toPKTInputValue(session?.early_until)} />
                  </FormField>
                </div>
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
              <FormBuilder value={ticketForm} onChange={setTicketForm} solo sources={[]} locked={formLocked} saved={savedTicketForm} mode="ticket" />
            )}

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {followUp ? (
        <WayInFollowUp
          followUp={followUp}
          passNames={passNames}
          passAccess={passAccess}
          ticketsHref={ticketsHref}
          onClose={() => setFollowUp(null)}
          onSellTicket={() => {
            setFollowUp(null);
            router.push(`${pathname}?ticket=${followUp.id}`, { scroll: false });
          }}
          onIncludeInPasses={() =>
            run(
              () => saveSession(orgSlug, eventId, followUp.id, { ...followUp.v, pass_access: true, own_ticket: undefined }, null),
              () => setFollowUp(null),
            )
          }
          pending={pending}
        />
      ) : null}
    </>
  );
}

/** D-087: the session's own ticket from the form fields. */
function ownTicketValues(fd: FormData, enabled: boolean, id: string | null): OwnTicketValues {
  return {
    enabled,
    id,
    name: String(fd.get("ticket_name") ?? ""),
    price: String(fd.get("ticket_price") ?? ""),
    quantity: String(fd.get("ticket_quantity") ?? ""),
    early_price: String(fd.get("ticket_early_price") ?? ""),
    early_until: String(fd.get("ticket_early_until") ?? ""),
  };
}

/** D-087: "How do people get in?" – festival passes and/or the session's own ticket, in the session form. */
function WayIn({
  ref,
  p,
  errors,
  passAccess,
  setPassAccess,
  passNames,
  ownOn,
  setOwnOn,
  ownTicket,
  otherTickets,
  namePlaceholder,
  ticketsHref,
  sessionId,
}: {
  ref: React.Ref<HTMLFieldSetElement>;
  p: string;
  errors: Record<string, string>;
  passAccess: boolean;
  setPassAccess: (v: boolean) => void;
  passNames: string[];
  ownOn: boolean;
  setOwnOn: (v: boolean) => void;
  ownTicket: SessionTicket | null;
  otherTickets: SessionTicket[];
  namePlaceholder: string;
  ticketsHref?: string;
  sessionId: string | null;
}) {
  const locked = ownTicket?.booked ?? false;
  const several = !ownTicket && otherTickets.length > 0;
  const nobody = !passAccess && !ownOn && !several;
  return (
    <fieldset ref={ref} className="grid scroll-mt-4 gap-3 rounded-xl border-2 border-brand/30 bg-brand-soft/30 p-3">
      <legend className="px-1 text-sm font-semibold text-navy">🎫 How do people get in?</legend>
      <p className="-mt-1 text-xs text-muted-foreground">Tick one or both. Set the price here, no need to go to another tab.</p>

      <label className="flex items-start gap-3 rounded-xl border border-navy/10 bg-white p-3 text-sm">
        <Checkbox checked={passAccess} onCheckedChange={(v) => setPassAccess(v === true)} className="mt-0.5" />
        <span>
          <span className="font-medium text-navy">Festival pass holders get in</span>
          <span className="block text-xs text-muted-foreground">
            {passNames.length
              ? `${passNames.join(", ")} ${passNames.length === 1 ? "opens" : "open"} this session.`
              : "No festival pass yet. Create one on the tickets tab and it will open this session."}
          </span>
        </span>
      </label>

      {several ? (
        <div className="grid gap-2 rounded-xl border border-navy/10 bg-white p-3 text-sm">
          <p className="font-medium text-navy">Tickets for this session</p>
          <ul className="grid gap-1">
            {otherTickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                <Ticket className="size-3.5 text-brand-strong" aria-hidden />
                <span className="font-medium text-navy">{t.name}</span>
                <span className="text-muted-foreground">
                  · {formatPKR(t.price_paisa, { freeLabel: "Free" })} · {t.taken} sold
                </span>
              </li>
            ))}
          </ul>
          {ticketsHref ? (
            <Link href={`${ticketsHref}#tickets`} className="text-xs font-medium text-brand-strong underline">
              Change these on the tickets tab
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 rounded-xl border border-navy/10 bg-white p-3 text-sm">
          <label className="flex items-start gap-3">
            <Checkbox checked={ownOn} disabled={locked && ownOn} onCheckedChange={(v) => setOwnOn(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium text-navy">Sell a ticket for this session</span>
              <span className="block text-xs text-muted-foreground">
                {locked
                  ? `${ownTicket?.taken ?? 0} sold, so this ticket stays. You can still raise the quantity.`
                  : ownTicket && !ownOn
                    ? `"${ownTicket.name}" will be removed when you save.`
                    : "Opens only this session, e.g. a DJ night or a workshop. Sale ends when the session starts."}
              </span>
            </span>
          </label>
          {ownOn ? (
            <>
              {locked ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Tickets are already booked: the price is locked. Quantity can&apos;t go below{" "}
                  {ownTicket?.taken}.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_130px_130px]">
                <FormField id={`${p}-tname`} label="Ticket name" hint="Empty = the session name + ticket" error={errors.ticket_name}>
                  <Input id={`${p}-tname`} name="ticket_name" defaultValue={ownTicket?.name ?? ""} maxLength={80} placeholder={namePlaceholder} />
                </FormField>
                <FormField id={`${p}-tprice`} label="Price (Rs)" hint="0 = free" error={errors.ticket_price} required>
                  <Input
                    id={`${p}-tprice`}
                    name="ticket_price"
                    inputMode="decimal"
                    readOnly={locked}
                    defaultValue={ownTicket ? paisaToRupeesInput(ownTicket.price_paisa) : ""}
                    placeholder="e.g. 1500"
                  />
                </FormField>
                <FormField id={`${p}-tqty`} label="How many" hint="Empty = same as seats" error={errors.ticket_quantity}>
                  <Input id={`${p}-tqty`} name="ticket_quantity" type="number" inputMode="numeric" min={1} defaultValue={ownTicket?.quantity ?? ""} placeholder="e.g. 200" />
                </FormField>
              </div>
              <div className="grid gap-3 rounded-xl bg-brand-soft/60 p-3 sm:grid-cols-2">
                <FormField id={`${p}-tep`} label="🐦 Early-bird price (Rs, optional)" hint="Lower price until the date on the right" error={errors.ticket_early_price}>
                  <Input
                    id={`${p}-tep`}
                    name="ticket_early_price"
                    inputMode="decimal"
                    placeholder="e.g. 1200"
                    defaultValue={ownTicket?.early_price_paisa != null ? paisaToRupeesInput(ownTicket.early_price_paisa) : ""}
                  />
                </FormField>
                <FormField id={`${p}-teu`} label="Early bird until (PKT)" hint="Then the normal price" error={errors.ticket_early_until}>
                  <Input id={`${p}-teu`} name="ticket_early_until" type="datetime-local" defaultValue={toPKTInputValue(ownTicket?.early_until)} />
                </FormField>
              </div>
              {ticketsHref ? (
                <p className="text-xs text-muted-foreground">
                  More than one price (Student, VIP), a student-card check or sale dates?{" "}
                  {sessionId ? (
                    <Link href={`${ticketsHref}?new=session&session=${sessionId}#tickets`} className="font-medium text-brand-strong underline">
                      Add another ticket on the tickets tab
                    </Link>
                  ) : (
                    "Save first, then add more on the tickets tab."
                  )}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      )}
      {nobody ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-navy">Nobody can get in yet. Tick at least one way in.</p> : null}
    </fieldset>
  );
}

/** D-087: right after adding a session nobody can get into yet. */
function WayInFollowUp({
  followUp,
  passNames,
  passAccess,
  ticketsHref,
  onClose,
  onSellTicket,
  onIncludeInPasses,
  pending,
}: {
  followUp: { id: string; name: string };
  passNames: string[];
  passAccess: boolean;
  ticketsHref?: string;
  onClose: () => void;
  onSellTicket: () => void;
  onIncludeInPasses: () => void;
  pending: boolean;
}) {
  const noPassYet = passNames.length === 0;
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>✓ {followUp.name} saved. How do people get in?</DialogTitle>
          <DialogDescription>
            {passAccess && noPassYet
              ? `${followUp.name} is included in festival passes, but there is no pass yet. Nobody can get in until you add a pass or a ticket.`
              : "Nobody can get in yet. Choose one, you can change it any time."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button variant="brand" className="h-auto justify-start py-3 text-left" onClick={onSellTicket}>
            <span>
              <span className="block font-semibold">🎫 Sell a ticket for {followUp.name}</span>
              <span className="block text-xs font-normal opacity-90">Set the price and how many, right here</span>
            </span>
          </Button>
          {passAccess ? null : (
            <Button variant="outline" className="h-auto justify-start py-3 text-left" disabled={pending} onClick={onIncludeInPasses}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              <span>
                <span className="block font-semibold">🎟 Let festival pass holders in</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {noPassYet ? "Then create a pass on the tickets tab" : `${passNames.join(", ")} will open it`}
                </span>
              </span>
            </Button>
          )}
          {noPassYet && ticketsHref ? (
            <Button asChild variant="outline" className="h-auto justify-start py-3 text-left">
              <Link href={`${ticketsHref}?new=pass#tickets`}>
                <span>
                  <span className="block font-semibold">➕ Create a festival pass</span>
                  <span className="block text-xs font-normal text-muted-foreground">One ticket for many sessions</span>
                </span>
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

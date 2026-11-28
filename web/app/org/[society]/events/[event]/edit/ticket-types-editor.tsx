"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DoorOpen, IdCard, Lock, Pencil, Plus, Trophy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { ActionButton } from "@/components/action-button";
import { formatDateTime, formatPKR, paisaToRupeesInput, toPKTInputValue } from "@/lib/format";
import { ticketTypeSchema, type TicketTypeInput } from "@/lib/validation/event";
import { deleteTicketType, saveTicketType } from "@/app/org/_actions/events";
import { useActionTransition } from "@/lib/use-action-transition";
import { NativeSelect } from "@/components/native-select";
import { defaultSessionTicketName, groupTicketTypes, type EditorTicketType } from "@/lib/ticket-groups";

export type { EditorTicketType };

/** D-087: what a new ticket starts as (chosen before the form opens, or from a link). */
export interface NewTicketPreset {
  kind: "pass" | "session";
  sessionId?: string;
}

export interface AccessSession {
  id: string;
  name: string;
  kind: string;
  pass_access: boolean;
}

function TypeForm({
  orgSlug,
  eventId,
  type,
  onDone,
  sessions,
  askAccess,
  scheduleHref,
  festival = false,
  preset = null,
}: {
  orgSlug: string;
  eventId: string;
  type: EditorTicketType | null;
  preset?: NewTicketPreset | null;
  onDone: () => void;
  sessions: AccessSession[];
  askAccess: boolean;
  scheduleHref?: string;
  festival?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  // FES-15: festival tickets say what they open right in the form
  const choosable = sessions.filter((x) => x.kind !== "competition");
  const presetSession = preset?.kind === "session" ? choosable.find((x) => x.id === preset.sessionId) : undefined;
  const [allSessions, setAllSessions] = useState(
    type ? type.all_sessions : preset ? preset.kind === "pass" : choosable.length === 0 || choosable.some((x) => x.pass_access),
  );
  const [picked, setPicked] = useState<string[]>(type?.session_ids ?? (presetSession ? [presetSession.id] : []));
  const form = useForm<TicketTypeInput>({
    resolver: zodResolver(ticketTypeSchema),
    defaultValues: {
      name: type?.name ?? (presetSession ? defaultSessionTicketName(presetSession.name) : preset?.kind === "pass" ? "Festival pass" : ""),
      description: type?.description ?? "",
      price: type ? paisaToRupeesInput(type.price_paisa) : "0",
      quantity: type ? String(type.quantity) : "",
      sale_starts_at: toPKTInputValue(type?.sale_starts_at),
      sale_ends_at: toPKTInputValue(type?.sale_ends_at),
      requires_student_card: type?.requires_student_card ?? false,
      early_price: type?.early_price_paisa != null ? paisaToRupeesInput(type.early_price_paisa) : "",
      early_until: toPKTInputValue(type?.early_until),
    },
  });
  const { errors } = form.formState;
  const locked = type?.booked ?? false;
  const p = type ? `tt-${type.id}` : "tt-new";

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      if (askAccess && choosable.length && !allSessions && !picked.length) {
        toast.error("Choose at least one session, or make it a pass.");
        return;
      }
      const res = await saveTicketType(orgSlug, eventId, type?.id ?? null, values, askAccess && choosable.length ? { all: allSessions, sessionIds: picked } : null);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        onDone();
        router.refresh();
      } else {
        toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof TicketTypeInput, { message: v });
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border bg-secondary/40 p-4" noValidate>
      {locked ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Tickets are already booked: price and student-card setting are
          locked. Quantity can&apos;t go below {type?.taken}.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_120px]">
        <FormField id={`${p}-name`} label="Name" error={errors.name?.message} required>
          <Input placeholder="e.g. General, VIP, Student" {...fieldAria(`${p}-name`, errors.name?.message)} {...form.register("name")} />
        </FormField>
        <FormField id={`${p}-price`} label="Price (Rs)" hint="0 = free" error={errors.price?.message} required>
          <Input inputMode="decimal" disabled={locked} {...fieldAria(`${p}-price`, errors.price?.message, true)} {...form.register("price")} />
        </FormField>
        <FormField id={`${p}-quantity`} label="Quantity" error={errors.quantity?.message} required>
          <Input type="number" inputMode="numeric" min={1} {...fieldAria(`${p}-quantity`, errors.quantity?.message)} {...form.register("quantity")} />
        </FormField>
      </div>
      <FormField id={`${p}-description`} label="Description (optional)" error={errors.description?.message}>
        <Input {...fieldAria(`${p}-description`, errors.description?.message)} {...form.register("description")} />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${p}-ss`} label="Sale starts (optional)" hint="Empty = on sale once published" error={errors.sale_starts_at?.message}>
          <Input type="datetime-local" {...fieldAria(`${p}-ss`, errors.sale_starts_at?.message, true)} {...form.register("sale_starts_at")} />
        </FormField>
        <FormField id={`${p}-se`} label="Sale ends (optional)" hint={festival ? "Empty = until its session starts (passes: until the last pass session starts)" : "Empty = when the event starts"} error={errors.sale_ends_at?.message}>
          <Input type="datetime-local" {...fieldAria(`${p}-se`, errors.sale_ends_at?.message, true)} {...form.register("sale_ends_at")} />
        </FormField>
      </div>
      {/* D-072 */}
      <div className="grid gap-3 rounded-xl bg-brand-soft/60 p-3 sm:grid-cols-2">
        <FormField id={`${p}-ep`} label="🐦 Early-bird price (Rs, optional)" hint="Lower price until the date on the right" error={errors.early_price?.message}>
          <Input inputMode="decimal" placeholder="e.g. 1200" {...fieldAria(`${p}-ep`, errors.early_price?.message, true)} {...form.register("early_price")} />
        </FormField>
        <FormField id={`${p}-eu`} label="Early bird until" hint="After this the normal price applies" error={errors.early_until?.message}>
          <Input type="datetime-local" {...fieldAria(`${p}-eu`, errors.early_until?.message, true)} {...form.register("early_until")} />
        </FormField>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-navy">
        <input type="checkbox" className="size-5 accent-[#0B7D47]" disabled={locked} {...form.register("requires_student_card")} />
        Student card required (photo with payment + shown at the gate)
      </label>
      {askAccess ? (
        <fieldset className="grid gap-2 rounded-lg border border-navy/10 bg-white p-3">
          <legend className="px-1 text-sm font-semibold text-navy">What does this ticket open?</legend>
          {choosable.length ? (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1 size-4 accent-[#0B7D47]" checked={allSessions} onChange={() => setAllSessions(true)} />
                <span>
                  <span className="font-medium text-navy">All-access pass</span>
                  <span className="block text-xs text-muted-foreground">
                    Main entry + {choosable.filter((x) => x.pass_access).map((x) => x.name).join(", ") || "sessions included in passes (none yet)"}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1 size-4 accent-[#0B7D47]" checked={!allSessions} onChange={() => setAllSessions(false)} />
                <span className="font-medium text-navy">Only these sessions</span>
              </label>
              {!allSessions ? (
                <div className="grid gap-1 pl-6">
                  {choosable.map((x) => (
                    <label key={x.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#0B7D47]"
                        checked={picked.includes(x.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, x.id] : p.filter((id) => id !== x.id)))}
                      />
                      {x.name}
                    </label>
                  ))}
                </div>
              ) : null}
              {type?.booked ? <p className="text-xs text-muted-foreground">Tickets are sold: you can give more access, not less.</p> : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No sessions yet, so this ticket is for the main entry.{" "}
              {scheduleHref ? (
                <a href={scheduleHref} className="font-medium text-brand-strong underline">
                  Add sessions first
                </a>
              ) : null}{" "}
              to sell passes and session tickets.
            </p>
          )}
        </fieldset>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Saving…">{type ? "Save" : "Add ticket type"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ORG-05 / ORG-07
export function TicketTypesEditor({
  orgSlug,
  eventId,
  types,
  capacity,
  editable,
  sessions = [],
  format = "single",
  scheduleHref,
  initialNew = null,
}: {
  orgSlug: string;
  eventId: string;
  types: EditorTicketType[];
  capacity: number;
  editable: boolean;
  sessions?: AccessSession[];
  format?: string;
  scheduleHref?: string;
  /** D-087: open the new-ticket form as a pass or a ticket for one session (links from the Schedule tab) */
  initialNew?: NewTicketPreset | null;
}) {
  const askAccess = format !== "single" || sessions.length > 0;
  const choosable = sessions.filter((x) => x.kind !== "competition");
  // D-087: festivals pick "pass" or "ticket for one event" before the form opens
  const chooser = askAccess && choosable.length > 0;
  const [editing, setEditing] = useState<string | "new" | null>(initialNew ? "new" : types.length || format === "competition" || chooser ? null : "new");
  const [preset, setPreset] = useState<NewTicketPreset | null>(initialNew);
  const [pickSession, setPickSession] = useState("");
  const startNew = (p: NewTicketPreset | null) => {
    setPreset(p);
    setEditing("new");
  };
  const total = types.reduce((s, t) => s + t.quantity, 0);
  const sessionName = new Map(sessions.map((s) => [s.id, s.name]));
  const opens = (t: EditorTicketType) =>
    t.all_sessions
      ? `Pass – ${sessions.filter((s) => s.pass_access).map((s) => s.name).join(", ") || "main entry (no sessions in passes yet)"}`
      : t.session_ids.map((id) => sessionName.get(id) ?? "?").join(", ");

  const grouped = askAccess && sessions.length > 0;
  const item = (t: EditorTicketType) =>
    editing === t.id ? (
      <li key={t.id}>
        <TypeForm orgSlug={orgSlug} eventId={eventId} type={t} onDone={() => setEditing(null)} sessions={sessions} askAccess={askAccess} scheduleHref={scheduleHref} festival={format === "festival"} />
      </li>
    ) : (
      <li key={t.id} className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-navy">
            {t.name} · {formatPKR(t.price_paisa, { freeLabel: "Free" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t.quantity} tickets · {t.taken} sold/held
            {t.sale_starts_at ? ` · from ${formatDateTime(t.sale_starts_at)}` : ""}
            {t.sale_ends_at ? ` · until ${formatDateTime(t.sale_ends_at)}` : ""}
          </p>
          {t.requires_student_card ? (
            <p className="flex items-center gap-1 text-xs font-medium text-warning">
              <IdCard className="size-3.5" aria-hidden /> Student card required
            </p>
          ) : null}
          {t.registration_for ? (
            <p className="flex items-center gap-1 text-xs font-medium text-brand-strong">
              <Trophy className="size-3.5" aria-hidden /> Team entry for {t.registration_for} – change it on the Schedule tab
            </p>
          ) : sessions.length ? (
            <p className="flex items-start gap-1 text-xs text-slate-700">
              <DoorOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Opens: {opens(t)}
            </p>
          ) : null}
        </div>
        {t.registration_for ? null : editable ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(t.id)}>
              <Pencil /> Edit
            </Button>
            {!t.booked ? (
              <ActionButton
                variant="ghost"
                size="sm"
                aria-label={`Delete ${t.name}`}
                action={deleteTicketType.bind(null, orgSlug, eventId, t.id)}
                confirm={{ title: `Delete "${t.name}"?`, confirmLabel: "Delete" }}
              >
                <Trash2 />
              </ActionButton>
            ) : null}
          </div>
        ) : null}
      </li>
    );

  return (
    <div className="grid gap-3">
      {format === "festival" ? null : (
        <p className="text-sm text-muted-foreground">
          {total} of {capacity} capacity allocated to ticket types.
        </p>
      )}
      {grouped ? (
        groupTicketTypes(types, sessions.map((x) => x.id)).map((g) => (
          <section key={g.key} className="grid gap-2" aria-label={g.title}>
            <div>
              <h4 className="font-semibold text-navy">
                {g.emoji} {g.title} <span className="font-normal text-muted-foreground">({g.types.length})</span>
              </h4>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
            <ul className="grid gap-3">{g.types.map(item)}</ul>
          </section>
        ))
      ) : (
        <ul className="grid gap-3">{types.map(item)}</ul>
      )}
      {editable ? (
        editing === "new" ? (
          <TypeForm
            key={`${preset?.kind ?? "any"}-${preset?.sessionId ?? ""}`}
            orgSlug={orgSlug}
            eventId={eventId}
            type={null}
            preset={preset}
            onDone={() => setEditing(null)}
            sessions={sessions}
            askAccess={askAccess}
            scheduleHref={scheduleHref}
            festival={format === "festival"}
          />
        ) : chooser ? (
          <div className="grid gap-3 rounded-xl border border-dashed border-navy/20 p-3">
            <p className="text-sm font-semibold text-navy">Add a ticket: what is it for?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startNew({ kind: "pass" })}
                className="grid gap-1 rounded-xl border-2 border-navy/10 bg-white p-3 text-left text-sm transition-colors hover:border-brand"
              >
                <span className="font-semibold text-navy">🎟 Festival pass</span>
                <span className="text-xs text-muted-foreground">
                  One ticket for main entry and {choosable.filter((x) => x.pass_access).map((x) => x.name).join(", ") || "the sessions you include in passes"}
                </span>
              </button>
              <div className="grid gap-2 rounded-xl border-2 border-navy/10 bg-white p-3 text-sm">
                <span className="font-semibold text-navy">🎫 Ticket for one event</span>
                <span className="text-xs text-muted-foreground">Opens only that session, e.g. the DJ night</span>
                <div className="flex gap-2">
                  <NativeSelect value={pickSession} onChange={(e) => setPickSession(e.target.value)} aria-label="Which session?" className="h-9 text-sm">
                    <option value="">Which session?</option>
                    {choosable.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button type="button" size="sm" variant="brand" disabled={!pickSession} onClick={() => startNew({ kind: "session", sessionId: pickSession })}>
                    <Plus /> Add
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: a session&apos;s own ticket can also be set right in its form on the{" "}
              {scheduleHref ? (
                <a href={scheduleHref} className="font-medium text-brand-strong underline">
                  Schedule tab
                </a>
              ) : (
                "Schedule tab"
              )}
              .
            </p>
          </div>
        ) : (
          <Button variant="outline" onClick={() => startNew(null)} className="justify-self-start">
            <Plus /> Add ticket type
          </Button>
        )
      ) : null}
    </div>
  );
}

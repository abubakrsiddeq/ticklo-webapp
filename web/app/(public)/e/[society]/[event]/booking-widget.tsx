"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, DoorOpen, Gift, IdCard, Minus, Plus, Tag, X } from "lucide-react";
import { clashes, kindEmoji, type Question, priceNow } from "@/lib/sessions";
import { FormRenderer } from "@/components/sessions/form-renderer";
import { WaitlistButton, type WaitlistEntry } from "@/components/waitlist-button";
import {
  checkAnswers as checkFormAnswers,
  mergeBuiltins,
  teamPayload,
  ticketFieldsOf,
  type Answers,
  type FormField as FormFieldDef,
} from "@/lib/registration-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime, formatPKR } from "@/lib/format";
import { discountFor, discountLabel, eligibleQuantity, type DiscountType, type PricedItem } from "@/lib/referrals";
import { buyerDetailsSchema } from "@/lib/validation/profile";
import { phoneInput } from "@/lib/phone";
import { fieldErrors } from "@/lib/validation/common";
import { bookTickets, checkCode, type CodePreview } from "./actions";

export interface WidgetReferral {
  code: string;
  name: string | null;
  discountType: DiscountType;
  discountValue: number;
}

export interface WidgetTicketType {
  id: string;
  name: string;
  description: string | null;
  price_paisa: number;
  remaining: number;
  requires_student_card: boolean;
  saleState: "on" | "not_started" | "ended";
  saleStartsAt: string | null;
  // D-044
  all_sessions: boolean;
  session_ids: string[];
  // D-072
  early_price_paisa?: number | null;
  early_until?: string | null;
}

export type AttendeeSetting = "off" | "optional" | "required";

interface Holder {
  base: Answers;
  answers: Record<string, Answers>;
}

export interface WidgetSession {
  id: string;
  name: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  pass_access: boolean;
  questions: Question[];
  attendee_names?: string;
  attendee_university?: string;
  form?: unknown;
}

export function BookingWidget(props: {
  eventId: string;
  types: WidgetTicketType[];
  maxPerOrder: number;
  onSale: boolean;
  closedReason?: string;
  loggedIn: boolean;
  loginHref: string;
  needs: { full_name: string; phone: string } | null;
  referral?: WidgetReferral | null;
  sessions?: WidgetSession[];
  /** D-064: the organizer decides whether each ticket carries its holder's name / university */
  attendeeNames?: AttendeeSetting;
  attendeeUniversity?: AttendeeSetting;
  buyerName?: string;
  /** ?ticket=<id> from a session's "Get ticket" button */
  preselect?: string | null;
  /** D-065: festivals ask holder details per session */
  format?: string;
  /** D-069: the event's ticket form (single / competition events) */
  eventFields?: FormFieldDef[];
  /** D-071: my waitlist entries by ticket type, and whether sold-out tickets take a waitlist */
  waitlist?: Record<string, WaitlistEntry>;
  waitlistOpen?: boolean;
  /** server time (early-bird prices) */
  now?: number;
}) {
  // D-072: the price in force (early bird until its date) – Postgres charges the same
  const nowMs = props.now ?? 0;
  const priceOf = (t: WidgetTicketType) => priceNow(t.price_paisa, t.early_price_paisa, t.early_until, nowMs);
  const sessions = props.sessions ?? [];
  const [qty, setQty] = useState<Record<string, number>>(() => {
    const t = props.types.find((x) => x.id === props.preselect);
    return t && props.onSale && t.saleState === "on" && t.remaining > 0 ? { [t.id]: 1 } : {};
  });
  const [buyer, setBuyer] = useState(props.needs ?? { full_name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<CodePreview | null>(null);
  const [checking, startCheck] = useTransition();
  const [holders, setHolders] = useState<Record<string, Holder>>({});
  const [holderErrors, setHolderErrors] = useState<Record<string, string>>({});

  const totalQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = props.types.reduce((sum, t) => sum + (qty[t.id] ?? 0) * priceOf(t), 0);
  const needsCard = props.types.some((t) => t.requires_student_card && (qty[t.id] ?? 0) > 0);

  // FES-04/FES-09: sessions picked by name (not passes) – their questions, and time clashes
  const chosenSessionIds = new Set(props.types.filter((t) => (qty[t.id] ?? 0) > 0 && !t.all_sessions).flatMap((t) => t.session_ids));
  const chosenSessions = sessions.filter((x) => chosenSessionIds.has(x.id));
  const clashing = clashes(chosenSessions);

  // D-064 / D-069: one entry per ticket – the event's ticket form (not festivals) and the forms of the sessions
  // the ticket opens (passes: only built-in details). Built-ins are asked once, custom fields per form.
  const sessionFields = (x: WidgetSession) => ticketFieldsOf(x.form, { names: x.attendee_names, university: x.attendee_university, questions: x.questions });
  const formsFor = (t: WidgetTicketType) => {
    const list: { key: string; name: string; kind: string | null; fields: FormFieldDef[] }[] = [];
    if (props.format !== "festival" && props.eventFields) list.push({ key: "event", name: "Ticket", kind: null, fields: props.eventFields });
    for (const x of sessions) {
      if (x.kind === "competition" || !(t.all_sessions ? x.pass_access : t.session_ids.includes(x.id))) continue;
      const f = sessionFields(x);
      list.push({ key: x.id, name: x.name, kind: x.kind, fields: t.all_sessions ? f.filter((y) => y.builtin) : f });
    }
    return list;
  };
  const slots = props.types.flatMap((t) => {
    const forms = (qty[t.id] ?? 0) > 0 ? formsFor(t) : [];
    const builtins = mergeBuiltins(forms.map((f) => f.fields));
    const customs = forms.map((f) => ({ ...f, fields: f.fields.filter((y) => !y.builtin && !y.hidden) })).filter((f) => f.fields.length);
    return Array.from({ length: qty[t.id] ?? 0 }, (_, i) => ({ key: `${t.id}:${i}`, type: t, index: i, builtins, customs }));
  });
  const showSlots = slots.some((x) => x.builtins.length || x.customs.length);
  const holderOf = (key: string, first: boolean): Holder => holders[key] ?? { base: first && props.buyerName ? { name: props.buyerName } : {}, answers: {} };
  const setHolder = (key: string, first: boolean, change: (h: Holder) => Holder) => setHolders((all) => ({ ...all, [key]: change(all[key] ?? holderOf(key, first)) }));
  const sessionById = new Map(sessions.map((x) => [x.id, x]));
  const opens = (t: WidgetTicketType) =>
    t.all_sessions
      ? sessions.filter((x) => x.pass_access).length
        ? `Includes: ${sessions.filter((x) => x.pass_access && x.kind !== "competition").map((x) => x.name).join(", ")}`
        : null
      : t.session_ids.map((id) => sessionById.get(id)).filter(Boolean).map((x) => `${kindEmoji(x!.kind)} ${x!.name} · ${formatDateTime(x!.starts_at)}`).join(" | ");

  // AMB-07: same maths as Postgres – one discount per order, the bigger one wins
  const priced: PricedItem[] = props.types.map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] ?? 0, pricePaisa: priceOf(t) }));
  const ambassador = applied?.kind === "ambassador" ? applied : props.referral ? { ...props.referral, kind: "ambassador" as const } : null;
  const ambassadorDiscount = ambassador ? discountFor(priced, { type: ambassador.discountType, value: ambassador.discountValue }) : 0;
  const promo = applied?.kind === "promo" ? applied : null;
  const promoEligible = promo ? eligibleQuantity(priced, { ticketTypeIds: promo.ticketTypeIds }) : 0;
  const promoOk = promo ? promoEligible > 0 && promoEligible >= promo.minTickets : false;
  const promoDiscount = promo && promoOk ? discountFor(priced, { type: promo.discountType, value: promo.discountValue, ticketTypeIds: promo.ticketTypeIds }) : 0;
  const usePromo = promo !== null && promoOk && promoDiscount >= ambassadorDiscount;
  const discount = Math.min(total, usePromo ? promoDiscount : ambassadorDiscount);
  const discountCode = usePromo ? promo!.code : ambassador?.code;
  const payable = total - discount;

  function applyCode() {
    const value = codeInput.trim();
    if (!value) return;
    startCheck(async () => {
      const res = await checkCode(props.eventId, value);
      if (!res.ok) {
        setErrors((e) => ({ ...e, code: res.error }));
        return;
      }
      setErrors((e) => ({ ...e, code: "" }));
      setApplied(res.data ?? null);
      setCodeOpen(false);
      toast.success(res.data?.kind === "ambassador" ? `Code ${res.data.code} added` : `Promo code ${res.data?.code} added`);
    });
  }

  function change(t: WidgetTicketType, delta: number) {
    setQty((q) => {
      const current = q[t.id] ?? 0;
      const othersTotal = totalQty - current;
      const max = Math.min(t.remaining, props.maxPerOrder - othersTotal);
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...q, [t.id]: next };
    });
  }

  function book() {
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));
    if (!items.length) {
      toast.error("Choose at least one ticket.");
      return;
    }
    if (props.needs) {
      const parsed = buyerDetailsSchema.safeParse(buyer);
      setErrors((e) => ({ ...e, full_name: "", phone: "", ...(parsed.success ? {} : fieldErrors(parsed.error)) }));
      if (!parsed.success) {
        toast.error("Please add your full name and mobile number.");
        return;
      }
    }
    const errs: Record<string, string> = {};
    slots.forEach((slot, n) => {
      const h = holderOf(slot.key, n === 0);
      for (const [k, v] of Object.entries(checkFormAnswers(slot.builtins, h.base))) errs[`${slot.key}:b:${k}`] = v;
      for (const c of slot.customs) {
        for (const [k, v] of Object.entries(checkFormAnswers(c.fields, h.answers[c.key] ?? {}))) errs[`${slot.key}:${c.key}:${k}`] = v;
      }
    });
    setHolderErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please fill in the details for every ticket.");
      return;
    }
    const attendees = showSlots
      ? slots.map((slot, n) => {
          const h = holderOf(slot.key, n === 0);
          const base = teamPayload(slot.builtins, h.base);
          return {
            ticket_type_id: slot.type.id,
            ...base,
            answers: Object.fromEntries(slot.customs.map((c) => [c.key, teamPayload(c.fields, h.answers[c.key] ?? {})])),
          };
        })
      : null;
    start(async () => {
      const res = await bookTickets(props.eventId, items, props.needs ? buyer : null, applied?.code ?? null, null, attendees);
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  const renderType = (t: WidgetTicketType) => {
          const n = qty[t.id] ?? 0;
          const soldOut = t.remaining <= 0;
          const canBuy = props.onSale && t.saleState === "on" && !soldOut;
          return (
            <li key={t.id} className="rounded-2xl border border-navy/10 p-4 transition-colors hover:border-brand/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{t.name}</p>
                  <p className="text-sm font-semibold">
                    {formatPKR(priceOf(t), { freeLabel: "Free" })}
                    {priceOf(t) < t.price_paisa ? (
                      <>
                        {" "}
                        <span className="font-normal text-muted-foreground line-through">{formatPKR(t.price_paisa)}</span>
                        <span className="ml-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-strong">
                          🐦 Early bird until {formatDateTime(t.early_until!)}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {t.description ? <p className="mt-1 text-sm text-muted-foreground">{t.description}</p> : null}
                  {sessions.length && opens(t) ? (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-700">
                      <DoorOpen className="mt-0.5 size-3.5 shrink-0 text-brand-strong" aria-hidden />
                      {opens(t)}
                    </p>
                  ) : null}
                  {/* EVT-05 */}
                  {t.requires_student_card ? (
                    <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-warning">
                      <IdCard className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Student card required: upload a photo with your payment and show it at the gate.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {soldOut
                      ? null
                      : t.saleState === "not_started" && t.saleStartsAt
                        ? `Sale starts ${formatDateTime(t.saleStartsAt)}`
                        : t.saleState === "ended"
                          ? "Sale ended"
                          : t.remaining <= 20
                            ? `Only ${t.remaining} left`
                            : `${t.remaining} available`}
                  </p>
                  {/* D-071 */}
                  {soldOut && props.waitlistOpen && t.saleState !== "ended" ? (
                    <WaitlistButton ticketTypeId={t.id} entry={props.waitlist?.[t.id]} loggedIn={props.loggedIn} loginHref={props.loginHref} className="mt-2" />
                  ) : null}
                </div>
                {soldOut ? (
                  <span className="shrink-0 rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-red-800">Sold out</span>
                ) : canBuy && props.loggedIn ? (
                  <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Quantity for ${t.name}`}>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => change(t, -1)} disabled={n === 0} aria-label={`Remove one ${t.name}`}>
                      <Minus />
                    </Button>
                    <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">{n}</span>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => change(t, 1)} aria-label={`Add one ${t.name}`}>
                      <Plus />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
  };

  // D-070: a festival's sidebar in parts – passes, tickets for one event, other entry
  const festival = props.format === "festival";
  const firstStart = (t: WidgetTicketType) =>
    t.session_ids.map((id) => sessionById.get(id)?.starts_at ?? "").filter(Boolean).sort()[0] ?? "";
  const groups = [
    { key: "passes", title: "🎟 Festival passes", types: props.types.filter((t) => t.all_sessions) },
    {
      key: "single",
      title: "🎫 Tickets for one event",
      types: props.types.filter((t) => !t.all_sessions && t.session_ids.length).sort((a, b) => firstStart(a).localeCompare(firstStart(b))),
    },
    { key: "entry", title: "🚪 Entry tickets", types: props.types.filter((t) => !t.all_sessions && !t.session_ids.length) },
  ];
  const onSaleTypes = props.types.filter((t) => t.saleState === "on" && t.remaining > 0);
  const fromPrice = onSaleTypes.length ? Math.min(...onSaleTypes.map((t) => priceOf(t))) : null;

  return (
    <section id="tickets" aria-labelledby="tickets-heading" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-lift ring-1 ring-navy/[0.06] sm:p-6">
      <h2 id="tickets-heading" className="font-heading text-xl font-bold text-navy">
        {festival ? "Get in" : "Tickets"}
      </h2>
      {fromPrice !== null && props.types.length > 1 ? (
        <p className="mt-0.5 text-sm text-muted-foreground">From {formatPKR(fromPrice, { freeLabel: "Free" })}</p>
      ) : null}
      <div className="mb-4" />
      {Object.values(props.waitlist ?? {}).some((w) => w.status === "offered") ? (
        <p className="mb-4 rounded-2xl bg-brand-soft p-3 text-sm font-medium text-navy">
          🎉 A place opened for you from the waitlist – it is held for you only, book it below.
        </p>
      ) : null}
      {ambassador && !applied ? (
        <p className="mb-4 flex items-start gap-2 rounded-2xl bg-brand-soft p-3 text-sm text-navy">
          <Gift className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
          <span>
            {ambassador.name ? <strong>{ambassador.name}</strong> : "A friend"} invited you
            {discountLabel(ambassador.discountType, ambassador.discountValue) ? ` · ${discountLabel(ambassador.discountType, ambassador.discountValue)}` : ""}
          </span>
        </p>
      ) : null}
      {festival ? (
        <div className="grid gap-5">
          {groups.map((g) =>
            g.types.length ? (
              <div key={g.key} className="grid gap-2">
                <p className="text-sm font-semibold text-navy">{g.title}</p>
                <ul className="grid gap-3">{g.types.map(renderType)}</ul>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <ul className="grid gap-3">{props.types.map(renderType)}</ul>
      )}

      {!props.onSale ? (
        <p className="mt-4 rounded-lg bg-secondary p-3 text-sm font-medium text-navy">{props.closedReason ?? "Ticket sale is closed."}</p>
      ) : !props.loggedIn ? (
        <Button asChild variant="brand" size="lg" className="mt-4 w-full">
          <Link href={props.loginHref}>Log in to book</Link>
        </Button>
      ) : (
        <div className="mt-4 grid gap-3">
          {props.needs ? (
            <div className="grid gap-3 rounded-lg bg-secondary/60 p-3">
              <p className="text-sm font-medium text-navy">Your details (needed for the ticket)</p>
              <FormField id="buyer_name" label="Full name" error={errors.full_name}>
                <Input value={buyer.full_name} onChange={(e) => setBuyer({ ...buyer, full_name: e.target.value })} maxLength={100} autoComplete="name" {...fieldAria("buyer_name", errors.full_name)} />
              </FormField>
              <FormField id="buyer_phone" label="Mobile number" error={errors.phone}>
                <Input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: phoneInput(e.target.value) })} maxLength={16} type="tel" inputMode="tel" placeholder="0300 1234567" autoComplete="tel" {...fieldAria("buyer_phone", errors.phone)} />
              </FormField>
            </div>
          ) : null}
          {clashing.length ? (
            <p className="flex items-start gap-1.5 rounded-xl bg-warning-soft p-3 text-xs text-navy">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span>
                These run at the same time: {clashing.map(([a, b]) => `${a.name} & ${b.name}`).join("; ")}. You can still book, but you can only be in one place.
              </span>
            </p>
          ) : null}
          {showSlots
            ? slots.map((slot, n) => {
                const h = holderOf(slot.key, n === 0);
                const errsOf = (prefix: string) =>
                  Object.fromEntries(Object.entries(holderErrors).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
                return (
                  <fieldset key={slot.key} className="grid gap-3 rounded-lg bg-secondary/60 p-3">
                    <legend className="text-sm font-medium text-navy">
                      Ticket {n + 1} · {slot.type.name}
                    </legend>
                    {slot.builtins.length ? (
                      <FormRenderer
                        fields={slot.builtins}
                        answers={h.base}
                        errors={errsOf(`${slot.key}:b:`)}
                        prefix={`h-${slot.key}`}
                        onChange={(id, v) => setHolder(slot.key, n === 0, (x) => ({ ...x, base: { ...x.base, [id]: v } }))}
                      />
                    ) : null}
                    {slot.customs.map((c) => (
                      <div key={c.key} className="grid gap-2">
                        {c.kind ? (
                          <p className="text-xs font-semibold text-navy">
                            {kindEmoji(c.kind)} {c.name}
                          </p>
                        ) : null}
                        <FormRenderer
                          fields={c.fields}
                          answers={h.answers[c.key] ?? {}}
                          errors={errsOf(`${slot.key}:${c.key}:`)}
                          prefix={`a-${slot.key}-${c.key}`}
                          onChange={(id, v) => setHolder(slot.key, n === 0, (x) => ({ ...x, answers: { ...x.answers, [c.key]: { ...(x.answers[c.key] ?? {}), [id]: v } } }))}
                        />
                      </div>
                    ))}
                  </fieldset>
                );
              })
            : null}
          {applied ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm text-navy">
              <span className="flex min-w-0 items-center gap-2">
                <Tag className="size-4 shrink-0 text-brand-strong" aria-hidden />
                <span className="truncate">
                  <strong className="font-mono">{applied.code}</strong>
                  {applied.kind === "ambassador" && applied.name ? ` · ${applied.name}` : ""}
                  {discountLabel(applied.discountType, applied.discountValue) ? ` · ${discountLabel(applied.discountType, applied.discountValue)}` : ""}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setApplied(null)} aria-label="Remove code">
                <X />
              </Button>
            </div>
          ) : codeOpen ? (
            <FormField id="promo_code" label="Promo or ambassador code" error={errors.code || undefined}>
              <div className="flex gap-2">
                <Input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCode();
                    }
                  }}
                  placeholder="e.g. EARLYBIRD"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={20}
                  className="font-mono uppercase"
                  {...fieldAria("promo_code", errors.code || undefined)}
                />
                <SubmitButton type="button" variant="outline" onClick={applyCode} pending={checking} pendingText="…">
                  Apply
                </SubmitButton>
              </div>
            </FormField>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)} className="flex items-center gap-1.5 justify-self-start text-sm font-medium text-brand-strong hover:underline">
              <Tag className="size-4" aria-hidden /> Have a promo or ambassador code?
            </button>
          )}
          {promo && !promoOk && totalQty > 0 ? (
            <p className="text-xs text-warning">
              {promoEligible === 0 ? `${promo.code} does not work for the tickets you chose.` : `Choose at least ${promo.minTickets} tickets to use ${promo.code}.`}
            </p>
          ) : null}
          {discount > 0 ? (
            <div className="grid gap-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Tickets</span>
                <span className="tabular-nums">{formatPKR(total)}</span>
              </div>
              <div className="flex justify-between font-medium text-brand-strong">
                <span>Discount{discountCode ? ` (${discountCode})` : ""}</span>
                <span className="tabular-nums">−{formatPKR(discount)}</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {totalQty} ticket{totalQty === 1 ? "" : "s"} · max {props.maxPerOrder} per order
            </span>
            <span className="text-lg font-bold text-navy">{formatPKR(payable, { freeLabel: totalQty ? "Free" : "Rs 0" })}</span>
          </div>
          {needsCard ? <p className="text-xs text-warning">You will upload a student card photo on the next step.</p> : null}
          <SubmitButton type="button" onClick={book} pending={pending} pendingText="Booking…" variant="brand" size="lg" disabled={totalQty === 0} className="w-full">
            {payable === 0 && totalQty > 0 && !needsCard ? "Get free tickets" : "Book"}
          </SubmitButton>
          {payable > 0 ? (
            <p className="text-center text-xs text-muted-foreground">Tickets are held for 60 minutes while you pay.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

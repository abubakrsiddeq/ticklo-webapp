"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { IdCard, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime, formatPKR } from "@/lib/format";
import { bookTickets } from "./actions";

export interface WidgetTicketType {
  id: string;
  name: string;
  description: string | null;
  price_paisa: number;
  remaining: number;
  requires_student_card: boolean;
  saleState: "on" | "not_started" | "ended";
  saleStartsAt: string | null;
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
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState(props.needs ?? { full_name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const totalQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = useMemo(
    () => props.types.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.price_paisa, 0),
    [qty, props.types],
  );
  const needsCard = props.types.some((t) => t.requires_student_card && (qty[t.id] ?? 0) > 0);

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
    start(async () => {
      const res = await bookTickets(props.eventId, items, props.needs ? buyer : null);
      if (res && !res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <section aria-labelledby="tickets-heading" className="rounded-3xl bg-white p-5 shadow-lift ring-1 ring-navy/[0.06] sm:p-6">
      <h2 id="tickets-heading" className="mb-4 font-heading text-xl font-bold text-navy">
        Tickets
      </h2>
      <ul className="grid gap-3">
        {props.types.map((t) => {
          const n = qty[t.id] ?? 0;
          const soldOut = t.remaining <= 0;
          const canBuy = props.onSale && t.saleState === "on" && !soldOut;
          return (
            <li key={t.id} className="rounded-2xl border border-navy/10 p-4 transition-colors hover:border-brand/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-navy">{t.name}</p>
                  <p className="text-sm font-semibold">{formatPKR(t.price_paisa, { freeLabel: "Free" })}</p>
                  {t.description ? <p className="mt-1 text-sm text-muted-foreground">{t.description}</p> : null}
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
        })}
      </ul>

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
                <Input value={buyer.full_name} onChange={(e) => setBuyer({ ...buyer, full_name: e.target.value })} autoComplete="name" {...fieldAria("buyer_name", errors.full_name)} />
              </FormField>
              <FormField id="buyer_phone" label="Mobile number" error={errors.phone}>
                <Input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} type="tel" inputMode="tel" placeholder="0300 1234567" autoComplete="tel" {...fieldAria("buyer_phone", errors.phone)} />
              </FormField>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {totalQty} ticket{totalQty === 1 ? "" : "s"} · max {props.maxPerOrder} per order
            </span>
            <span className="text-lg font-bold text-navy">{formatPKR(total, { freeLabel: totalQty ? "Free" : "Rs 0" })}</span>
          </div>
          {needsCard ? <p className="text-xs text-warning">You will upload a student card photo on the next step.</p> : null}
          <SubmitButton type="button" onClick={book} pending={pending} pendingText="Booking…" variant="brand" size="lg" disabled={totalQty === 0} className="w-full">
            {total === 0 && totalQty > 0 && !needsCard ? "Get free tickets" : "Book"}
          </SubmitButton>
          {total > 0 ? (
            <p className="text-center text-xs text-muted-foreground">Tickets are held for 60 minutes while you pay.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

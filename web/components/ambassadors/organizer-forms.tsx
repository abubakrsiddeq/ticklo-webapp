"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Gift, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { paisaToRupeesInput, toPKTInputValue } from "@/lib/format";
import type { ActionResult } from "@/lib/errors";
import type { Milestone } from "@/lib/referrals";
import {
  addReferralPayout,
  decideApplication,
  deletePromoCode,
  deleteReferralPayout,
  savePromoCode,
  saveReferralSettings,
  setPromoActive,
  setSellerCode,
} from "@/app/org/_actions/ambassadors";

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

const valueInput = (type: string, value: number) => (type === "fixed" ? paisaToRupeesInput(value) : type === "percent" ? String(value) : "");

/** AMB-01/AMB-06/AMB-07/AMB-09: the program settings. */
export function ProgramSettingsForm({
  orgSlug,
  eventId,
  settings,
  disabled,
}: {
  orgSlug: string;
  eventId: string;
  settings: {
    reward_type: string;
    reward_value: number;
    discount_type: string;
    discount_value: number;
    credit_on: string;
    leaderboard: boolean;
    applications_open: boolean;
    milestones: Milestone[];
  };
  disabled?: boolean;
}) {
  const { pending, run } = useAction();
  const [rewardType, setRewardType] = useState(settings.reward_type);
  const [discountType, setDiscountType] = useState(settings.discount_type);
  const [milestones, setMilestones] = useState<{ tickets: string; reward: string }[]>(
    settings.milestones.length ? settings.milestones.map((m) => ({ tickets: String(m.tickets), reward: m.reward })) : [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(async () => {
          const res = await saveReferralSettings(orgSlug, eventId, fd);
          setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
          return res;
        });
      }}
    >
      <fieldset disabled={disabled || pending} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <FormField id="reward_type" label="Reward for ambassadors" hint="Paid by your society – TickLO only keeps the count.">
              <NativeSelect id="reward_type" name="reward_type" value={rewardType} onChange={(e) => setRewardType(e.target.value)}>
                <option value="none">No money reward (milestones / recognition only)</option>
                <option value="fixed">Rupees per ticket</option>
                <option value="percent">Percent of the money they bring</option>
              </NativeSelect>
            </FormField>
            {rewardType !== "none" ? (
              <FormField id="reward_value" label={rewardType === "fixed" ? "Rs per ticket" : "Percent (1–100)"} error={errors.reward_value}>
                <Input id="reward_value" name="reward_value" inputMode="decimal" defaultValue={valueInput(settings.reward_type === rewardType ? rewardType : "", settings.reward_value)} placeholder={rewardType === "fixed" ? "50" : "5"} required />
              </FormField>
            ) : null}
          </div>
          <div className="grid gap-2">
            <FormField id="discount_type" label="Discount for buyers who use an ambassador link/code" hint="Gives friends a reason to use the link.">
              <NativeSelect id="discount_type" name="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
                <option value="none">No discount</option>
                <option value="fixed">Rupees off each ticket</option>
                <option value="percent">Percent off</option>
              </NativeSelect>
            </FormField>
            {discountType !== "none" ? (
              <FormField id="discount_value" label={discountType === "fixed" ? "Rs off each ticket" : "Percent (1–100)"} error={errors.discount_value}>
                <Input id="discount_value" name="discount_value" inputMode="decimal" defaultValue={valueInput(settings.discount_type === discountType ? discountType : "", settings.discount_value)} placeholder={discountType === "fixed" ? "100" : "10"} required />
              </FormField>
            ) : null}
          </div>
        </div>

        <FormField id="credit_on" label="When does a ticket count for the ambassador?">
          <NativeSelect id="credit_on" name="credit_on" defaultValue={settings.credit_on}>
            <option value="approved">When the payment is approved (paper: when sold)</option>
            <option value="checked_in">Only when the ticket is scanned at the gate (stops fake bookings)</option>
          </NativeSelect>
        </FormField>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-navy">Milestones (optional)</p>
          <p className="-mt-1 text-xs text-muted-foreground">e.g. 10 tickets → free ticket, 25 → backstage pass. Ambassadors see a progress bar.</p>
          {milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                name="milestone_tickets"
                aria-label={`Milestone ${i + 1}: tickets`}
                inputMode="numeric"
                className="w-24"
                value={m.tickets}
                placeholder="10"
                onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, tickets: e.target.value } : x)))}
              />
              <span className="text-sm text-muted-foreground">tickets →</span>
              <Input
                name="milestone_reward"
                aria-label={`Milestone ${i + 1}: reward`}
                maxLength={80}
                value={m.reward}
                placeholder="Free ticket"
                onChange={(e) => setMilestones((all) => all.map((x, j) => (j === i ? { ...x, reward: e.target.value } : x)))}
              />
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove milestone" onClick={() => setMilestones((all) => all.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          {errors.milestones ? <p className="text-sm text-destructive">{errors.milestones}</p> : null}
          {milestones.length < 10 ? (
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setMilestones((all) => [...all, { tickets: "", reward: "" }])}>
              <Plus /> Add milestone
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
            <Checkbox name="leaderboard" defaultChecked={settings.leaderboard} className="mt-0.5" />
            <span>
              <span className="font-medium text-navy">Show the leaderboard</span>
              <span className="block text-xs text-muted-foreground">Ambassadors see the top 10 (first name + initial) and their rank.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
            <Checkbox name="applications_open" defaultChecked={settings.applications_open} className="mt-0.5" />
            <span>
              <span className="font-medium text-navy">Take applications</span>
              <span className="block text-xs text-muted-foreground">Shows “Become an ambassador” on the event page. You accept each one.</span>
            </span>
          </label>
        </div>

        <Button type="submit" variant="brand" className="justify-self-start">
          {pending ? <Loader2 className="animate-spin" /> : null} Save program
        </Button>
      </fieldset>
    </form>
  );
}

/** AMB-02: change an ambassador's code. */
export function CodeDialog({ orgSlug, sellerId, code, name }: { orgSlug: string; sellerId: string; code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const { pending, run } = useAction();
  return (
    <>
      <Button size="icon-xs" variant="ghost" aria-label={`Change ${name}'s code`} onClick={() => setOpen(true)}>
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("code") ?? "");
              run(async () => {
                const res = await setSellerCode(orgSlug, sellerId, value);
                setError(res.ok ? undefined : res.error);
                return res;
              }, () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>Code for {name}</DialogTitle>
              <DialogDescription>3–16 letters or digits. Links already shared with the old code stop working.</DialogDescription>
            </DialogHeader>
            <FormField id="amb-code" label="Code" error={error}>
              <Input id="amb-code" name="code" defaultValue={code} maxLength={16} className="font-mono uppercase" autoCapitalize="characters" autoComplete="off" required />
            </FormField>
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

export interface PromoFormValue {
  id: string;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: number;
  max_uses: number | null;
  min_tickets: number;
  ticket_type_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  note: string | null;
}

/** AMB-07: create or edit a promo code. */
export function PromoDialog({
  orgSlug,
  eventId,
  ticketTypes,
  promo,
}: {
  orgSlug: string;
  eventId: string;
  ticketTypes: { id: string; name: string }[];
  promo?: PromoFormValue;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"fixed" | "percent">(promo?.discount_type ?? "percent");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <>
      {promo ? (
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${promo.code}`} onClick={() => setOpen(true)}>
          <Pencil />
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus /> New promo code
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (promo) fd.set("id", promo.id);
              run(async () => {
                const res = await savePromoCode(orgSlug, eventId, fd);
                setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
                return res;
              }, () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>{promo ? `Edit ${promo.code}` : "New promo code"}</DialogTitle>
              <DialogDescription>Buyers type it at checkout. One discount per order – if an ambassador discount is bigger, that one is used.</DialogDescription>
            </DialogHeader>
            <FormField id="promo-code" label="Code" error={errors.code} required>
              <Input id="promo-code" name="code" defaultValue={promo?.code} maxLength={16} placeholder="EARLYBIRD" className="font-mono uppercase" autoCapitalize="characters" autoComplete="off" required />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="promo-type" label="Discount">
                <NativeSelect id="promo-type" name="discount_type" value={type} onChange={(e) => setType(e.target.value as "fixed" | "percent")}>
                  <option value="percent">Percent off</option>
                  <option value="fixed">Rs off each ticket</option>
                </NativeSelect>
              </FormField>
              <FormField id="promo-value" label={type === "percent" ? "Percent (1–100)" : "Rs off each ticket"} error={errors.discount_value} required>
                <Input
                  id="promo-value"
                  name="discount_value"
                  inputMode="decimal"
                  defaultValue={promo && promo.discount_type === type ? valueInput(type, promo.discount_value) : ""}
                  placeholder={type === "percent" ? "20" : "200"}
                  required
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="promo-max" label="Max uses (orders)" hint="Empty = no limit" error={errors.max_uses}>
                <Input id="promo-max" name="max_uses" inputMode="numeric" defaultValue={promo?.max_uses ?? ""} placeholder="100" />
              </FormField>
              <FormField id="promo-min" label="Minimum tickets" hint="Group deal, e.g. 4" error={errors.min_tickets}>
                <Input id="promo-min" name="min_tickets" inputMode="numeric" defaultValue={promo?.min_tickets ?? 1} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="promo-start" label="Starts (PKT)" hint="Empty = now">
                <Input id="promo-start" name="starts_at" type="datetime-local" defaultValue={toPKTInputValue(promo?.starts_at)} />
              </FormField>
              <FormField id="promo-end" label="Ends (PKT)" hint="Empty = until sale ends">
                <Input id="promo-end" name="ends_at" type="datetime-local" defaultValue={toPKTInputValue(promo?.ends_at)} />
              </FormField>
            </div>
            {ticketTypes.length > 1 ? (
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium text-navy">Works for (none ticked = all tickets)</legend>
                {ticketTypes.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="ticket_type_ids" value={t.id} defaultChecked={promo?.ticket_type_ids?.includes(t.id) ?? false} />
                    {t.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <FormField id="promo-note" label="Note for your team (optional)">
              <Input id="promo-note" name="note" defaultValue={promo?.note ?? ""} maxLength={120} placeholder="e.g. for FAST students" />
            </FormField>
            <input type="hidden" name="active" value={promo && !promo.active ? "off" : "on"} />
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

export function PromoActions({ orgSlug, promoId, code, active, used }: { orgSlug: string; promoId: string; code: string; active: boolean; used: boolean }) {
  const { pending, run } = useAction();
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={active ? `Turn off ${code}` : `Turn on ${code}`} disabled={pending} onClick={() => run(() => setPromoActive(orgSlug, promoId, !active))}>
        <Power className={active ? "text-brand-strong" : "text-muted-foreground"} />
      </Button>
      {!used ? (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${code}`}
          disabled={pending}
          onClick={() => window.confirm(`Delete ${code}?`) && run(() => deletePromoCode(orgSlug, promoId))}
        >
          <Trash2 className="text-destructive" />
        </Button>
      ) : null}
    </>
  );
}

/** AMB-06: record a reward handed over (money, or 0 with a note like "VIP pass"). */
export function PayoutDialog({ orgSlug, eventId, sellerId, name, due }: { orgSlug: string; eventId: string; sellerId: string; name: string; due: string | null }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Gift /> Reward given
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("sellerId", sellerId);
              run(async () => {
                const res = await addReferralPayout(orgSlug, eventId, fd);
                setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
                return res;
              }, () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>Reward given – {name}</DialogTitle>
              <DialogDescription>{due ? `Still due: ${due}. ` : ""}Write what your society gave. A gift without money? Leave the amount empty and describe it.</DialogDescription>
            </DialogHeader>
            <FormField id="payout-amount" label="Amount (Rs)" error={errors.amount}>
              <Input id="payout-amount" name="amount" inputMode="decimal" placeholder="1280" autoComplete="off" />
            </FormField>
            <FormField id="payout-note" label="Note" error={errors.note}>
              <Input id="payout-note" name="note" maxLength={200} placeholder="e.g. JazzCash, or VIP pass" />
            </FormField>
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

export function DeletePayoutButton({ orgSlug, payoutId }: { orgSlug: string; payoutId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="icon-xs" variant="ghost" aria-label="Delete entry" disabled={pending} onClick={() => window.confirm("Delete this reward entry?") && run(() => deleteReferralPayout(orgSlug, payoutId))}>
      <Trash2 className="text-destructive" />
    </Button>
  );
}

/** AMB-11: accept or decline an application. */
export function ApplicationButtons({ orgSlug, applicationId, name }: { orgSlug: string; applicationId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="brand" disabled={pending} onClick={() => run(() => decideApplication(orgSlug, applicationId, true))}>
        <Check /> Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => window.confirm(`Decline ${name}?`) && run(() => decideApplication(orgSlug, applicationId, false))}>
        Decline
      </Button>
    </div>
  );
}

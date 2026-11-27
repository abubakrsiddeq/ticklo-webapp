"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Lock, Pencil, Plus, Trash2, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { cn } from "@/lib/utils";
import { SALE_METHODS } from "@/lib/print/sales";
import type { ActionResult } from "@/lib/errors";
import {
  addPrintCash,
  deletePrintCash,
  deletePrintSeller,
  printedRangeAction,
  savePrintSeller,
  settlePrintSeller,
} from "@/app/org/_actions/print-sales";
import { useActionTransition } from "@/lib/use-action-transition";

export interface SellerOption {
  id: string;
  name: string;
  settled: boolean;
}

export interface TeamOption {
  user_id: string;
  name: string;
}

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

/** Add or edit a seller: a team member (sells on their own phone) or an outside person (name + phone). */
export function SellerDialog({
  orgSlug,
  eventId,
  team,
  seller,
  trigger,
  addLabel = "Add seller",
}: {
  orgSlug: string;
  eventId: string;
  team: TeamOption[];
  seller?: { id: string; name: string; phone: string | null; userId: string | null };
  trigger: "add" | "edit";
  addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // D-043: an ambassador who joined by application uses their own account but is not in the team
  const ownAccount = seller?.userId && !team.some((t) => t.user_id === seller.userId) ? seller.userId : null;
  const [userId, setUserId] = useState(seller?.userId ?? "");
  const { pending, run } = useAction();
  return (
    <>
      {trigger === "add" ? (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus /> {addLabel}
        </Button>
      ) : (
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${seller?.name}`} onClick={() => setOpen(true)}>
          <Pencil />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (seller) fd.set("sellerId", seller.id);
              run(() => savePrintSeller(orgSlug, eventId, fd), () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>{seller ? `Edit ${seller.name}` : addLabel}</DialogTitle>
              <DialogDescription>
                A team member can mark sales on their own phone (Sell screen). For an outside seller, just write their name – you mark their sales and returns here.
              </DialogDescription>
            </DialogHeader>
            <FormField id="seller-user" label="Team member (optional)" hint="Only people in your society team can log in to sell.">
              <NativeSelect id="seller-user" name="userId" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Outside person (no account)</option>
                {ownAccount ? <option value={ownAccount}>{seller?.name} (own account)</option> : null}
                {team.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="seller-name" label="Name" hint={userId ? "Leave empty to use their profile name." : undefined}>
              <Input id="seller-name" name="name" defaultValue={seller?.name ?? ""} maxLength={80} required={!userId} autoComplete="off" />
            </FormField>
            <FormField id="seller-phone" label="Phone (optional)">
              <Input id="seller-phone" name="phone" defaultValue={seller?.phone ?? ""} maxLength={16} type="tel" placeholder="0300 1234567" inputMode="tel" autoComplete="off" />
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

const RANGE_ACTIONS = [
  { key: "assign", label: "Give to seller", hint: "Hand a range of tickets to a seller (only tickets still in stock move)." },
  { key: "sell", label: "Mark sold", hint: "Tickets sold and paid. Tickets found at the gate get the payment method filled in." },
  { key: "comp", label: "Free pass", hint: "Guests, sponsors, team – they get in, no money." },
  { key: "return", label: "Return unsold", hint: "Seller gave them back: they stop working at the gate and the places go back on sale." },
  { key: "undo", label: "Undo sale", hint: "Marked sold or free pass by mistake (not for tickets already used at the gate)." },
] as const;

/** One form for all serial-range actions. */
export function RangeActionForm({ orgSlug, eventId, sellers, examplePrefix }: { orgSlug: string; eventId: string; sellers: SellerOption[]; examplePrefix: string }) {
  const [action, setAction] = useState<(typeof RANGE_ACTIONS)[number]["key"]>("assign");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { pending, run } = useAction();
  const single = !to || to === from;
  const current = RANGE_ACTIONS.find((a) => a.key === action)!;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("action", action);
        if (action === "return" && !window.confirm("Returned tickets stop working at the gate and their places go back on sale. Continue?")) return;
        run(() => printedRangeAction(orgSlug, eventId, fd), () => {
          setFrom("");
          setTo("");
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What to do">
        {RANGE_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={action === a.key}
            onClick={() => setAction(a.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              action === a.key ? "border-navy bg-navy text-white" : "border-input bg-white text-navy hover:bg-muted",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{current.hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="r-from" label="From serial" required>
          <Input id="r-from" name="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder={`${examplePrefix}-0001`} className="font-mono" autoComplete="off" required />
        </FormField>
        <FormField id="r-to" label="To serial (optional)">
          <Input id="r-to" name="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={`${examplePrefix}-0025`} className="font-mono" autoComplete="off" />
        </FormField>
        {action === "assign" ? (
          <FormField id="r-seller" label="Seller" className="sm:col-span-2">
            <NativeSelect id="r-seller" name="sellerId" defaultValue={sellers.find((s) => !s.settled)?.id ?? ""}>
              <option value="">Organizer (take back from seller)</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id} disabled={s.settled}>
                  {s.name}
                  {s.settled ? " (account closed)" : ""}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        {action === "sell" ? (
          <FormField id="r-method" label="Paid by">
            <NativeSelect id="r-method" name="method" defaultValue="cash">
              {SALE_METHODS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : null}
        {(action === "sell" || action === "comp") && single ? (
          <>
            <FormField id="r-buyer" label="Buyer name (optional)">
              <Input id="r-buyer" name="buyerName" maxLength={80} autoComplete="off" />
            </FormField>
            <FormField id="r-buyer-phone" label="Buyer phone (optional)">
              <Input id="r-buyer-phone" name="buyerPhone" maxLength={16} type="tel" placeholder="0300 1234567" inputMode="tel" autoComplete="off" />
            </FormField>
          </>
        ) : null}
        {action === "return" ? (
          <FormField id="r-note" label="Note (optional)" className="sm:col-span-2">
            <Input id="r-note" name="note" maxLength={200} placeholder="e.g. Ali – unsold after the event" />
          </FormField>
        ) : null}
      </div>
      <Button type="submit" variant={action === "return" ? "destructive" : "brand"} disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : null} {current.label}
      </Button>
    </form>
  );
}

/** Record money received from a seller (or the organizer desk). A minus amount corrects a mistake. */
export function CashDialog({ orgSlug, eventId, sellerId, sellerName, disabled }: { orgSlug: string; eventId: string; sellerId: string | null; sellerName: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={disabled}>
        <Banknote /> Money received
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (sellerId) fd.set("sellerId", sellerId);
              run(() => addPrintCash(orgSlug, eventId, fd), () => setOpen(false));
            }}
          >
            <DialogHeader>
              <DialogTitle>Money received – {sellerName}</DialogTitle>
              <DialogDescription>Write each handover separately. Made a mistake? Add the same amount with a minus (e.g. -2000).</DialogDescription>
            </DialogHeader>
            <FormField id="cash-amount" label="Amount (Rs)" required>
              <Input id="cash-amount" name="amount" inputMode="decimal" placeholder="78000" required autoComplete="off" />
            </FormField>
            <FormField id="cash-method" label="How">
              <NativeSelect id="cash-method" name="method" defaultValue="cash">
                {SALE_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="cash-note" label="Note (optional)">
              <Input id="cash-note" name="note" maxLength={200} placeholder="e.g. first part, after day 1" />
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

export function SettleButton({ orgSlug, sellerId, settled, owes }: { orgSlug: string; sellerId: string; settled: boolean; owes: string | null }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant={settled ? "ghost" : "default"}
      disabled={pending}
      onClick={() => {
        const msg = settled
          ? "Reopen this account? You can then change its tickets and money again."
          : owes
            ? `This seller still owes ${owes}. Close the account anyway? It will be locked.`
            : "Close and lock this account? Tickets and money can't change until you reopen it.";
        if (window.confirm(msg)) run(() => settlePrintSeller(orgSlug, sellerId, !settled));
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : settled ? <Unlock /> : <Lock />} {settled ? "Reopen" : "Close account"}
    </Button>
  );
}

export function DeleteSellerButton({ orgSlug, sellerId, name }: { orgSlug: string; sellerId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() => window.confirm(`Remove ${name}? Only possible when they have no tickets or money entries.`) && run(() => deletePrintSeller(orgSlug, sellerId))}
    >
      <Trash2 className="text-destructive" />
    </Button>
  );
}

export function DeleteCashButton({ orgSlug, entryId }: { orgSlug: string; entryId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="icon-xs" variant="ghost" aria-label="Delete entry" disabled={pending} onClick={() => window.confirm("Delete this money entry?") && run(() => deletePrintCash(orgSlug, entryId))}>
      <Trash2 className="text-destructive" />
    </Button>
  );
}

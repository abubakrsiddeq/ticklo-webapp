"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { setPrintedTicketBuyer, voidPrintedTickets } from "@/app/org/_actions/print";
import { formatPhone } from "@/lib/phone";

export interface BatchTicketRow {
  id: string;
  serial: string;
  serialNo: number;
  status: string;
  buyer: string | null;
  phone: string | null;
  checkedIn: string | null;
  checkedInBy: string | null;
  sale: string; // "In stock", "Sold · Cash", "Free pass", "Returned"
  seller: string | null;
}

/** PRT-08: who has which printed ticket, and who came in. */
export function BatchTickets({ orgSlug, rows, canEdit }: { orgSlug: string; rows: BatchTicketRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "valid" | "checked_in" | "cancelled">("all");
  const [editing, setEditing] = useState<BatchTicketRow | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || r.serial.toLowerCase().includes(needle) || (r.buyer ?? "").toLowerCase().includes(needle) || (r.phone ?? "").includes(needle)),
    );
  }, [rows, q, filter]);

  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search tickets</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serial, buyer name or phone…" className="pl-9" />
        </label>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", `All ${rows.length}`],
              ["valid", `Not used ${count("valid")}`],
              ["checked_in", `Used ${count("checked_in")}`],
              ["cancelled", `Voided ${count("cancelled")}`],
            ] as const
          ).map(([k, label]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Serial</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sale</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Check-in</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 500).map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono font-semibold text-navy">{r.serial}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} label={r.status === "valid" ? "Not used" : r.status === "cancelled" ? (r.sale === "Returned" ? "Returned" : "Voided") : undefined} />
                </td>
                <td className="px-3 py-2">
                  <div className="text-navy">{r.sale}</div>
                  {r.seller ? <div className="text-xs text-muted-foreground">{r.seller}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-navy">{r.buyer ?? <span className="text-muted-foreground">–</span>}</div>
                      {r.phone ? <div className="text-xs text-muted-foreground">{formatPhone(r.phone)}</div> : null}
                    </div>
                    {canEdit && r.status !== "cancelled" ? (
                      <Button size="icon-xs" variant="ghost" aria-label={`Edit buyer of ${r.serial}`} onClick={() => setEditing(r)}>
                        <Pencil />
                      </Button>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.checkedIn ? `${r.checkedIn}${r.checkedInBy ? ` · ${r.checkedInBy}` : ""}` : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 ? <p className="p-3 text-center text-xs text-muted-foreground">Showing the first 500 – search to find others.</p> : null}
        {!filtered.length ? <p className="p-6 text-center text-sm text-muted-foreground">No tickets match.</p> : null}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing) return;
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const res = await setPrintedTicketBuyer(orgSlug, editing.id, fd);
                if (res.ok) {
                  toast.success(res.message ?? "Saved");
                  setEditing(null);
                  router.refresh();
                } else toast.error(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Buyer of {editing?.serial}</DialogTitle>
              <DialogDescription>Optional – for your records. The scanner shows this name at the gate. Leave empty to clear.</DialogDescription>
            </DialogHeader>
            <FormField id="buyer-name" label="Name">
              <Input id="buyer-name" name="name" defaultValue={editing?.buyer ?? ""} maxLength={80} autoComplete="off" />
            </FormField>
            <FormField id="buyer-phone" label="Phone">
              <Input id="buyer-phone" name="phone" defaultValue={editing?.phone ?? ""} maxLength={16} type="tel" placeholder="0300 1234567" inputMode="tel" autoComplete="off" />
            </FormField>
            <DialogFooter>
              <Button type="submit" variant="brand" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "QWL-0012", "qwl-12" or "12" → 12 */
export function parseSerialInput(v: string): number | null {
  const m = /(\d+)\s*$/.exec(v.trim());
  return m ? Number(m[1]) : null;
}

/** PRT-07: void lost/stolen printed tickets by serial range. */
export function VoidRangeForm({ orgSlug, batchId, first, last, prefix }: { orgSlug: string; batchId: string; first: number; last: number; prefix: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const raw = new FormData(form);
        const from = parseSerialInput(String(raw.get("from") ?? ""));
        const to = parseSerialInput(String(raw.get("to") ?? "")) ?? from;
        if (from === null) {
          setErrors({ from: "Enter a serial number" });
          return;
        }
        const fd = new FormData();
        fd.set("from", String(from));
        fd.set("to", String(to));
        fd.set("reason", String(raw.get("reason") ?? ""));
        if (!window.confirm(`Void ${prefix}-${String(from).padStart(4, "0")}${to !== from ? ` to ${prefix}-${String(to).padStart(4, "0")}` : ""}? This cannot be undone. They will not get in.`)) return;
        start(async () => {
          const res = await voidPrintedTickets(orgSlug, batchId, fd);
          setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
          if (res.ok) {
            toast.success(res.message ?? "Voided");
            form.reset();
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField id="void-from" label="From" error={errors.from} hint={`e.g. ${prefix}-${String(first).padStart(4, "0")}`}>
          <Input id="void-from" name="from" required autoComplete="off" className="font-mono" />
        </FormField>
        <FormField id="void-to" label="To (optional)" error={errors.to} hint={`up to ${prefix}-${String(last).padStart(4, "0")}`}>
          <Input id="void-to" name="to" autoComplete="off" className="font-mono" />
        </FormField>
      </div>
      <FormField id="void-reason" label="Reason" required error={errors.reason} hint="Saved in the log, e.g. “Seller lost tickets 81–100”.">
        <Input id="void-reason" name="reason" required maxLength={300} />
      </FormField>
      <Button type="submit" variant="destructive" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : null} Void tickets
      </Button>
    </form>
  );
}

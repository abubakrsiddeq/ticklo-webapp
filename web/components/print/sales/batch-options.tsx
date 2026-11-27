"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { setPrintBatchOptions } from "@/app/org/_actions/print-sales";
import { useActionTransition } from "@/lib/use-action-transition";

/** "Only valid after sale" + printing cost for one batch (D-041). */
export function BatchOptionsForm({ orgSlug, batchId, requireSale, printingCost }: { orgSlug: string; batchId: string; requireSale: boolean; printingCost: string }) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await setPrintBatchOptions(orgSlug, batchId, fd);
          if (res.ok) toast.success(res.message ?? "Saved");
          else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      <label className="flex items-start gap-3 rounded-xl border border-input p-3 text-sm">
        <input type="checkbox" name="requireSale" defaultChecked={requireSale} className="mt-0.5 size-5 accent-[#0F9D58]" />
        <span>
          <span className="block font-semibold text-navy">Valid only after sale</span>
          <span className="block text-muted-foreground">
            The gate refuses a ticket of this batch until a seller marks it sold (&quot;Not sold&quot;). Stolen or lost stock becomes worthless. Sellers need
            internet to mark each sale.
          </span>
        </span>
      </label>
      <FormField id="printing-cost" label="Printing cost of this batch (Rs, optional)" hint="Shown on Sales & cash and the report, so you see the net amount.">
        <Input id="printing-cost" name="printingCost" defaultValue={printingCost} inputMode="decimal" placeholder="3000" className="max-w-48" />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : null} Save settings
      </Button>
    </form>
  );
}

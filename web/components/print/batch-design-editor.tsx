"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updatePrintBatchDesign } from "@/app/org/_actions/print";
import { designProblems, withTexts, withoutTexts, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { TicketTextsForm, cleanTexts, type TicketTexts } from "./ticket-texts-form";
import { useActionTransition } from "@/lib/use-action-transition";

const TicketEditor = dynamic(() => import("./editor/ticket-editor").then((m) => m.TicketEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-2xl bg-white shadow-card">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading editor" />
    </div>
  ),
});

/** Fix the artwork of a batch after it was created. QR codes stay the same. */
export function BatchDesignEditor({
  orgSlug,
  batchId,
  backHref,
  initialDesign,
  values,
  priceLine,
}: {
  orgSlug: string;
  batchId: string;
  backHref: string;
  initialDesign: TicketDesign;
  values: PlaceholderValues;
  priceLine: string;
}) {
  const router = useRouter();
  // D-082: the organizer's texts live beside the editor (the editor only changes the artwork)
  const [startDesign] = useState(() => withoutTexts(initialDesign));
  const [design, setDesign] = useState(startDesign);
  const [texts, setTexts] = useState<TicketTexts>(initialDesign.texts ?? {});
  const shown = useMemo(() => withTexts(values, texts), [values, texts]);
  const [pending, start] = useActionTransition();
  const problems = designProblems(design);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={backHref}>
            <ArrowLeft /> Back to batch
          </Link>
        </Button>
        <Button
          variant="brand"
          disabled={pending || problems.length > 0}
          onClick={() =>
            start(async () => {
              const res = await updatePrintBatchDesign(orgSlug, batchId, { ...design, texts: cleanTexts(texts) });
              if (res.ok) {
                toast.success(res.message ?? "Saved");
                router.push(backHref);
              } else toast.error(res.error);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save design
        </Button>
      </div>
      <p className="rounded-xl bg-secondary p-3 text-sm text-navy">
        The QR codes and serial numbers stay the same – only the artwork changes. Tickets you already printed keep working.
      </p>
      <TicketTextsForm design={design} values={values} texts={texts} onChange={setTexts} priceLine={priceLine} />
      <TicketEditor initialDesign={startDesign} values={shown} orgSlug={orgSlug} onDesignChange={setDesign} />
    </div>
  );
}

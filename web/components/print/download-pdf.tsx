"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPrintData } from "@/app/org/_actions/print";
import { mm, parseDesign, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { layoutPlan, type PrintLayout } from "@/lib/print/layout";
import { cn } from "@/lib/utils";
import { TicketFonts } from "./ticket-fonts";

/**
 * PRT-06: print-ready PDF made in the browser. Options: A4/A3 sheets with
 * cut marks (home/office printer or a shop) or one ticket per page with 3 mm
 * bleed (printing press).
 */
export function DownloadPdf({
  orgSlug,
  batchId,
  design,
  values,
  title,
  fileName,
  printable,
}: {
  orgSlug: string;
  batchId: string;
  design: TicketDesign;
  values: PlaceholderValues;
  title: string;
  fileName: string;
  printable: number;
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<PrintLayout>("a4");
  const [cropMarks, setCropMarks] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const w = mm(design.width);
  const h = mm(design.height);

  const options: { key: PrintLayout; title: string; text: string }[] = [
    { key: "a4", title: "A4 sheets", text: `${layoutPlan("a4", w, h, true).perPage} per page · home/office printer or print shop` },
    { key: "a3", title: "A3 sheets", text: `${layoutPlan("a3", w, h, true).perPage} per page · print shop` },
    { key: "single", title: "Printing press", text: "1 ticket per page, exact size + 3 mm bleed" },
  ];
  const plan = layoutPlan(layout, w, h, cropMarks);
  const pages = Math.ceil(printable / plan.perPage);

  async function run() {
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: printable });
    try {
      const res = await getPrintData(orgSlug, batchId, layout);
      if (!res.ok || !res.data) throw new Error(res.ok ? "Could not load the tickets." : res.error);
      const fresh = parseDesign(res.data.design) ?? design;
      const { buildTicketsPdf } = await import("@/lib/print/pdf");
      const bytes = await buildTicketsPdf(fresh, values, res.data.tickets, {
        layout,
        cropMarks,
        title,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}-${layout}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`PDF ready: ${res.data.tickets.length} tickets`);
      router.refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message || "Could not make the PDF.");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  return (
    <div className="grid gap-4">
      <TicketFonts />
      <fieldset className="grid gap-2 sm:grid-cols-3" disabled={Boolean(progress)}>
        <legend className="mb-2 text-sm font-medium text-navy">Print on</legend>
        {options.map((o) => (
          <label
            key={o.key}
            className={cn(
              "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
              layout === o.key ? "border-brand bg-brand-soft" : "border-input bg-white hover:bg-muted",
            )}
          >
            <input type="radio" name="layout" value={o.key} checked={layout === o.key} onChange={() => setLayout(o.key)} className="sr-only" />
            <span className="block font-semibold text-navy">{o.title}</span>
            <span className="block text-xs text-muted-foreground">{o.text}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" checked={cropMarks} onChange={(e) => setCropMarks(e.target.checked)} disabled={Boolean(progress)} className="size-4 accent-[#0F9D58]" />
        Cut marks (show where to cut)
      </label>
      <p className="text-xs text-muted-foreground">
        {printable} tickets · {pages} {pages === 1 ? "page" : "pages"} · {w} × {h} mm each · print at 100 % / “Actual size” (not “Fit to page”).
      </p>
      {progress ? (
        <div className="grid gap-2" aria-live="polite">
          <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Making PDF… {progress.done} / {progress.total}
            </span>
            <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
              <X /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="brand" size="lg" onClick={run} disabled={printable < 1} className="justify-self-start">
          {progress ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
        </Button>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Loader2, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { createPrintBatch, saveTicketTemplate } from "@/app/org/_actions/print";
import { designProblems, serialLabel, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { cloneDesign } from "@/lib/print/templates";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TicketFonts } from "./ticket-fonts";
import { TemplateGallery, type ChosenTemplate, type SavedTemplate } from "./template-gallery";
import { DesignThumb } from "./design-thumb";
import { useActionTransition } from "@/lib/use-action-transition";

const TicketEditor = dynamic(() => import("./editor/ticket-editor").then((m) => m.TicketEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-2xl bg-white shadow-card">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Loading editor" />
    </div>
  ),
});

export interface WizardType {
  id: string;
  name: string;
  price_paisa: number;
  remaining: number;
  values: PlaceholderValues;
}

type Step = "choose" | "edit" | "generate";

/**
 * PRT-01..PRT-04: choose a template → edit it → say how many tickets →
 * TickLO creates them (each with its own QR and serial) → batch page with the PDF.
 */
export function PrintWizard({
  orgSlug,
  eventId,
  basePath,
  types,
  saved,
  nextSerial,
  defaultPrefix,
}: {
  orgSlug: string;
  eventId: string;
  basePath: string;
  types: WizardType[];
  saved: SavedTemplate[];
  nextSerial: number;
  defaultPrefix: string;
}) {
  const router = useRouter();
  const firstAvailable = types.find((t) => t.remaining > 0) ?? types[0];
  const [step, setStep] = useState<Step>("choose");
  const [typeId, setTypeId] = useState(firstAvailable?.id ?? "");
  const [template, setTemplate] = useState<ChosenTemplate | null>(null);
  const [design, setDesign] = useState<TicketDesign | null>(null);
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [quantity, setQuantity] = useState(String(Math.min(100, firstAvailable?.remaining || 100)));
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pending, start] = useActionTransition();

  const type = types.find((t) => t.id === typeId) ?? firstAvailable;
  const cleanPrefix = prefix.trim().toUpperCase();
  const prefixOk = /^[A-Z0-9]{1,6}$/.test(cleanPrefix);
  const values = useMemo<PlaceholderValues>(
    () => ({ ...(type?.values ?? {}), serial: serialLabel(prefixOk ? cleanPrefix : "TKT", nextSerial), code: "K7Q2-M9XD" }),
    [type, prefixOk, cleanPrefix, nextSerial],
  );
  const qty = Math.floor(Number(quantity));
  const qtyOk = Number.isFinite(qty) && qty >= 1 && qty <= Math.min(2000, type?.remaining ?? 0);
  const problems = design ? designProblems(design) : [];

  if (!types.length) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">Add a ticket type on Edit &amp; tickets first.</p>;
  }

  const steps: { key: Step; label: string }[] = [
    { key: "choose", label: "1. Template" },
    { key: "edit", label: "2. Design" },
    { key: "generate", label: "3. How many" },
  ];

  const generate = () =>
    start(async () => {
      if (!design || !type) return;
      const res = await createPrintBatch(orgSlug, {
        eventId,
        ticketTypeId: type.id,
        quantity: qty,
        prefix: cleanPrefix,
        label: label.trim() || undefined,
        templateKey: template?.key.startsWith("saved:") ? "saved" : template?.key,
        design,
      });
      setConfirm(false);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(`${qty} tickets created`);
      router.push(`${basePath}/${res.data!.batchId}?new=1`);
    });

  return (
    <div className="grid gap-4">
      <TicketFonts />
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Steps">
        {steps.map((s) => (
          <li
            key={s.key}
            aria-current={step === s.key ? "step" : undefined}
            className={cn("rounded-full px-3 py-1", step === s.key ? "bg-navy text-white" : "bg-white text-muted-foreground ring-1 ring-navy/10")}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {step === "choose" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] sm:grid-cols-[1fr_auto] sm:items-end">
            <FormField id="type" label="Ticket type" hint="Its name and price are printed on the ticket.">
              <NativeSelect id="type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.remaining < 1}>
                    {t.name} · {formatPKR(t.price_paisa, { freeLabel: "Free" })} · {t.remaining} left
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          {type && type.remaining < 1 ? (
            <p role="alert" className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              No &quot;{type.name}&quot; tickets are left. Raise its quantity on Edit &amp; tickets, or choose another type.
            </p>
          ) : null}
          <TemplateGallery
            values={values}
            saved={saved}
            orgSlug={orgSlug}
            onChoose={(t) => {
              setTemplate(t);
              setDesign(cloneDesign(t.design));
              setStep("edit");
            }}
          />
        </div>
      ) : null}

      {step === "edit" && template && design ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("choose")}>
              <ArrowLeft /> Templates
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSaveName(template.key.startsWith("saved:") ? template.name : `${template.name} (my version)`);
                  setSaveOpen(true);
                }}
              >
                <Save /> Save as my template
              </Button>
              <Button variant="brand" disabled={problems.length > 0} onClick={() => setStep("generate")}>
                Next: how many tickets <ArrowRight />
              </Button>
            </div>
          </div>
          <TicketEditor key={template.key} initialDesign={design} values={values} orgSlug={orgSlug} onDesignChange={setDesign} />
        </div>
      ) : null}

      {step === "generate" && design && type ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid content-start gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06]">
            <div>
              <h3 className="font-heading text-lg font-bold text-navy">How many tickets?</h3>
              <p className="text-sm text-muted-foreground">
                Each ticket gets its own QR code and serial number. They count against &quot;{type.name}&quot; ({type.remaining} left), so online buyers can&apos;t take the same places.
              </p>
            </div>
            <FormField id="type2" label="Ticket type">
              <NativeSelect id="type2" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.remaining < 1}>
                    {t.name} · {formatPKR(t.price_paisa, { freeLabel: "Free" })} · {t.remaining} left
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="qty" label="Number of tickets" required error={errors.quantity ?? (!qtyOk && quantity ? `Choose 1 – ${Math.min(2000, type.remaining)}` : undefined)} hint="Up to 2000 per batch.">
              <Input id="qty" type="number" inputMode="numeric" min={1} max={Math.min(2000, type.remaining)} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </FormField>
            <FormField id="prefix" label="Serial prefix" required error={errors.prefix ?? (!prefixOk ? "1–6 letters or numbers" : undefined)} hint={`First ticket: ${serialLabel(prefixOk ? cleanPrefix : "TKT", nextSerial)}`}>
              <Input id="prefix" value={prefix} maxLength={6} onChange={(e) => setPrefix(e.target.value.toUpperCase())} className="font-mono uppercase" />
            </FormField>
            <FormField id="label" label="Batch name (optional)" hint="For your records, e.g. “Gate sale” or “Ali's book”.">
              <Input id="label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
            </FormField>
            {qtyOk && prefixOk ? (
              <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand-strong">
                Serials <b className="font-mono">{serialLabel(cleanPrefix, nextSerial)}</b> to <b className="font-mono">{serialLabel(cleanPrefix, nextSerial + qty - 1)}</b> ·{" "}
                {formatPKR(type.price_paisa * qty, { freeLabel: "Free" })} face value
              </p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("edit")}>
                <ArrowLeft /> Back to design
              </Button>
              <Button variant="brand" size="lg" disabled={!qtyOk || !prefixOk || pending || problems.length > 0} onClick={() => setConfirm(true)}>
                <Printer /> Create {qtyOk ? qty : ""} tickets
              </Button>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-sm font-medium text-navy">Ticket #1 preview</p>
            <DesignThumb design={design} values={values} width={640} alt="Preview of the first ticket" className="shadow-card" />
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create {qty} printed tickets?</AlertDialogTitle>
            <AlertDialogDescription>
              {qty} &quot;{type?.name}&quot; tickets ({serialLabel(cleanPrefix || "TKT", nextSerial)} – {serialLabel(cleanPrefix || "TKT", nextSerial + Math.max(qty, 1) - 1)}) will be
              created and taken from the {type?.remaining} places left. Lost tickets can be voided later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                generate();
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Create tickets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as my template</DialogTitle>
            <DialogDescription>Your society can use this design again for other events.</DialogDescription>
          </DialogHeader>
          <FormField id="tpl-name" label="Template name">
            <Input id="tpl-name" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button
              variant="brand"
              disabled={pending || !saveName.trim() || !design}
              onClick={() =>
                start(async () => {
                  const res = await saveTicketTemplate(orgSlug, { name: saveName, category: "custom", design });
                  if (res.ok) {
                    toast.success(res.message ?? "Saved");
                    setSaveOpen(false);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

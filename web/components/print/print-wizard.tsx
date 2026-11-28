"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Printer, Save } from "lucide-react";
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
import { createPrintBatch, saveTicketTemplate } from "@/app/org/_actions/print";
import { designProblems, serialLabel, withTexts, withoutTexts, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { cloneDesign } from "@/lib/print/templates";
import { formatPKR } from "@/lib/format";

export type { WizardType } from "./ticket-picker";
import { cn } from "@/lib/utils";
import { TicketFonts } from "./ticket-fonts";
import { TemplateGallery, type ChosenTemplate, type SavedTemplate } from "./template-gallery";
import { DesignThumb } from "./design-thumb";
import { PickedTicket, TicketPicker, type WizardType } from "./ticket-picker";
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

type Step = "ticket" | "choose" | "edit" | "generate";

/**
 * PRT-01..PRT-04: pick the tickets (D-080) → choose a template → edit it → say how many →
 * TickLO creates them (each with its own QR and serial) → batch page with the PDF.
 */
export function PrintWizard({
  orgSlug,
  eventId,
  basePath,
  types,
  saved,
  nextSerial,
  festival,
}: {
  orgSlug: string;
  eventId: string;
  basePath: string;
  types: WizardType[];
  saved: SavedTemplate[];
  nextSerial: number;
  festival: boolean;
}) {
  const router = useRouter();
  const available = types.filter((t) => t.remaining > 0);
  const firstAvailable = available[0] ?? types[0];
  // D-080: with a single ticket type there is nothing to pick
  const onlyOne = types.length === 1 && available.length === 1;
  const [step, setStep] = useState<Step>(onlyOne ? "choose" : "ticket");
  const [typeId, setTypeId] = useState(firstAvailable?.id ?? "");
  const [template, setTemplate] = useState<ChosenTemplate | null>(null);
  const [design, setDesign] = useState<TicketDesign | null>(null);
  const [prefix, setPrefix] = useState(firstAvailable?.prefix ?? "TKT");
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [quantity, setQuantity] = useState(String(Math.min(100, firstAvailable?.remaining || 100)));
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // D-082: what the organizer retyped in "What the ticket says"
  const [texts, setTexts] = useState<TicketTexts>({});
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [pending, start] = useActionTransition();

  const type = types.find((t) => t.id === typeId) ?? firstAvailable;
  const cleanPrefix = prefix.trim().toUpperCase();
  const prefixOk = /^[A-Z0-9]{1,6}$/.test(cleanPrefix);
  const baseValues = useMemo<PlaceholderValues>(
    () => ({ ...(type?.values ?? {}), serial: serialLabel(prefixOk ? cleanPrefix : "TKT", nextSerial), code: "K7Q2-M9XD" }),
    [type, prefixOk, cleanPrefix, nextSerial],
  );
  const values = useMemo(() => withTexts(baseValues, texts), [baseValues, texts]);
  const qty = Math.floor(Number(quantity));
  const maxQty = Math.min(2000, type?.remaining ?? 0);
  const qtyOk = Number.isFinite(qty) && qty >= 1 && qty <= maxQty;
  const moreShown = moreOpen || Boolean(errors.prefix) || !prefixOk;
  const problems = design ? designProblems(design) : [];

  if (!types.length) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">Add a ticket type on Edit &amp; tickets first.</p>;
  }

  const steps: { key: Step; label: string }[] = [
    { key: "ticket", label: "1. Ticket" },
    { key: "choose", label: "2. Design" },
    { key: "edit", label: "3. Text & look" },
    { key: "generate", label: "4. How many" },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);
  const canOpen = (k: Step) => {
    const i = steps.findIndex((s) => s.key === k);
    if (i >= stepIndex) return false;
    return k === "ticket" ? !onlyOne : k === "choose" || Boolean(design);
  };

  const pickType = (id: string) => {
    const t = types.find((x) => x.id === id);
    if (!t) return;
    if (id !== typeId) setTexts({});
    setTypeId(id);
    if (!prefixTouched) setPrefix(t.prefix);
    if (!quantityTouched) setQuantity(String(Math.min(100, t.remaining || 100)));
    setStep(design ? "edit" : "choose");
  };

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
        design: { ...withoutTexts(design), texts: cleanTexts(texts) },
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
        {steps
          .filter((s) => !(onlyOne && s.key === "ticket"))
          .map((s, i) => {
            const label = onlyOne ? `${i + 1}. ${s.label.replace(/^\d+\. /, "")}` : s.label;
            const cls = cn("rounded-full px-3 py-1", step === s.key ? "bg-navy text-white" : "bg-white text-muted-foreground ring-1 ring-navy/10");
            return (
              <li key={s.key} aria-current={step === s.key ? "step" : undefined}>
                {canOpen(s.key) ? (
                  <button type="button" onClick={() => setStep(s.key)} className={cn(cls, "text-navy hover:bg-muted")}>
                    {label}
                  </button>
                ) : (
                  <span className={cn(cls, "inline-block")}>{label}</span>
                )}
              </li>
            );
          })}
      </ol>

      {step !== "ticket" && type ? <PickedTicket type={type} onChange={onlyOne ? undefined : () => setStep("ticket")} /> : null}

      {step === "ticket" ? <TicketPicker types={types} festival={festival} selectedId={typeId} onPick={pickType} /> : null}

      {step === "choose" ? (
        <div className="grid gap-4">
          {type && type.remaining < 1 ? (
            <p role="alert" className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              No &quot;{type.name}&quot; tickets are left. Raise its quantity on Edit &amp; tickets, or choose another ticket.
            </p>
          ) : null}
          <TemplateGallery
            key={type?.category ?? "all"}
            suggested={type?.category ?? null}
            values={values}
            saved={saved}
            orgSlug={orgSlug}
            onChoose={(t) => {
              setTemplate(t);
              setDesign(withoutTexts(cloneDesign(t.design)));
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
          {type ? (
            <TicketTextsForm
              design={design}
              values={baseValues}
              texts={texts}
              onChange={setTexts}
              priceLine={`${type.name} · ${formatPKR(type.price_paisa, { freeLabel: "Free" })}`}
            />
          ) : null}
          <div>
            <h3 className="font-heading text-lg font-bold text-navy">Colours, pictures and layout</h3>
            <p className="text-sm text-muted-foreground">Optional. Drag things around, change colours or add your own picture.</p>
          </div>
          <TicketEditor key={template.key} initialDesign={design} values={values} orgSlug={orgSlug} onDesignChange={setDesign} />
        </div>
      ) : null}

      {step === "generate" && design && type ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid content-start gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06]">
            <div>
              <h3 className="font-heading text-lg font-bold text-navy">How many tickets?</h3>
              <p className="text-sm text-muted-foreground">Each ticket gets its own QR code and number. Up to {maxQty} now.</p>
            </div>
            <FormField id="qty" label="Number of tickets" required error={errors.quantity ?? (!qtyOk && quantity ? `Choose 1 – ${maxQty}` : undefined)}>
              <Input
                id="qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxQty}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setQuantityTouched(true);
                }}
              />
            </FormField>
            <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
              {[25, 50, 100, 200, 500].filter((n) => n <= maxQty).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setQuantity(String(n));
                    setQuantityTouched(true);
                  }}
                  className={cn("rounded-full border px-3 py-1 text-sm", qty === n ? "border-navy bg-navy text-white" : "border-input bg-white text-navy hover:bg-muted")}
                >
                  {n}
                </button>
              ))}
            </div>
            {qtyOk && prefixOk ? (
              <div className="rounded-xl bg-brand-soft p-3 text-sm text-brand-strong" role="status">
                <p>
                  <b>{qty} tickets</b> numbered <b className="font-mono">{serialLabel(cleanPrefix, nextSerial)}</b> to{" "}
                  <b className="font-mono">{serialLabel(cleanPrefix, nextSerial + qty - 1)}</b>.
                </p>
                <p>
                  {type.price_paisa ? (
                    <>
                      Each {formatPKR(type.price_paisa)}, together worth <b>{formatPKR(type.price_paisa * qty)}</b> when sold.{" "}
                    </>
                  ) : (
                    "Free tickets. "
                  )}
                  After this, {type.remaining - qty} more {type.headline} tickets can be printed or sold online.
                </p>
              </div>
            ) : null}
            <div className="grid gap-3">
              <button
                type="button"
                aria-expanded={moreShown}
                onClick={() => setMoreOpen(!moreShown)}
                className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-brand-strong hover:underline"
              >
                <ChevronDown className={cn("size-4 transition-transform", moreShown && "rotate-180")} aria-hidden /> More options (ticket numbers, batch name)
              </button>
              {moreShown ? (
                <div className="grid gap-3 rounded-xl border border-navy/10 p-3">
                  <FormField
                    id="prefix"
                    label="Letters before the number"
                    required
                    error={errors.prefix ?? (!prefixOk ? "1–6 letters or numbers" : undefined)}
                    hint={`Made from "${type.headline}". First ticket: ${serialLabel(prefixOk ? cleanPrefix : "TKT", nextSerial)}`}
                  >
                    <Input
                      id="prefix"
                      value={prefix}
                      maxLength={6}
                      onChange={(e) => {
                        setPrefix(e.target.value.toUpperCase());
                        setPrefixTouched(true);
                      }}
                      className="font-mono uppercase"
                    />
                  </FormField>
                  <FormField id="label" label="Batch name (optional)" hint={`Only for you. Empty = "${type.headline}".`}>
                    <Input id="label" value={label} maxLength={80} placeholder="e.g. Gate sale, Ali's book" onChange={(e) => setLabel(e.target.value)} />
                  </FormField>
                </div>
              ) : null}
            </div>
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
              {qty} {type?.headline} tickets ({serialLabel(cleanPrefix || "TKT", nextSerial)} – {serialLabel(cleanPrefix || "TKT", nextSerial + Math.max(qty, 1) - 1)}) will be
              created. They use up {qty} of the {type?.remaining} places left, so online buyers cannot get the same places. A lost ticket can be cancelled later.
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
                  if (!design) return;
                  const res = await saveTicketTemplate(orgSlug, { name: saveName, category: "custom", design: withoutTexts(design) });
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

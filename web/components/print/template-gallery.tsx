"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteTicketTemplate } from "@/app/org/_actions/print";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/print/templates";
import { parseDesign, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { DesignThumb } from "./design-thumb";
import { useActionTransition } from "@/lib/use-action-transition";

export interface SavedTemplate {
  id: string;
  name: string;
  category: string;
  design: unknown;
}

export interface ChosenTemplate {
  key: string;
  name: string;
  design: TicketDesign;
}

/**
 * PRT-01: pick a ready-made design (by category) or one of the society's saved designs.
 * D-081: when the ticket's kind is known (Qawwali night, workshop…) only its six designs are
 * shown first, with "See all designs" for the rest.
 */
export function TemplateGallery({
  values,
  saved,
  orgSlug,
  onChoose,
  suggested = null,
}: {
  values: PlaceholderValues;
  saved: SavedTemplate[];
  orgSlug: string;
  onChoose: (t: ChosenTemplate) => void;
  suggested?: string | null;
}) {
  const router = useRouter();
  const suggestedCat = TEMPLATE_CATEGORIES.find((c) => c.key === suggested) ?? null;
  const [browseAll, setBrowseAll] = useState(!suggestedCat);
  const [category, setCategory] = useState<string>(suggestedCat?.key ?? "all");
  const [pending, start] = useActionTransition();
  const mine = useMemo(
    () => saved.flatMap((s) => {
      const d = parseDesign(s.design);
      return d ? [{ key: `saved:${s.id}`, id: s.id, name: s.name, design: d }] : [];
    }),
    [saved],
  );
  const builtIn = category === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);
  const chips = [{ key: "all", label: "All" }, ...(mine.length ? [{ key: "mine", label: `My templates (${mine.length})` }] : []), ...TEMPLATE_CATEGORIES];

  const mineCard = (t: (typeof mine)[number]) => (
    <article key={t.key} className="grid gap-2 rounded-2xl bg-white p-3 shadow-card ring-1 ring-navy/[0.06]">
      <button type="button" onClick={() => onChoose({ key: t.key, name: t.name, design: t.design })} className="rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <DesignThumb design={t.design} values={values} alt={`${t.name} ticket design`} />
      </button>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-navy">{t.name}</p>
          <p className="text-xs text-muted-foreground">My template</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${t.name}`}
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete the template "${t.name}"? Printed batches keep their design.`)) return;
              start(async () => {
                const res = await deleteTicketTemplate(orgSlug, t.id);
                if (res.ok) toast.success(res.message ?? "Deleted");
                else toast.error(res.error);
                router.refresh();
              });
            }}
          >
            <Trash2 className="text-destructive" />
          </Button>
          <Button size="sm" variant="brand" onClick={() => onChoose({ key: t.key, name: t.name, design: t.design })}>
            Use
          </Button>
        </div>
      </div>
    </article>
  );
  const builtInCard = (t: (typeof TEMPLATES)[number]) => (
    <article key={t.key} className="grid gap-2 rounded-2xl bg-white p-3 shadow-card ring-1 ring-navy/[0.06]">
      <button type="button" onClick={() => onChoose({ key: t.key, name: t.name, design: t.design })} className="rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <DesignThumb design={t.design} values={values} alt={`${t.name} ticket design`} />
      </button>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-navy">{t.name}</p>
          <p className="text-xs text-muted-foreground">{TEMPLATE_CATEGORIES.find((c) => c.key === t.category)?.label}</p>
        </div>
        <Button size="sm" variant="brand" onClick={() => onChoose({ key: t.key, name: t.name, design: t.design })}>
          Use
        </Button>
      </div>
    </article>
  );

  if (!browseAll && suggestedCat) {
    const picks = TEMPLATES.filter((t) => t.category === suggestedCat.key);
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg font-bold text-navy">Designs for {suggestedCat.label}</h3>
            <p className="text-sm text-muted-foreground">Already filled in with your ticket&apos;s details. You can change any text in the next step.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBrowseAll(true)}>
            See all {TEMPLATES.length} designs
          </Button>
        </div>
        {mine.length ? (
          <section className="grid gap-2" aria-label="My templates">
            <h4 className="text-sm font-semibold text-navy">My templates</h4>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{mine.map(mineCard)}</div>
          </section>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{picks.map(builtInCard)}</div>
        <Button variant="ghost" className="justify-self-center" onClick={() => setBrowseAll(true)}>
          Not quite right? See designs for other kinds of events
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template categories">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={category === c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              category === c.key ? "border-navy bg-navy text-white" : "border-input bg-white text-navy hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(category === "all" || category === "mine") && mine.map(mineCard)}
        {category !== "mine" && builtIn.map(builtInCard)}
      </div>
    </div>
  );
}

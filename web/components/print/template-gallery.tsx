"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteTicketTemplate } from "@/app/org/_actions/print";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/print/templates";
import { parseDesign, type PlaceholderValues, type TicketDesign } from "@/lib/print/design";
import { DesignThumb } from "./design-thumb";

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

/** PRT-01: pick a ready-made design (by category) or one of the society's saved designs. */
export function TemplateGallery({
  values,
  saved,
  orgSlug,
  onChoose,
}: {
  values: PlaceholderValues;
  saved: SavedTemplate[];
  orgSlug: string;
  onChoose: (t: ChosenTemplate) => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("all");
  const [pending, start] = useTransition();
  const mine = useMemo(
    () => saved.flatMap((s) => {
      const d = parseDesign(s.design);
      return d ? [{ key: `saved:${s.id}`, id: s.id, name: s.name, design: d }] : [];
    }),
    [saved],
  );
  const builtIn = category === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);
  const chips = [{ key: "all", label: "All" }, ...(mine.length ? [{ key: "mine", label: `My templates (${mine.length})` }] : []), ...TEMPLATE_CATEGORIES];

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
        {(category === "all" || category === "mine") &&
          mine.map((t) => (
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
          ))}
        {category !== "mine" &&
          builtIn.map((t) => (
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
          ))}
      </div>
    </div>
  );
}

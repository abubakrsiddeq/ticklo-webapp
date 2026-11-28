"use client";

import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  EDITABLE_TEXT_KEYS,
  placeholderFallback,
  usedPlaceholders,
  type EditableTextKey,
  type PlaceholderValues,
  type TicketDesign,
} from "@/lib/print/design";

export type TicketTexts = Partial<Record<EditableTextKey, string>>;
export { cleanTexts } from "@/lib/print/design";

const FIELDS: Record<EditableTextKey, { label: string; max: number }> = {
  event_name: { label: "Big name (headline)", max: 120 },
  presents: { label: "Small line above the name", max: 80 },
  festival: { label: "Festival name", max: 120 },
  includes: { label: "Sessions included", max: 200 },
  date: { label: "Date", max: 60 },
  time: { label: "Time", max: 40 },
  venue: { label: "Place", max: 120 },
  society: { label: "Society", max: 120 },
};

/**
 * D-082: "What the ticket says" – the details printed on this design as plain fields. They start
 * from the ticket (session name, time, place); typing overrides them for this batch only.
 */
export function TicketTextsForm({
  design,
  values,
  texts,
  onChange,
  priceLine,
}: {
  design: TicketDesign;
  /** The ticket's own values (without the organizer's changes). */
  values: PlaceholderValues;
  texts: TicketTexts;
  onChange: (t: TicketTexts) => void;
  /** "Sufi Night Ticket · Rs 1,000" */
  priceLine: string;
}) {
  const used = usedPlaceholders(design);
  const keys = EDITABLE_TEXT_KEYS.filter((k) => used.has(k));
  const auto = (k: EditableTextKey) => values[k] || placeholderFallback(design, k, values);

  return (
    <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06]" aria-labelledby="texts-heading">
      <div>
        <h3 id="texts-heading" className="font-heading text-lg font-bold text-navy">
          What the ticket says
        </h3>
        <p className="text-sm text-muted-foreground">Filled in from your ticket. Change any line here and the preview updates.</p>
      </div>
      {keys.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {keys.map((k) => {
            const changed = texts[k] !== undefined && texts[k]!.trim() !== "" && texts[k]!.trim() !== auto(k);
            const id = `text-${k}`;
            return (
              <div key={k} className={k === "event_name" || k === "includes" ? "grid gap-1 md:col-span-2" : "grid gap-1"}>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={id} className="text-sm font-medium text-navy">
                    {FIELDS[k].label}
                  </label>
                  {changed ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...texts };
                        delete next[k];
                        onChange(next);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline"
                    >
                      <RotateCcw className="size-3" aria-hidden /> Use original
                    </button>
                  ) : null}
                </div>
                <Input
                  id={id}
                  value={texts[k] ?? auto(k)}
                  placeholder={auto(k) || "Nothing printed"}
                  maxLength={FIELDS[k].max}
                  dir="auto"
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...texts };
                    if (v === auto(k)) delete next[k];
                    else next[k] = v;
                    onChange(next);
                  }}
                />
                {changed ? <p className="text-xs text-muted-foreground">Changed by you. Original: {auto(k) || "nothing"}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This design has no event details to fill in. Change its text in the editor below.</p>
      )}
      <p className="rounded-xl bg-secondary px-3 py-2 text-sm text-navy">
        <b>Ticket and price:</b> {priceLine}. These come from the ticket and cannot be changed here, so the paper always matches what is sold.
      </p>
    </section>
  );
}

"use client";

import { ChevronRight } from "lucide-react";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SCOPE_GROUPS, type PrintScopeKind } from "@/lib/print/values";
import type { PlaceholderValues } from "@/lib/print/design";

export interface WizardType {
  id: string;
  name: string;
  price_paisa: number;
  remaining: number;
  values: PlaceholderValues;
  /** D-080: what it gets you in, for the cards */
  scope: PrintScopeKind;
  headline: string;
  emoji: string;
  /** "Wed, 2 Dec 2026 · 8:00 PM · Main Lawn" */
  when: string;
  /** D-081: designs shown first */
  category: string | null;
  prefix: string;
}

/** D-080: step 1 – which tickets to print, as cards that say what each one gets you in. */
export function TicketPicker({ types, festival, selectedId, onPick }: { types: WizardType[]; festival: boolean; selectedId: string; onPick: (id: string) => void }) {
  const card = (t: WizardType) => {
    const none = t.remaining < 1;
    const selected = t.id === selectedId;
    return (
      <li key={t.id}>
        <button
          type="button"
          disabled={none}
          onClick={() => onPick(t.id)}
          aria-pressed={selected}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-card ring-1 transition-colors",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            selected ? "ring-2 ring-brand" : "ring-navy/[0.06] hover:ring-navy/20",
            none && "cursor-not-allowed opacity-60",
          )}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-xl" aria-hidden>
            {t.emoji}
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="font-heading font-bold text-navy">{t.headline}</span>
            {t.headline !== t.name ? <span className="text-sm text-navy">{t.name}</span> : null}
            <span className="text-sm text-muted-foreground">{t.when}</span>
            <span className="text-sm">
              <b className="text-navy">{formatPKR(t.price_paisa, { freeLabel: "Free" })}</b>
              <span className={cn("ml-2", none ? "text-warning" : "text-muted-foreground")}>
                {none ? "None left. Raise its quantity on the tickets tab." : `${t.remaining} can be printed`}
              </span>
            </span>
          </span>
          {!none ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
        </button>
      </li>
    );
  };

  const list = (items: WizardType[]) => <ul className="grid gap-3 md:grid-cols-2">{items.map(card)}</ul>;

  return (
    <div className="grid gap-5">
      <div>
        <h3 className="font-heading text-lg font-bold text-navy">Which tickets do you want to print?</h3>
        <p className="text-sm text-muted-foreground">The name, time, place and price on the paper come from the ticket you pick.</p>
      </div>
      {festival
        ? SCOPE_GROUPS.map((g) => {
            const items = types.filter((t) => g.scopes.includes(t.scope));
            if (!items.length) return null;
            return (
              <section key={g.key} className="grid gap-2" aria-labelledby={`grp-${g.key}`}>
                <div>
                  <h4 id={`grp-${g.key}`} className="font-semibold text-navy">
                    {g.title}
                  </h4>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </div>
                {list(items)}
              </section>
            );
          })
        : list(types)}
    </div>
  );
}

/** Steps 2 to 4: which tickets are being printed, with a way back to step 1. */
export function PickedTicket({ type, onChange }: { type: WizardType; onChange?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 shadow-card ring-1 ring-navy/[0.06]">
      <span className="text-xl" aria-hidden>
        {type.emoji}
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="text-muted-foreground">Printing </span>
        <b className="text-navy">{type.headline}</b>
        {type.headline !== type.name ? <span className="text-navy"> · {type.name}</span> : null}
        <span className="text-muted-foreground">
          {" "}
          · {formatPKR(type.price_paisa, { freeLabel: "Free" })} · {type.when}
        </span>
      </p>
      {onChange ? (
        <button type="button" onClick={onChange} className="text-sm font-medium text-brand-strong hover:underline">
          Change
        </button>
      ) : null}
    </div>
  );
}

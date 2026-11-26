import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { EVENT_FORMATS, type EventFormat } from "@/lib/sessions";
import type { SetupStep } from "@/lib/queries/setup";
import { cn } from "@/lib/utils";

/** FES-15: what is left before a draft can go live – steps follow the kind of event. */
export function SetupChecklist({ steps, format }: { steps: SetupStep[]; format: EventFormat }) {
  const f = EVENT_FORMATS.find((x) => x.key === format) ?? EVENT_FORMATS[0];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.optional);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]" aria-label="Setup steps">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-navy">
          {f.emoji} {f.label} – setup {done}/{required.length}
        </p>
        {next ? <p className="text-xs text-muted-foreground">Next: {next.label}</p> : <p className="text-xs font-medium text-brand-strong">All set ✓</p>}
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / Math.max(1, required.length)) * 100}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => {
          const inner = (
            <>
              {s.done ? <CheckCircle2 className="size-5 shrink-0 text-brand-strong" aria-hidden /> : <Circle className="size-5 shrink-0 text-slate-300" aria-hidden />}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-navy">
                  {i + 1}. {s.label}
                  {s.optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">{s.detail}</span>
              </span>
            </>
          );
          const cls = cn("flex items-start gap-2 rounded-xl p-2", s === next ? "bg-brand-soft ring-1 ring-brand/40" : "");
          return (
            <li key={s.key}>
              {s.href ? (
                <Link href={s.href} className={cn(cls, "hover:bg-secondary/60")}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-navy/15 bg-white/70 px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          <Icon className="size-7" aria-hidden />
        </span>
      ) : null}
      <h2 className="font-heading text-xl font-semibold text-navy">{title}</h2>
      {description ? <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

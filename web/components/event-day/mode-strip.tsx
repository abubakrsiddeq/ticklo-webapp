import { DoorOpen, Store } from "lucide-react";
import { MODE_TEXT, type EventDayMode } from "@/lib/event-day";
import { cn } from "@/lib/utils";

/**
 * D-086: a wide coloured band at the top of each camera screen, so anyone can tell
 * from a distance which job this phone is doing. Gate = green, desk = amber.
 */
export function ModeStrip({ mode, detail, children }: { mode: EventDayMode; detail?: string | null; children?: React.ReactNode }) {
  const t = MODE_TEXT[mode];
  const Icon = mode === "gate" ? DoorOpen : Store;
  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5", mode === "gate" ? "bg-green-600 text-white" : "bg-amber-400 text-navy")} role="status">
      <Icon className="size-7 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-heading text-lg leading-tight font-bold tracking-wide uppercase">
          {t.strip}
          {detail ? <span className="normal-case"> · {detail}</span> : null}
        </p>
        <p className={cn("text-xs leading-snug", mode === "gate" ? "text-green-50" : "text-navy/80")}>{t.stripSub}</p>
      </div>
      {children}
    </div>
  );
}

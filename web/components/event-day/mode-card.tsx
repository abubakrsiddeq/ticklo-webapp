"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight, DoorOpen, Store } from "lucide-react";
import { EVENT_DAY_LAST_KEY, MODE_TEXT, type EventDayMode } from "@/lib/event-day";
import { cn } from "@/lib/utils";

function readLast(): string | null {
  try {
    return localStorage.getItem(EVENT_DAY_LAST_KEY);
  } catch {
    return null;
  }
}
const noop = () => () => undefined;

/** D-086: one big card per job on the Event day page. The job this phone did last time is marked. */
export function ModeCard({ eventId, mode, href, job }: { eventId: string; mode: EventDayMode; href: string; job?: string }) {
  const last = useSyncExternalStore(noop, readLast, () => null);
  const isLast = last === `${eventId}:${mode}`;
  const t = MODE_TEXT[mode];
  const Icon = mode === "gate" ? DoorOpen : Store;
  const gate = mode === "gate";
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-4 rounded-2xl border-l-8 bg-white p-4 text-navy transition-colors hover:bg-slate-100",
        gate ? "border-green-600" : "border-amber-400",
        isLast && (gate ? "ring-4 ring-green-400" : "ring-4 ring-amber-300"),
      )}
    >
      <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
        <Icon className="size-8" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-xl font-bold uppercase">{t.place}</span>
          {isLast ? <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">Last time</span> : null}
        </span>
        <span className="block text-sm text-slate-600">{job ?? t.job}</span>
      </span>
      <ChevronRight className="size-6 shrink-0" aria-hidden />
    </Link>
  );
}

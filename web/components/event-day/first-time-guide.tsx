"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GUIDE_STEPS, GUIDE_TIPS, MODE_TEXT, type EventDayMode } from "@/lib/event-day";
import { cn } from "@/lib/utils";

/**
 * D-086: three steps shown the first time a phone opens the gate or desk screen
 * (remembered per job on that phone). The "How it works" button opens it again.
 */
export function FirstTimeGuide({ mode }: { mode: EventDayMode }) {
  const key = `ticklo-guide-${mode}-seen`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(key) === "1";
    } catch {
      /* private mode: show it */
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [key]);

  const close = (v: boolean) => {
    setOpen(v);
    if (!v) {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }
  };

  const gate = mode === "gate";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold", gate ? "bg-white/20 text-white" : "bg-navy/10 text-navy")}
      >
        <CircleHelp className="size-4" aria-hidden /> How it works
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="text-navy">
          <DialogHeader>
            <span className={cn("w-fit rounded-full px-3 py-1 text-xs font-bold uppercase", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
              {MODE_TEXT[mode].place}
            </span>
            <DialogTitle>{gate ? "Letting people in" : "Selling paper tickets"}</DialogTitle>
            <DialogDescription>{MODE_TEXT[mode].job}</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3">
            {GUIDE_STEPS[mode].map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full font-bold", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold">{s.title}</span>
                  <span className="text-sm text-muted-foreground">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <ul className="grid gap-1 rounded-xl bg-secondary p-3 text-sm">
            {GUIDE_TIPS[mode].map((tip) => (
              <li key={tip}>• {tip}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="brand" className="w-full sm:w-auto" onClick={() => close(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** TKT-06: invite students to add TickLO to their home screen. */
export function InstallHint() {
  const [mode, setMode] = useState<"none" | "ios" | "android">("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("ticklo-install-dismissed") === "1";
    } catch {
      /* ignore */
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (dismissed || standalone) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const t = ios ? setTimeout(() => setMode("ios"), 0) : undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (mode === "none") return null;
  const dismiss = () => {
    try {
      localStorage.setItem("ticklo-install-dismissed", "1");
    } catch {
      /* ignore */
    }
    setMode("none");
  };
  return (
    <div className="flex items-start gap-3 rounded-xl bg-navy p-4 text-white">
      <Smartphone className="mt-0.5 size-5 shrink-0 text-brand-light" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Open your tickets like an app</p>
        {mode === "ios" ? (
          <p className="text-slate-200">In Safari, tap Share → &ldquo;Add to Home Screen&rdquo;.</p>
        ) : (
          <Button size="sm" variant="brand" className="mt-2" onClick={() => deferred?.prompt().finally(dismiss)}>
            Add to home screen
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}

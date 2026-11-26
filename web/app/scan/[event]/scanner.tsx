"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, CheckCircle2, IdCard, ListChecks, Loader2, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { describeScan, type ScanResponse, type ScanView } from "@/lib/scan/results";
import { failureFeedback, successFeedback, unlockAudio } from "@/lib/scan/feedback";
import { deviceLabel } from "@/lib/scan/device";
import { formatPKR } from "@/lib/format";
import { ManualList } from "./manual-list";

type CameraState = "idle" | "starting" | "on" | "denied" | "no_camera" | "unsupported" | "error";

const RESULT_MS = 2000; // SCN-07: result closes after 2 seconds
const SAME_CODE_COOLDOWN_MS = 5000;

const GATE_METHODS = [
  { key: "cash", label: "Cash" },
  { key: "jazzcash", label: "JazzCash" },
  { key: "easypaisa", label: "EasyPaisa" },
] as const;

export function Scanner({ eventId, eventName, scannerName, hasPrinted = false }: { eventId: string; eventName: string; scannerName: string; hasPrinted?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const recentRef = useRef(new Map<string, number>());
  const handleRef = useRef<(text: string) => void>(() => undefined);

  const [camera, setCamera] = useState<CameraState>("idle");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ScanView | null>(null);
  const [online, setOnline] = useState(true);
  const [count, setCount] = useState<{ checked_in: number; total_tickets: number } | null>(null);
  const [showList, setShowList] = useState(false);
  // D-042: paper tickets sold at the gate – how they are paid (null = off)
  const [gateSale, setGateSale] = useState<string | null>(null);
  const gateSaleRef = useRef<string | null>(null);
  useEffect(() => {
    gateSaleRef.current = gateSale;
    try {
      if (gateSale) localStorage.setItem(`ticklo-gate-sale-${eventId}`, gateSale);
      else localStorage.removeItem(`ticklo-gate-sale-${eventId}`);
    } catch {
      /* private mode */
    }
  }, [gateSale, eventId]);
  useEffect(() => {
    if (!hasPrinted) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(`ticklo-gate-sale-${eventId}`);
    } catch {
      /* private mode */
    }
    if (saved) {
      const t = setTimeout(() => setGateSale(saved), 0);
      return () => clearTimeout(t);
    }
  }, [hasPrinted, eventId]);

  // SCN-08: live count (realtime + polling fallback)
  const refreshCount = useCallback(async () => {
    const { data } = await createClient().rpc("event_stats", { p_event_id: eventId });
    if (data) setCount(data as unknown as { checked_in: number; total_tickets: number });
  }, [eventId]);

  useEffect(() => {
    const supabase = createClient();
    const first = setTimeout(refreshCount, 0);
    const channel = supabase
      .channel(`scan-count-${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins", filter: `event_id=eq.${eventId}` }, () => void refreshCount())
      .subscribe();
    const poll = setInterval(refreshCount, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [eventId, refreshCount]);

  // SCN-09: offline warning
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const first = setTimeout(update, 0);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const showResult = useCallback((view: ScanView) => {
    if (view.ok) successFeedback();
    else failureFeedback();
    setResult(view);
    setTimeout(() => {
      setResult(null);
      busyRef.current = false;
    }, RESULT_MS);
  }, []);

  // SCN-03: every scan is verified on the server (scan-verify Edge Function)
  const handleDecoded = useCallback(
    async (text: string) => {
      const now = Date.now();
      if (busyRef.current) return;
      const last = recentRef.current.get(text);
      if (last && now - last < SAME_CODE_COOLDOWN_MS) return;
      busyRef.current = true;
      recentRef.current.set(text, now);
      setChecking(true);
      try {
        const { data, error } = await createClient().functions.invoke<ScanResponse>("scan-verify", {
          body: { token: text, event_id: eventId, device: deviceLabel() },
        });
        if (error || !data?.result) throw error ?? new Error("No result");
        setOnline(true);
        const view = describeScan(data);
        if (data.result === "ok" && data.gate_sold) {
          const method = gateSaleRef.current;
          const price = formatPKR(data.sale_price_paisa ?? 0, { freeLabel: "Free" });
          if (method && data.ticket_id) {
            const { data: rec } = await createClient().rpc("record_gate_sale", { p_ticket_id: data.ticket_id, p_method: method });
            const label = GATE_METHODS.find((m) => m.key === method)?.label ?? method;
            view.subtitle = (rec as { result?: string } | null)?.result === "ok" ? `Gate sale: collect ${price} (${label})` : `Counted as sold (${price}) – payment not recorded`;
          } else {
            view.subtitle = `Paper ticket was not marked sold – counted as sold (${price}).`;
          }
        }
        showResult(view);
        void refreshCount();
      } catch {
        recentRef.current.delete(text); // allow retry of the same code
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (offline) setOnline(false);
        showResult({
          ok: false,
          title: offline ? "Offline" : "Could not check",
          subtitle: offline ? "Scan nahi ho rahe – no internet. Use the manual list or wait for the connection." : "Network problem – scan again.",
        });
      } finally {
        setChecking(false);
      }
    },
    [eventId, refreshCount, showResult],
  );

  useEffect(() => {
    handleRef.current = (text: string) => void handleDecoded(text);
  }, [handleDecoded]);

  // SCN-02: phone camera (Android Chrome + iPhone Safari) via @zxing/browser
  const startCamera = useCallback(async () => {
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("starting");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 300 });
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        videoRef.current ?? undefined,
        (res) => {
          if (res) handleRef.current(res.getText());
        },
      );
      setCamera("on");
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "no_camera" : "error");
    }
  }, []);

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  const pct = count && count.total_tickets ? Math.round((count.checked_in / count.total_tickets) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col">
      {/* SCN-09 offline banner */}
      {!online ? (
        <div className="flex items-center justify-between gap-3 bg-red-600 px-4 py-3 text-white" role="alert">
          <span className="flex items-center gap-2 font-bold">
            <WifiOff className="size-6 shrink-0" aria-hidden /> Offline: scan nahi ho rahe
          </span>
          <Button size="sm" variant="secondary" onClick={() => setShowList(true)}>
            Manual list
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-4 pb-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{eventName}</p>
          <p className="text-xs text-slate-300">Scanner: {scannerName}</p>
        </div>
        {/* SCN-08 live count */}
        <div className="shrink-0 text-right" aria-live="polite">
          <p className="font-heading text-2xl font-bold tabular-nums">
            {count ? `${count.checked_in}/${count.total_tickets}` : "–"}
          </p>
          <p className="text-xs text-slate-300">inside · {pct}%</p>
        </div>
      </div>

      <div className="relative mx-4 aspect-square max-h-[60vh] overflow-hidden rounded-2xl bg-black sm:mx-auto sm:w-[480px]">
        <video ref={videoRef} className="size-full object-cover" muted playsInline autoPlay aria-label="Camera preview" />
        {camera === "on" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="size-2/3 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {camera === "idle" ? (
              <>
                <Camera className="size-14 text-slate-300" aria-hidden />
                <Button variant="brand" size="lg" onClick={startCamera}>
                  Start scanning
                </Button>
                <p className="text-sm text-slate-300">Allow camera access when your browser asks.</p>
              </>
            ) : camera === "starting" ? (
              <Loader2 className="size-10 animate-spin text-slate-300" aria-label="Starting camera" />
            ) : (
              <>
                <CameraOff className="size-14 text-red-300" aria-hidden />
                <p className="font-semibold">
                  {camera === "denied"
                    ? "Camera permission was blocked"
                    : camera === "no_camera"
                      ? "No camera found on this device"
                      : camera === "unsupported"
                        ? "This browser cannot use the camera"
                        : "Could not start the camera"}
                </p>
                <p className="text-sm text-slate-300">
                  {camera === "denied"
                    ? "Android Chrome: tap the lock icon in the address bar → Permissions → Camera → Allow. iPhone Safari: Settings → Safari → Camera → Allow, then reload."
                    : camera === "unsupported"
                      ? "Open this page in Chrome (Android) or Safari (iPhone) over https."
                      : "Close other apps using the camera and try again."}
                </p>
                <Button variant="secondary" onClick={startCamera}>
                  Try again
                </Button>
              </>
            )}
          </div>
        )}
        {checking ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/60 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Checking…
          </div>
        ) : null}
      </div>

      {hasPrinted ? (
        <div className="mx-auto mt-4 grid w-full max-w-md gap-2 px-4">
          <p className="text-sm text-slate-300">Selling paper tickets at the gate? Unsold ones you scan are recorded as paid by:</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Gate sale">
            <button
              type="button"
              role="radio"
              aria-checked={gateSale === null}
              onClick={() => setGateSale(null)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${gateSale === null ? "bg-white text-navy" : "bg-white/10 text-white"}`}
            >
              Off
            </button>
            {GATE_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={gateSale === m.key}
                onClick={() => setGateSale(m.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${gateSale === m.key ? "bg-brand text-navy" : "bg-white/10 text-white"}`}
              >
                Gate sale: {m.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-4 flex w-full max-w-md flex-wrap justify-center gap-2 px-4 pb-6">
        <Button variant="secondary" onClick={() => setShowList(true)}>
          <ListChecks /> Manual check-in
        </Button>
        <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
          <Link href="/scan?list=1">Change event</Link>
        </Button>
      </div>

      {/* SCN-04: full-screen result */}
      {result ? (
        <button
          type="button"
          onClick={() => {
            setResult(null);
            busyRef.current = false;
          }}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center text-white ${result.ok ? "bg-green-600" : "bg-red-600"}`}
          aria-live="assertive"
        >
          {result.ok ? <CheckCircle2 className="size-28" aria-hidden /> : <XCircle className="size-28" aria-hidden />}
          <span className="font-heading text-5xl font-bold leading-tight">{result.title}</span>
          {result.name ? <span className="text-3xl font-semibold">{result.name}</span> : null}
          {result.ticketType ? <span className="text-xl opacity-90">{result.ticketType}</span> : null}
          {result.card ? (
            <span className="mt-2 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-lg font-bold text-green-800">
              <IdCard className="size-6" aria-hidden /> Check student card
            </span>
          ) : null}
          {result.subtitle ? <span className="max-w-md text-lg opacity-90">{result.subtitle}</span> : null}
        </button>
      ) : null}

      <ManualList eventId={eventId} open={showList} onOpenChange={setShowList} online={online} onCheckedIn={refreshCount} />
    </div>
  );
}

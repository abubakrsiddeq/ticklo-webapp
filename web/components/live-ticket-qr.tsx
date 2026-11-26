"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type TokenResponse =
  | { status: "valid"; token: string; issued_at: number; server_time: number; refresh_in: number; valid_for: number }
  | { status: "checked_in"; checked_in_at: string }
  | { status: "cancelled" };

type View =
  | { kind: "loading" }
  | { kind: "valid"; qr: string; issuedAt: number; validFor: number; refreshIn: number; offset: number }
  | { kind: "used"; at: string | null }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

const PKT_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * TKT-02/TKT-03/TKT-04: big QR with a fresh signed token every 30 s, a
 * countdown ring, a ticking clock and a pulsing border so gate volunteers can
 * tell a live screen from a screenshot. Switches to "Used at …" in real time.
 */
export function LiveTicketQR({ ticketId, initialStatus, initialCheckedInAt }: {
  ticketId: string;
  initialStatus: string;
  initialCheckedInAt: string | null;
}) {
  const [view, setView] = useState<View>(() =>
    initialStatus === "checked_in"
      ? { kind: "used", at: initialCheckedInAt }
      : initialStatus === "cancelled"
        ? { kind: "cancelled" }
        : { kind: "loading" },
  );
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Fetch a fresh token every `refresh_in` seconds; refetch when the tab comes
  // back to the foreground or the connection returns.
  useEffect(() => {
    if (initialStatus !== "valid") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (timer) clearTimeout(timer);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke<TokenResponse>("ticket-token", { body: { ticket_id: ticketId } });
        if (error || !data) throw error ?? new Error("No response");
        if (cancelled) return;
        setOffline(false);
        if (data.status === "valid") {
          const qr = await QRCode.toDataURL(data.token, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 640,
            color: { dark: "#0B1F3A", light: "#FFFFFF" },
          });
          if (cancelled) return;
          setView({
            kind: "valid",
            qr,
            issuedAt: data.issued_at,
            validFor: data.valid_for,
            refreshIn: data.refresh_in,
            offset: data.server_time - Date.now() / 1000,
          });
          timer = setTimeout(run, data.refresh_in * 1000);
        } else if (data.status === "checked_in") {
          setView({ kind: "used", at: data.checked_in_at });
        } else {
          setView({ kind: "cancelled" });
        }
      } catch {
        if (cancelled) return;
        setOffline(true);
        timer = setTimeout(run, 5000); // keep retrying
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    const onOnline = () => void run();
    void run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [ticketId, initialStatus]);

  // Ticking clock / countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // TKT-04: flip to "Used" the moment the gate checks the ticket in
  useEffect(() => {
    if (initialStatus !== "valid") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` }, (payload) => {
        const row = payload.new as { status?: string; checked_in_at?: string | null };
        if (row.status === "checked_in") setView({ kind: "used", at: row.checked_in_at ?? null });
        if (row.status === "cancelled") setView({ kind: "cancelled" });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, initialStatus]);

  // Keep the screen on while the QR is visible (where supported)
  useEffect(() => {
    if (view.kind !== "valid" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, [view.kind]);

  if (view.kind === "used") {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-100 p-6 text-center">
        <CheckCircle2 className="size-16 text-slate-500" aria-hidden />
        <p className="font-heading text-2xl font-bold text-navy">Used{view.at ? ` at ${formatTime(view.at)}` : ""}</p>
        <p className="text-sm text-muted-foreground">This ticket has been checked in.</p>
      </div>
    );
  }
  if (view.kind === "cancelled") {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-danger-soft p-6 text-center">
        <p className="font-heading text-2xl font-bold text-red-800">Cancelled</p>
        <p className="text-sm text-red-800">The event was cancelled. This ticket is not valid.</p>
      </div>
    );
  }

  const age = view.kind === "valid" ? now / 1000 + view.offset - view.issuedAt : 0;
  const stale = view.kind === "valid" && age > view.validFor; // too old to scan
  const left = view.kind === "valid" ? Math.max(0, Math.ceil(view.refreshIn - age)) : 0;
  const progress = view.kind === "valid" ? Math.min(1, Math.max(0, age / view.refreshIn)) : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border-4 bg-white p-3",
          view.kind === "valid" && !stale ? "animate-live border-brand" : "border-slate-200",
        )}
      >
        {view.kind === "valid" && !stale ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.qr} alt="Ticket QR code – show this at the gate" className="size-full [image-rendering:pixelated]" />
            <span className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden />
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 text-center">
            {stale || (offline && view.kind !== "valid") ? (
              <>
                <WifiOff className="size-12 text-muted-foreground" aria-hidden />
                <p className="font-medium text-navy">No internet</p>
                <p className="px-4 text-sm text-muted-foreground">The live QR needs internet. Reconnecting…</p>
              </>
            ) : (
              <>
                <Loader2 className="size-10 animate-spin text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Loading your live QR…</p>
              </>
            )}
          </div>
        )}
      </div>

      {view.kind === "valid" && !stale ? (
        <div className="flex items-center gap-3" aria-live="off">
          <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E6EE" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#0F9D58"
              strokeWidth="4"
              strokeDasharray={`${(1 - progress) * 94.25} 94.25`}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-sm">
            <div className="font-semibold text-navy">New code in {left}s</div>
            <div className="font-mono text-muted-foreground tabular-nums">{PKT_CLOCK.format(now)} PKT · live</div>
          </div>
        </div>
      ) : null}
      {offline && view.kind === "valid" && !stale ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <WifiOff className="size-3.5" aria-hidden /> Connection lost – this code still works for a few seconds.
        </p>
      ) : null}
    </div>
  );
}

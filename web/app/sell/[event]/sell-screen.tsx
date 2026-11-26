"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import { Camera, CameraOff, CheckCircle2, Gift, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPKR } from "@/lib/format";
import { compressSerials, SALE_METHODS } from "@/lib/print/sales";
import { failureFeedback, successFeedback, unlockAudio } from "@/lib/scan/feedback";
import { cn } from "@/lib/utils";
import { sellByToken, sellRange, type SellResult } from "../actions";

interface StockRow {
  serial: string;
  serial_no: number;
  ticket_type: string;
  price_paisa: number;
  sale_status: string;
  status: string;
  sale_method: string | null;
  sold_at: string | null;
  seller_name: string | null;
}

const QUICK_METHODS = SALE_METHODS.filter((m) => ["cash", "jazzcash", "easypaisa", "bank"].includes(m.key));

function describe(r: SellResult): { ok: boolean; title: string; sub?: string } {
  switch (r.result) {
    case "ok":
      return { ok: true, title: r.comp ? "Free pass" : "Sold", sub: `${r.serial} · ${r.ticket_type}${r.comp ? "" : ` · ${formatPKR(r.price_paisa ?? 0, { freeLabel: "Free" })}`}` };
    case "already_sold":
      return { ok: false, title: "Already sold", sub: `${r.serial} was sold before.` };
    case "not_yours":
      return { ok: false, title: "Not your ticket", sub: `${r.serial} was given to another seller.` };
    case "returned":
      return { ok: false, title: "Returned ticket", sub: `${r.serial} was returned – don't sell it.` };
    case "voided":
      return { ok: false, title: "Voided ticket", sub: `${r.serial} is lost/stolen – don't sell it.` };
    case "not_allowed":
      return { ok: false, title: "Not allowed", sub: "You are not a seller for this event." };
    case "not_found":
      return { ok: false, title: "Not a printed ticket", sub: "This QR is not a paper ticket of this event." };
    default:
      return { ok: false, title: "Invalid", sub: "Not a TickLO ticket, or the code is damaged." };
  }
}

/**
 * SAL-03: seller's phone. Scan a paper ticket's QR → choose how it was paid →
 * the sale is recorded at once. Or sell by serial numbers.
 */
export function SellScreen({ eventId, eventName, sellerName, initialStock }: { eventId: string; eventName: string; sellerName: string; initialStock: StockRow[] }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const pendingRef = useRef(false);
  const [camera, setCamera] = useState<"idle" | "starting" | "on" | "error">("idle");
  const [token, setToken] = useState<string | null>(null);
  const [method, setMethod] = useState<string>("cash");
  const [comp, setComp] = useState(false);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [result, setResult] = useState<{ ok: boolean; title: string; sub?: string } | null>(null);
  const [pending, start] = useTransition();

  const mine = useMemo(() => {
    const inStock = initialStock.filter((s) => s.sale_status === "in_stock" && s.status === "valid");
    const sold = initialStock.filter((s) => s.sale_status === "sold");
    return {
      inStock,
      sold: sold.length,
      comp: initialStock.filter((s) => s.sale_status === "comp").length,
      value: sold.reduce((sum, s) => sum + s.price_paisa, 0),
    };
  }, [initialStock]);

  const onDecoded = useCallback((text: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setToken(text);
  }, []);

  const startCamera = useCallback(async () => {
    unlockAudio();
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("error");
      return;
    }
    setCamera("starting");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 600 });
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current ?? undefined,
        (res) => {
          if (res) onDecoded(res.getText());
        },
      );
      setCamera("on");
    } catch {
      setCamera("error");
    }
  }, [onDecoded]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const finish = (view: { ok: boolean; title: string; sub?: string }) => {
    if (view.ok) successFeedback();
    else failureFeedback();
    setResult(view);
    setToken(null);
    setBuyerName("");
    setBuyerPhone("");
    setTimeout(() => {
      setResult(null);
      pendingRef.current = false;
    }, 2000);
    router.refresh();
  };

  const confirmSale = () =>
    start(async () => {
      if (!token) return;
      const res = await sellByToken(eventId, token, { method, comp, buyerName, buyerPhone });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Could not sell – try again." : res.error);
        setToken(null);
        pendingRef.current = false;
        return;
      }
      finish(describe(res.data));
    });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-8">
      <div>
        <p className="truncate font-semibold">{eventName}</p>
        <p className="text-xs text-slate-300">Seller: {sellerName}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/10 p-3">
          <p className="font-heading text-2xl font-bold tabular-nums">{mine.inStock.length}</p>
          <p className="text-xs text-slate-300">to sell</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="font-heading text-2xl font-bold tabular-nums">{mine.sold}</p>
          <p className="text-xs text-slate-300">sold{mine.comp ? ` · ${mine.comp} free` : ""}</p>
        </div>
        <div className="rounded-xl bg-white/10 p-3">
          <p className="font-heading text-lg font-bold tabular-nums">{formatPKR(mine.value)}</p>
          <p className="text-xs text-slate-300">to hand over</p>
        </div>
      </div>

      {/* Payment method for the next sale */}
      <div className="grid gap-2">
        <p className="text-sm text-slate-300">Next sale is paid by</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMethod(m.key);
                setComp(false);
              }}
              className={cn("rounded-full px-3 py-2 text-sm font-semibold", !comp && method === m.key ? "bg-brand text-navy" : "bg-white/10 text-white")}
            >
              {m.label}
            </button>
          ))}
          <button type="button" onClick={() => setComp(true)} className={cn("flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold", comp ? "bg-amber-300 text-navy" : "bg-white/10 text-white")}>
            <Gift className="size-4" aria-hidden /> Free pass
          </button>
        </div>
      </div>

      <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline autoPlay aria-label="Camera preview" />
        {camera !== "on" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {camera === "starting" ? (
              <Loader2 className="size-10 animate-spin text-slate-300" aria-label="Starting camera" />
            ) : camera === "error" ? (
              <>
                <CameraOff className="size-12 text-red-300" aria-hidden />
                <p className="text-sm text-slate-300">Camera not available. Allow camera access, or sell by serial number below.</p>
                <Button variant="secondary" onClick={startCamera}>
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Camera className="size-12 text-slate-300" aria-hidden />
                <Button variant="brand" size="lg" onClick={startCamera}>
                  Scan ticket to sell
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="size-2/3 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
      </div>

      {/* Sell by serial numbers */}
      <form
        className="grid gap-2 rounded-2xl bg-white/5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("method", method);
          fd.set("comp", comp ? "1" : "0");
          const form = e.currentTarget;
          start(async () => {
            const res = await sellRange(eventId, fd);
            if (res.ok) {
              toast.success(res.message ?? "Sold");
              form.reset();
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      >
        <p className="text-sm font-semibold">Sell by serial number</p>
        <div className="grid grid-cols-2 gap-2">
          <Input name="from" placeholder="From (QWL-0012)" required className="bg-white font-mono text-navy" autoComplete="off" />
          <Input name="to" placeholder="To (optional)" className="bg-white font-mono text-navy" autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {comp ? "Give free passes" : `Mark sold (${SALE_METHODS.find((m) => m.key === method)?.label})`}
        </Button>
      </form>

      {mine.inStock.length ? (
        <details className="rounded-2xl bg-white/5 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">My unsold tickets ({mine.inStock.length})</summary>
          <p className="mt-2 font-mono text-xs break-words text-slate-300">{compressSerials(mine.inStock.map((s) => ({ prefix: s.serial.replace(/-\d+$/, ""), serial_no: s.serial_no })))}</p>
        </details>
      ) : null}

      {/* Confirm the scanned ticket */}
      {token && !result ? (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl bg-white p-5 text-navy shadow-2xl" role="dialog" aria-label="Confirm sale">
          <p className="font-heading text-xl font-bold">{comp ? "Give as free pass?" : `Sell – paid by ${SALE_METHODS.find((m) => m.key === method)?.label}?`}</p>
          <p className="mb-3 text-sm text-muted-foreground">Ticket scanned. Buyer details are optional.</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Buyer name" maxLength={80} />
            <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="Phone" maxLength={20} inputMode="tel" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setToken(null);
                pendingRef.current = false;
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="brand" onClick={confirmSale} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {comp ? "Free pass" : "Sold"}
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <button
          type="button"
          onClick={() => {
            setResult(null);
            pendingRef.current = false;
          }}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center text-white ${result.ok ? "bg-green-600" : "bg-red-600"}`}
          aria-live="assertive"
        >
          {result.ok ? <CheckCircle2 className="size-24" aria-hidden /> : <XCircle className="size-24" aria-hidden />}
          <span className="font-heading text-5xl font-bold">{result.title}</span>
          {result.sub ? <span className="text-xl opacity-90">{result.sub}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";

/**
 * Fixed ticket QR (D-037): shown without any network calls, so it works with
 * no internet at the venue. Also in the confirmation email. Flips to
 * "Used at …" in real time when the gate checks the ticket in (if online).
 */
export function TicketQr({
  ticketId,
  code,
  qrDataUrl,
  initialStatus,
  initialCheckedInAt,
  multiUse = false,
}: {
  ticketId: string;
  code: string;
  qrDataUrl: string | null;
  initialStatus: string;
  initialCheckedInAt: string | null;
  /** D-044: festival ticket – scanned at several sessions, so the QR stays after the first scan */
  multiUse?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [usedAt, setUsedAt] = useState(initialCheckedInAt);

  useEffect(() => {
    if (initialStatus !== "valid") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` }, (payload) => {
        const row = payload.new as { status?: string; checked_in_at?: string | null };
        if (row.status) setStatus(row.status);
        if (row.checked_in_at) setUsedAt(row.checked_in_at);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, initialStatus]);

  if (status === "checked_in" && !multiUse) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl bg-slate-100 p-6 text-center">
        <CheckCircle2 className="size-16 text-slate-500" aria-hidden />
        <p className="font-heading text-2xl font-bold text-navy">Used{usedAt ? ` at ${formatTime(usedAt)}` : ""}</p>
        <p className="text-sm text-muted-foreground">This ticket has been checked in.</p>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-danger-soft p-6 text-center">
        <p className="font-heading text-2xl font-bold text-red-800">Cancelled</p>
        <p className="text-sm text-red-800">The event was cancelled. This ticket is not valid.</p>
      </div>
    );
  }
  if (!qrDataUrl) {
    return <p className="rounded-2xl bg-warning-soft p-6 text-center text-sm text-warning">QR code is not available right now. Please try again later.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-sm rounded-3xl border-4 border-brand bg-white p-3 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Ticket QR code – show this at the gate" className="aspect-square w-full [image-rendering:pixelated]" />
      </div>
      <p className="font-mono text-sm font-semibold tracking-widest text-navy">{code}</p>
      <Button asChild variant="outline" className="rounded-full">
        <a href={qrDataUrl} download={`ticklo-ticket-${code}.png`}>
          <Download /> Download QR (works offline)
        </a>
      </Button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { PlaceholderValues, TicketDesign } from "@/lib/print/design";
import { SAMPLE_QR_TOKEN } from "@/lib/print/qr-matrix";
import { cn } from "@/lib/utils";

/** A rendered picture of a ticket design (same renderer as the PDF). */
export function DesignThumb({ design, values, width = 480, className, alt }: { design: TicketDesign; values: PlaceholderValues; width?: number; className?: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("@/lib/print/pdf")
      .then(({ designPreviewDataUrl }) => designPreviewDataUrl(design, values, width * (window.devicePixelRatio > 1 ? 2 : 1), SAMPLE_QR_TOKEN))
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [design, values, width]);

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg bg-slate-100", className)} style={{ aspectRatio: `${design.width} / ${design.height}` }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-contain" />
      ) : (
        <div className="size-full animate-pulse bg-slate-200" aria-label="Loading preview" />
      )}
    </div>
  );
}

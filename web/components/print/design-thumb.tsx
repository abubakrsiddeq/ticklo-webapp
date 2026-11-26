"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceholderValues, TicketDesign } from "@/lib/print/design";
import { SAMPLE_QR_TOKEN } from "@/lib/print/qr-matrix";
import { cn } from "@/lib/utils";

// Thumbnails render one after another (the gallery has ~100 designs) and only
// once they scroll into view, so the page stays responsive on phones.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

/** A rendered picture of a ticket design (same renderer as the PDF). */
export function DesignThumb({ design, values, width = 480, className, alt }: { design: TicketDesign; values: PlaceholderValues; width?: number; className?: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    enqueue(async () => {
      if (cancelled) return null;
      const { designPreviewDataUrl } = await import("@/lib/print/pdf");
      return designPreviewDataUrl(design, values, width * (window.devicePixelRatio > 1 ? 2 : 1), SAMPLE_QR_TOKEN);
    })
      .then((url) => {
        if (!cancelled && url) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, design, values, width]);

  return (
    <div ref={ref} className={cn("relative w-full overflow-hidden rounded-lg bg-slate-100", className)} style={{ aspectRatio: `${design.width} / ${design.height}` }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-contain" />
      ) : (
        <div className="size-full animate-pulse bg-slate-200" aria-label="Loading preview" />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** PAY-06: screenshot with zoom (tap to open, zoom in/out, open full size). */
export function ZoomableImage({ src, alt, label }: { src: string; alt: string; label: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <Dialog onOpenChange={() => setZoom(1)}>
      <DialogTrigger asChild>
        <button type="button" className="group relative block overflow-hidden rounded-lg border bg-slate-100" aria-label={`Open ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-48 w-full object-contain transition group-hover:scale-105" loading="lazy" />
          <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">{label} · tap to zoom</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] max-w-[95vw] gap-2 p-3 sm:max-w-3xl">
        <DialogTitle className="text-base">{label}</DialogTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
            <ZoomIn /> Zoom in
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1}>
            <ZoomOut /> Zoom out
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={src} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Full size
            </a>
          </Button>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-md bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="mx-auto block" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

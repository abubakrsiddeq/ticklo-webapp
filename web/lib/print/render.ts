/**
 * Draws a TicketDesign with Konva. Used by the editor, the template
 * thumbnails and the PDF export, so all three look exactly the same.
 * Browser only: pass the Konva module in (it is loaded with import()).
 */
import type KonvaNS from "konva";
import {
  BRAND_HEIGHT_RATIO,
  QR_CAPTION_RATIO,
  drawOrder,
  fillPlaceholders,
  type Fill,
  type ImageLayer,
  type Layer,
  type PlaceholderValues,
  type TicketDesign,
} from "./design";
import { fontById, konvaFont, loadFonts } from "./fonts";
import { QR_MARGIN_MODULES, qrMatrix } from "./qr-matrix";

export type Konva = typeof KonvaNS;
type KNode = InstanceType<Konva["Group"]>;

export const BRAND_LOGO = { light: "/brand/ticklo-logo.png", dark: "/brand/ticklo-logo-on-dark.png" } as const;
export const BRAND_LABEL = "TICKET PARTNER";
const BRAND_COLOURS = { light: "#0B1F3A", dark: "#FFFFFF" } as const;
const SYSTEM_BOLD = "Helvetica, Arial, sans-serif";

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Absolute URL → same-origin proxy so the canvas stays exportable (no CORS taint). */
export function resolveImageSrc(src: string, values: PlaceholderValues): string | null {
  const raw = src.trim() === "{{poster}}" ? values.poster : src;
  if (!raw) return null;
  if (raw.startsWith("/") || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (/^https?:\/\//i.test(raw)) {
    if (typeof window !== "undefined" && raw.startsWith(window.location.origin)) return raw;
    return `/api/print-image?src=${encodeURIComponent(raw)}`;
  }
  return null;
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
    // A failed load should be retried next time
    p.then((img) => {
      if (!img) imageCache.delete(url);
    });
  }
  return p;
}

export interface RenderAssets {
  images: Map<string, HTMLImageElement>;
}

/** Download every image and font the design needs. */
export async function prepareAssets(design: TicketDesign, values: PlaceholderValues): Promise<RenderAssets> {
  const urls = new Set<string>([BRAND_LOGO.light, BRAND_LOGO.dark]);
  for (const l of design.layers) {
    if (l.type === "image") {
      const u = resolveImageSrc(l.src, values);
      if (u) urls.add(u);
    }
  }
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...urls].map(async (u) => {
      const img = await loadImage(u);
      if (img) images.set(u, img);
    }),
  );
  await loadFonts(
    design.layers.flatMap((l) => (l.type === "text" ? [{ fontFamily: l.fontFamily, text: fillPlaceholders(l.text, values), italic: l.italic }] : [])),
  );
  return { images };
}

// ---------------------------------------------------------------------------
// Fills
// ---------------------------------------------------------------------------

function fillProps(fill: Fill | undefined, w: number, h: number): Record<string, unknown> {
  if (!fill) return {};
  if (typeof fill === "string") return { fill };
  const a = (fill.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return {
    fillPriority: "linear-gradient",
    fillLinearGradientStartPoint: { x: cx - (dx * len) / 2, y: cy - (dy * len) / 2 },
    fillLinearGradientEndPoint: { x: cx + (dx * len) / 2, y: cy + (dy * len) / 2 },
    fillLinearGradientColorStops: fill.stops.flatMap(([o, c]) => [o, c]),
  };
}

// ---------------------------------------------------------------------------
// QR preview (the PDF draws the real QR as vectors)
// ---------------------------------------------------------------------------

const qrCanvasCache = new Map<string, HTMLCanvasElement>();

export function qrCanvas(token: string, dark = "#000000"): HTMLCanvasElement {
  const key = `${dark}|${token}`;
  const hit = qrCanvasCache.get(key);
  if (hit) return hit;
  const m = qrMatrix(token);
  const px = 12; // preview only – the PDF draws the QR as vectors
  const n = m.size + QR_MARGIN_MODULES * 2;
  const canvas = document.createElement("canvas");
  canvas.width = n * px;
  canvas.height = n * px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark(r, c)) ctx.fillRect((c + QR_MARGIN_MODULES) * px, (r + QR_MARGIN_MODULES) * px, px, px);
    }
  }
  if (qrCanvasCache.size > 50) qrCanvasCache.clear();
  qrCanvasCache.set(key, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Layer → Konva group
// ---------------------------------------------------------------------------

export interface BuildOptions {
  values: PlaceholderValues;
  assets: RenderAssets;
  /** Token for the QR preview; omit to draw only the white QR box (PDF adds the real QR). */
  qrToken?: string | null;
  /** Editor: show a grey box for images that are not loaded yet. */
  placeholders?: boolean;
  /** Extend shapes that touch the ticket edge by this many units (print bleed). */
  bleed?: number;
  designSize?: { width: number; height: number };
}

export function qrCaptionMetrics(size: number) {
  const captionH = size * QR_CAPTION_RATIO;
  const fontSize = size * 0.095;
  return { captionH, fontSize };
}

export function brandMetrics(width: number) {
  return {
    labelSize: width * 0.072,
    labelSpacing: width * 0.012,
    logoY: width * 0.105,
    logoH: width * (280 / 1200),
    height: width * BRAND_HEIGHT_RATIO,
  };
}

function extendForBleed(l: { x: number; y: number; width: number; height: number; rotation?: number }, bleed: number, size?: { width: number; height: number }) {
  if (!bleed || !size || (l.rotation ?? 0) !== 0) return { dx: 0, dy: 0, dw: 0, dh: 0 };
  const near = 2;
  let dx = 0,
    dy = 0,
    dw = 0,
    dh = 0;
  if (l.x <= near) {
    dx = -bleed - l.x;
    dw += bleed + l.x;
  }
  if (l.y <= near) {
    dy = -bleed - l.y;
    dh += bleed + l.y;
  }
  if (l.x + l.width >= size.width - near) dw += bleed + (size.width - l.x - l.width);
  if (l.y + l.height >= size.height - near) dh += bleed + (size.height - l.y - l.height);
  return { dx, dy, dw, dh };
}

function imageContent(K: Konva, l: ImageLayer, opts: BuildOptions, box: { x: number; y: number; w: number; h: number }): KonvaNS.Shape | null {
  const url = resolveImageSrc(l.src, opts.values);
  const img = url ? opts.assets.images.get(url) : undefined;
  if (!img) {
    if (!opts.placeholders) return null;
    return new K.Rect({ x: box.x, y: box.y, width: box.w, height: box.h, fill: "#E2E8F0", stroke: "#94A3B8", strokeWidth: 4, dash: [16, 10], cornerRadius: l.cornerRadius ?? 0 });
  }
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const fit = l.fit ?? "cover";
  if (fit === "contain") {
    const s = Math.min(box.w / iw, box.h / ih);
    const w = iw * s;
    const h = ih * s;
    return new K.Image({ image: img, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h, cornerRadius: l.cornerRadius ?? 0 });
  }
  if (fit === "stretch") {
    return new K.Image({ image: img, x: box.x, y: box.y, width: box.w, height: box.h, cornerRadius: l.cornerRadius ?? 0 });
  }
  const s = Math.max(box.w / iw, box.h / ih);
  const cw = box.w / s;
  const ch = box.h / s;
  return new K.Image({
    image: img,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    crop: { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch },
    cornerRadius: l.cornerRadius ?? 0,
  });
}

export function textContent(K: Konva, l: Extract<Layer, { type: "text" }>, values: PlaceholderValues) {
  let text = fillPlaceholders(l.text, values);
  if (l.uppercase) text = text.toUpperCase();
  const rtl = /[؀-ۿ]/.test(text);
  return new K.Text({
    text,
    width: l.width,
    fontSize: l.fontSize,
    ...konvaFont(l.fontFamily, l.italic),
    fill: l.fill,
    align: l.align ?? "left",
    letterSpacing: l.letterSpacing ?? 0,
    lineHeight: l.lineHeight ?? (fontById(l.fontFamily).family === "Noto Nastaliq Urdu" ? 1.9 : 1.15),
    stroke: l.stroke && l.strokeWidth ? l.stroke : undefined,
    strokeWidth: l.strokeWidth ?? 0,
    fillAfterStrokeEnabled: true,
    wrap: "word",
    ...(rtl ? { direction: "rtl" } : {}),
  });
}

/** One Konva group per layer, positioned at the layer's x/y with its rotation and opacity. */
export function buildLayerNode(K: Konva, l: Layer, opts: BuildOptions): KNode {
  const g = new K.Group({ id: l.id, name: `layer layer-${l.type}`, x: l.x, y: l.y, rotation: l.rotation ?? 0, opacity: l.opacity ?? 1 });
  switch (l.type) {
    case "text":
      g.add(textContent(K, l, opts.values));
      break;
    case "rect": {
      const e = extendForBleed(l, opts.bleed ?? 0, opts.designSize);
      const w = l.width + e.dw;
      const h = l.height + e.dh;
      g.add(
        new K.Rect({
          x: e.dx,
          y: e.dy,
          width: w,
          height: h,
          ...fillProps(l.fill, w, h),
          stroke: l.stroke && l.strokeWidth ? l.stroke : undefined,
          strokeWidth: l.strokeWidth ?? 0,
          cornerRadius: l.cornerRadius ?? 0,
          dash: l.dash,
        }),
      );
      break;
    }
    case "ellipse": {
      const fp = fillProps(l.fill, l.width, l.height);
      g.add(
        new K.Ellipse({
          x: l.width / 2,
          y: l.height / 2,
          radiusX: l.width / 2,
          radiusY: l.height / 2,
          ...fp,
          // Gradient points of an ellipse are relative to its centre
          ...(typeof l.fill === "string" ? {} : shiftGradient(fp, -l.width / 2, -l.height / 2)),
          stroke: l.stroke && l.strokeWidth ? l.stroke : undefined,
          strokeWidth: l.strokeWidth ?? 0,
        }),
      );
      break;
    }
    case "line":
      g.add(
        new K.Line({
          points: [0, 0, l.width, 0],
          stroke: l.stroke,
          strokeWidth: l.strokeWidth,
          dash: l.dash,
          lineCap: l.lineCap ?? "butt",
          hitStrokeWidth: Math.max(30, l.strokeWidth),
        }),
      );
      break;
    case "path": {
      const sx = l.width / l.viewBox[0];
      const sy = l.height / l.viewBox[1];
      g.add(
        new K.Path({
          data: l.data,
          scaleX: sx,
          scaleY: sy,
          ...fillProps(l.fill, l.viewBox[0], l.viewBox[1]),
          stroke: l.stroke && l.strokeWidth ? l.stroke : undefined,
          strokeWidth: (l.strokeWidth ?? 0) / Math.max(sx, sy),
        }),
      );
      // Invisible box so the whole area is clickable in the editor
      g.add(new K.Rect({ width: l.width, height: l.height, fill: "rgba(0,0,0,0)", listening: true }));
      break;
    }
    case "image": {
      const e = extendForBleed(l, opts.bleed ?? 0, opts.designSize);
      const node = imageContent(K, l, opts, { x: e.dx, y: e.dy, w: l.width + e.dw, h: l.height + e.dh });
      if (node) g.add(node);
      g.add(new K.Rect({ width: l.width, height: l.height, fill: "rgba(0,0,0,0)" }));
      break;
    }
    case "qr": {
      const caption = l.caption !== false;
      const { captionH, fontSize } = qrCaptionMetrics(l.size);
      g.add(new K.Rect({ width: l.size, height: l.size + (caption ? captionH : 0), fill: "#FFFFFF", cornerRadius: l.size * 0.03 }));
      if (opts.qrToken) {
        g.add(new K.Image({ image: qrCanvas(opts.qrToken, l.dark ?? "#000000"), width: l.size, height: l.size }));
      }
      if (caption && opts.qrToken !== undefined) {
        g.add(
          new K.Text({
            text: opts.values.serial ?? "",
            width: l.size,
            y: l.size - l.size * 0.02 + (captionH - fontSize) / 2,
            fontSize,
            fontFamily: SYSTEM_BOLD,
            fontStyle: "bold",
            fill: l.dark ?? "#000000",
            align: "center",
            letterSpacing: fontSize * 0.08,
          }),
        );
      }
      break;
    }
    case "brand": {
      const v = l.variant ?? "light";
      const m = brandMetrics(l.width);
      g.add(
        new K.Text({
          text: BRAND_LABEL,
          width: l.width,
          fontSize: m.labelSize,
          fontFamily: SYSTEM_BOLD,
          fontStyle: "bold",
          letterSpacing: m.labelSpacing,
          fill: BRAND_COLOURS[v],
        }),
      );
      const logo = opts.assets.images.get(BRAND_LOGO[v]);
      if (logo) g.add(new K.Image({ image: logo, y: m.logoY, width: l.width, height: m.logoH }));
      g.add(new K.Rect({ width: l.width, height: l.height, fill: "rgba(0,0,0,0)" }));
      break;
    }
  }
  return g;
}

function shiftGradient(p: Record<string, unknown>, dx: number, dy: number): Record<string, unknown> {
  const s = p.fillLinearGradientStartPoint as { x: number; y: number } | undefined;
  const e = p.fillLinearGradientEndPoint as { x: number; y: number } | undefined;
  if (!s || !e) return {};
  return {
    fillLinearGradientStartPoint: { x: s.x + dx, y: s.y + dy },
    fillLinearGradientEndPoint: { x: e.x + dx, y: e.y + dy },
  };
}

export function backgroundNode(K: Konva, design: TicketDesign, bleed = 0) {
  const w = design.width + bleed * 2;
  const h = design.height + bleed * 2;
  return new K.Rect({ name: "background", x: -bleed, y: -bleed, width: w, height: h, ...fillProps(design.background, w, h), listening: false });
}

/** Add every visible layer (QR + brand on top) to a Konva container. */
export function addLayers(K: Konva, target: InstanceType<Konva["Layer"]> | KNode, design: TicketDesign, opts: BuildOptions, skip?: (l: Layer) => boolean) {
  for (const l of drawOrder(design.layers)) {
    if (l.hidden || skip?.(l)) continue;
    target.add(buildLayerNode(K, l, { ...opts, designSize: { width: design.width, height: design.height } }));
  }
}

/**
 * Render the design to a canvas (thumbnails and the PDF artwork).
 * `bleed` (design units) adds an outer margin filled by edge shapes.
 */
export function renderToCanvas(
  K: Konva,
  design: TicketDesign,
  opts: BuildOptions & { pixelRatio: number; skip?: (l: Layer) => boolean },
): HTMLCanvasElement {
  const bleed = opts.bleed ?? 0;
  const container = document.createElement("div");
  const stage = new K.Stage({ container, width: design.width + bleed * 2, height: design.height + bleed * 2 });
  const layer = new K.Layer({ listening: false });
  stage.add(layer);
  const root = new K.Group({ x: bleed, y: bleed });
  layer.add(root);
  root.add(backgroundNode(K, design, bleed));
  addLayers(K, root, design, opts, opts.skip);
  layer.draw();
  const canvas = layer.toCanvas({ pixelRatio: opts.pixelRatio }) as HTMLCanvasElement;
  stage.destroy();
  return canvas;
}

export async function loadKonva(): Promise<Konva> {
  const mod = await import("konva");
  return mod.default;
}

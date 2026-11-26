/**
 * Building blocks for printed-ticket templates: layer builders, generated
 * ornaments, category icons and the tear-off stub. All artwork is original.
 */
import type { BrandLayer, Fill, Layer, QrLayer, TicketDesign } from "./design";

export const W = 1800;
export const H = 650;
export const STUB_X = 1380;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

export type Extra<T> = Partial<Omit<T, "type" | "id">>;

export const text = (id: string, t: string, x: number, y: number, width: number, fontSize: number, fontFamily: string, fill: string, extra: Extra<Extract<Layer, { type: "text" }>> = {}): Layer => ({
  id, type: "text", text: t, x, y, width, fontSize, fontFamily, fill, ...extra,
});
export const rect = (id: string, x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "rect" }>> = {}): Layer => ({
  id, type: "rect", x, y, width, height, fill, ...extra,
});
export const ellipse = (id: string, x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "ellipse" }>> = {}): Layer => ({
  id, type: "ellipse", x, y, width, height, fill, ...extra,
});
export const line = (id: string, x: number, y: number, width: number, stroke: string, strokeWidth: number, extra: Extra<Extract<Layer, { type: "line" }>> = {}): Layer => ({
  id, type: "line", x, y, width, stroke, strokeWidth, ...extra,
});
export const path = (id: string, data: string, viewBox: [number, number], x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "path" }>> = {}): Layer => ({
  id, type: "path", data, viewBox, x, y, width, height, fill, ...extra,
});
export const image = (id: string, src: string, x: number, y: number, width: number, height: number, extra: Extra<Extract<Layer, { type: "image" }>> = {}): Layer => ({
  id, type: "image", src, x, y, width, height, fit: "cover", ...extra,
});
export const qr = (dark = "#0B1F3A", x = 1050, y = 70, size = 290): QrLayer => ({ id: "qr", type: "qr", name: "QR code", x, y, size, dark, caption: true });
export const brand = (variant: "light" | "dark", x = 1050, y = 490, width = 290): BrandLayer => ({
  id: "brand", type: "brand", name: "Ticket partner: TickLO", x, y, width, height: Math.round(width * 0.35), variant,
});
export const linear = (angle: number, ...stops: [number, string][]): Fill => ({ type: "linear", angle, stops });

// ---------------------------------------------------------------------------
// Generated ornaments
// ---------------------------------------------------------------------------

export const f = (n: number) => Math.round(n * 10) / 10;

export function star(cx: number, cy: number, points: number, outer: number, inner: number, rot = -90): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    d += `${i === 0 ? "M" : "L"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return d + "Z";
}

export const starRow = (w: number, h: number, n: number, points = 8, innerRatio = 0.55) => {
  const step = w / n;
  let d = "";
  for (let i = 0; i < n; i++) d += star(step * i + step / 2, h / 2, points, h / 2, (h / 2) * innerRatio, -90 + 180 / points / 2);
  return d;
};

export const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;

export const dotGrid = (w: number, h: number, gap: number, r: number) => {
  let d = "";
  for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) d += circle(x, y, r);
  return d;
};

export const checker = (w: number, h: number, s: number) => {
  let d = "";
  for (let row = 0; row * s < h; row++) for (let col = 0; col * s < w; col++) if ((row + col) % 2 === 0) d += `M${col * s} ${row * s}h${s}v${s}h${-s}Z`;
  return d;
};

export const bunting = (w: number, h: number, n: number, offset: number, every: number) => {
  const step = w / n;
  let d = "";
  for (let i = offset; i < n; i += every) d += `M${f(i * step)} 0L${f((i + 1) * step)} 0L${f(i * step + step / 2)} ${h}Z`;
  return d;
};

export const bars = (w: number, h: number, n: number, seed: number) => {
  const step = w / n;
  let d = "";
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const bh = h * (0.18 + 0.82 * Math.abs(Math.sin(i * 0.55 + seed)) * (0.55 + (s / 233280) * 0.45));
    d += `M${f(i * step + step * 0.18)} ${f(h - bh)}h${f(step * 0.64)}v${f(bh)}h${f(-step * 0.64)}Z`;
  }
  return d;
};

export const DOME =
  "M150 300V200C150 140 200 120 250 60C300 120 350 140 350 200V300Z M246 62V24h8V62Z M250 4a14 14 0 1 0 0.1 0Z " +
  "M60 300V118l15-34 15 34V300Z M410 300V118l15-34 15 34V300Z M110 300V232C110 204 130 196 140 180C150 196 170 204 170 232V300Z " +
  "M330 300V232C330 204 350 196 360 180C370 196 390 204 390 232V300Z";
export const LANTERN = "M45 0h10v15H45Z M30 15h40l10 25H20Z M20 40h60c6 40 6 80 0 120H20c-6-40-6-80 0-120Z M30 160h40l-10 25H40Z M47 185h6v15h-6Z";
export const NOTES =
  "M80 40L180 10V200C180 230 150 250 120 250C90 250 75 235 75 215C75 190 100 175 125 175C140 175 150 180 155 185V70L100 85V230C100 260 70 280 45 280C20 280 5 265 5 245C5 220 30 205 55 205C65 205 75 208 80 212Z";
export const CAR =
  "M20 150C20 122 40 112 80 108L190 100C232 70 282 46 350 46C420 46 462 70 502 100L556 108C576 112 586 126 586 150V164H20Z";
export const TROPHY =
  "M40 20H160V70C160 120 130 145 110 150V185H140V205H60V185H90V150C70 145 40 120 40 70Z M40 35H15C15 80 30 95 45 100V88C35 85 28 75 27 47H40Z " +
  "M160 35H185C185 80 170 95 155 100V88C165 85 172 75 173 47H160Z M50 212H150V236H50Z";
export const MOUNTAINS_BACK = "M0 300L0 190L150 80L250 150L420 30L560 170L700 90L860 210L1010 100L1160 200L1270 130L1380 180L1380 300Z";
export const MOUNTAINS_FRONT = "M0 300L0 240L120 170L230 220L380 120L520 230L660 160L800 250L960 170L1110 240L1250 190L1380 230L1380 300Z";

/** The tear-off stub with serial number and space for the buyer's details. */
export function stub(o: { bg: Fill; ink: string; accent: string; title: string; body: string; rule: string; notch?: string; perf?: string }): Layer[] {
  return [
    rect("stub-bg", STUB_X, 0, W - STUB_X, H, o.bg, { name: "Stub background" }),
    line("perf", STUB_X, 30, H - 60, o.perf ?? o.rule, 4, { rotation: 90, dash: [14, 12], name: "Tear line" }),
    ellipse("notch-top", STUB_X - 28, -28, 56, 56, o.notch ?? "#FFFFFF", { name: "Notch" }),
    ellipse("notch-bottom", STUB_X - 28, H - 28, 56, 56, o.notch ?? "#FFFFFF", { name: "Notch" }),
    text("stub-title", "{{event_name}}", STUB_X + 45, 50, 330, 40, o.title, o.ink, { uppercase: true, lineHeight: 1.1, name: "Stub title", fitHeight: 100 }),
    text("stub-date", "{{date}} · {{time}}", STUB_X + 45, 160, 330, 24, o.body, o.ink, { opacity: 0.85 }),
    text("stub-type", "{{ticket_type}} · {{price}}", STUB_X + 45, 200, 330, 26, o.body, o.accent),
    text("stub-serial-label", "TICKET NO.", STUB_X + 45, 265, 330, 20, "poppins-600", o.ink, { letterSpacing: 4, opacity: 0.7 }),
    text("stub-serial", "{{serial}}", STUB_X + 45, 292, 330, 52, "grotesk-700", o.ink, { letterSpacing: 2 }),
    text("stub-name", "Name", STUB_X + 45, 400, 100, 22, "poppins-400", o.ink, { opacity: 0.8 }),
    line("stub-name-line", STUB_X + 125, 422, 250, o.rule, 2),
    text("stub-phone", "Phone", STUB_X + 45, 465, 100, 22, "poppins-400", o.ink, { opacity: 0.8 }),
    line("stub-phone-line", STUB_X + 125, 487, 250, o.rule, 2),
    text("stub-note", "Seller keeps this part", STUB_X + 45, 575, 330, 18, "poppins-400", o.ink, { opacity: 0.6, letterSpacing: 1 }),
  ];
}

export const design = (background: Fill, layers: Layer[]): TicketDesign => ({ version: 1, width: W, height: H, background, layers });

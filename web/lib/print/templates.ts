/**
 * Built-in printed-ticket templates (PRT-01). All artwork is original and
 * made of vector shapes, so it prints sharp at any size. Every template is
 * 180 × 65 mm: the main part (with the QR, kept by the guest) and a 42 mm
 * tear-off stub (kept by the seller, with space for the buyer's name/phone).
 */
import type { BrandLayer, Fill, Layer, QrLayer, TicketDesign } from "./design";

export const TEMPLATE_CATEGORIES = [
  { key: "qawwali", label: "Qawwali" },
  { key: "dj-night", label: "DJ Night" },
  { key: "concert", label: "Concert" },
  { key: "trip", label: "Trip / Tour" },
  { key: "auto-show", label: "Auto Show" },
  { key: "sports", label: "Sports" },
  { key: "conference", label: "Conference" },
  { key: "festival", label: "Festival / Mela" },
  { key: "general", label: "General" },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["key"];

export interface TicketTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  design: TicketDesign;
}

const W = 1800;
const H = 650;
const STUB_X = 1380;

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

type Extra<T> = Partial<Omit<T, "type" | "id">>;

const text = (id: string, t: string, x: number, y: number, width: number, fontSize: number, fontFamily: string, fill: string, extra: Extra<Extract<Layer, { type: "text" }>> = {}): Layer => ({
  id, type: "text", text: t, x, y, width, fontSize, fontFamily, fill, ...extra,
});
const rect = (id: string, x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "rect" }>> = {}): Layer => ({
  id, type: "rect", x, y, width, height, fill, ...extra,
});
const ellipse = (id: string, x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "ellipse" }>> = {}): Layer => ({
  id, type: "ellipse", x, y, width, height, fill, ...extra,
});
const line = (id: string, x: number, y: number, width: number, stroke: string, strokeWidth: number, extra: Extra<Extract<Layer, { type: "line" }>> = {}): Layer => ({
  id, type: "line", x, y, width, stroke, strokeWidth, ...extra,
});
const path = (id: string, data: string, viewBox: [number, number], x: number, y: number, width: number, height: number, fill: Fill, extra: Extra<Extract<Layer, { type: "path" }>> = {}): Layer => ({
  id, type: "path", data, viewBox, x, y, width, height, fill, ...extra,
});
const image = (id: string, src: string, x: number, y: number, width: number, height: number, extra: Extra<Extract<Layer, { type: "image" }>> = {}): Layer => ({
  id, type: "image", src, x, y, width, height, fit: "cover", ...extra,
});
const qr = (dark = "#0B1F3A", x = 1050, y = 70, size = 290): QrLayer => ({ id: "qr", type: "qr", name: "QR code", x, y, size, dark, caption: true });
const brand = (variant: "light" | "dark", x = 1050, y = 490, width = 290): BrandLayer => ({
  id: "brand", type: "brand", name: "Ticket partner: TickLO", x, y, width, height: Math.round(width * 0.35), variant,
});
const linear = (angle: number, ...stops: [number, string][]): Fill => ({ type: "linear", angle, stops });

// ---------------------------------------------------------------------------
// Generated ornaments
// ---------------------------------------------------------------------------

const f = (n: number) => Math.round(n * 10) / 10;

function star(cx: number, cy: number, points: number, outer: number, inner: number, rot = -90): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    d += `${i === 0 ? "M" : "L"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return d + "Z";
}

const starRow = (w: number, h: number, n: number, points = 8, innerRatio = 0.55) => {
  const step = w / n;
  let d = "";
  for (let i = 0; i < n; i++) d += star(step * i + step / 2, h / 2, points, h / 2, (h / 2) * innerRatio, -90 + 180 / points / 2);
  return d;
};

const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;

const dotGrid = (w: number, h: number, gap: number, r: number) => {
  let d = "";
  for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) d += circle(x, y, r);
  return d;
};

const checker = (w: number, h: number, s: number) => {
  let d = "";
  for (let row = 0; row * s < h; row++) for (let col = 0; col * s < w; col++) if ((row + col) % 2 === 0) d += `M${col * s} ${row * s}h${s}v${s}h${-s}Z`;
  return d;
};

const bunting = (w: number, h: number, n: number, offset: number, every: number) => {
  const step = w / n;
  let d = "";
  for (let i = offset; i < n; i += every) d += `M${f(i * step)} 0L${f((i + 1) * step)} 0L${f(i * step + step / 2)} ${h}Z`;
  return d;
};

const bars = (w: number, h: number, n: number, seed: number) => {
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

const DOME =
  "M150 300V200C150 140 200 120 250 60C300 120 350 140 350 200V300Z M246 62V24h8V62Z M250 4a14 14 0 1 0 0.1 0Z " +
  "M60 300V118l15-34 15 34V300Z M410 300V118l15-34 15 34V300Z M110 300V232C110 204 130 196 140 180C150 196 170 204 170 232V300Z " +
  "M330 300V232C330 204 350 196 360 180C370 196 390 204 390 232V300Z";
const LANTERN = "M45 0h10v15H45Z M30 15h40l10 25H20Z M20 40h60c6 40 6 80 0 120H20c-6-40-6-80 0-120Z M30 160h40l-10 25H40Z M47 185h6v15h-6Z";
const NOTES =
  "M80 40L180 10V200C180 230 150 250 120 250C90 250 75 235 75 215C75 190 100 175 125 175C140 175 150 180 155 185V70L100 85V230C100 260 70 280 45 280C20 280 5 265 5 245C5 220 30 205 55 205C65 205 75 208 80 212Z";
const CAR =
  "M20 150C20 122 40 112 80 108L190 100C232 70 282 46 350 46C420 46 462 70 502 100L556 108C576 112 586 126 586 150V164H20Z";
const TROPHY =
  "M40 20H160V70C160 120 130 145 110 150V185H140V205H60V185H90V150C70 145 40 120 40 70Z M40 35H15C15 80 30 95 45 100V88C35 85 28 75 27 47H40Z " +
  "M160 35H185C185 80 170 95 155 100V88C165 85 172 75 173 47H160Z M50 212H150V236H50Z";
const MOUNTAINS_BACK = "M0 300L0 190L150 80L250 150L420 30L560 170L700 90L860 210L1010 100L1160 200L1270 130L1380 180L1380 300Z";
const MOUNTAINS_FRONT = "M0 300L0 240L120 170L230 220L380 120L520 230L660 160L800 250L960 170L1110 240L1250 190L1380 230L1380 300Z";

/** The tear-off stub with serial number and space for the buyer's details. */
function stub(o: { bg: Fill; ink: string; accent: string; title: string; body: string; rule: string; notch?: string; perf?: string }): Layer[] {
  return [
    rect("stub-bg", STUB_X, 0, W - STUB_X, H, o.bg, { name: "Stub background" }),
    line("perf", STUB_X, 30, H - 60, o.perf ?? o.rule, 4, { rotation: 90, dash: [14, 12], name: "Tear line" }),
    ellipse("notch-top", STUB_X - 28, -28, 56, 56, o.notch ?? "#FFFFFF", { name: "Notch" }),
    ellipse("notch-bottom", STUB_X - 28, H - 28, 56, 56, o.notch ?? "#FFFFFF", { name: "Notch" }),
    text("stub-title", "{{event_name}}", STUB_X + 45, 50, 330, 40, o.title, o.ink, { uppercase: true, lineHeight: 1.1, name: "Stub title" }),
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

const design = (background: Fill, layers: Layer[]): TicketDesign => ({ version: 1, width: W, height: H, background, layers });

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const GOLD = "#E9C46A";
const GOLD_SOFT = "#F6E3B4";

export const TEMPLATES: TicketTemplate[] = [
  {
    key: "qawwali-royal",
    name: "Royal Qawwali",
    category: "qawwali",
    design: design(linear(0, [0, "#2A0B3D"], [0.55, "#4A1240"], [1, "#6B1A2E"]), [
      path("dome", DOME, [500, 300], 40, 250, 700, 420, GOLD, { opacity: 0.12, name: "Mosque" }),
      path("stars-top", starRow(1380, 40, 26), [1380, 40], 0, 18, STUB_X, 40, GOLD, { opacity: 0.55, name: "Stars" }),
      path("stars-bottom", starRow(1380, 40, 26), [1380, 40], 0, 592, STUB_X, 40, GOLD, { opacity: 0.55, name: "Stars" }),
      text("urdu", "قوالی نائٹ", 70, 70, 900, 70, "nastaliq-700", GOLD_SOFT, { opacity: 0.9 }),
      text("title", "{{event_name}}", 70, 200, 940, 96, "cinzel-700", GOLD, { uppercase: true, lineHeight: 1.05, letterSpacing: 2 }),
      line("rule", 72, 330, 420, GOLD, 3),
      text("date", "{{date}}  ·  {{time}}", 70, 360, 900, 40, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 70, 412, 900, 34, "poppins-400", GOLD_SOFT),
      rect("price-chip", 70, 478, 360, 76, GOLD, { cornerRadius: 38 }),
      text("price", "{{ticket_type}} · {{price}}", 70, 497, 360, 34, "poppins-800", "#2A0B3D", { align: "center" }),
      qr("#2A0B3D"),
      brand("dark"),
      ...stub({ bg: "#FFF7E6", ink: "#3B0F2F", accent: "#8A1C3A", title: "cinzel-700", body: "poppins-600", rule: "#C9A45C", notch: "#FFFFFF" }),
    ]),
  },
  {
    key: "qawwali-sufi",
    name: "Sufi Night",
    category: "qawwali",
    design: design(linear(90, [0, "#0D4A37"], [1, "#062A1F"]), [
      path("medallion", star(300, 300, 8, 300, 230, -90 + 22.5) + star(300, 300, 8, 200, 150, -90), [600, 600], -150, 25, 600, 600, GOLD, { opacity: 0.1, name: "Medallion" }),
      path("lantern-1", LANTERN, [100, 200], 860, 0, 70, 140, GOLD, { opacity: 0.85 }),
      path("lantern-2", LANTERN, [100, 200], 950, 0, 50, 100, GOLD, { opacity: 0.6 }),
      line("lantern-1-cord", 895, -20, 20, GOLD, 3, { rotation: 90 }),
      text("kicker", "AN EVENING OF SUFI MUSIC", 80, 80, 800, 28, "poppins-600", GOLD, { letterSpacing: 8 }),
      text("title", "{{event_name}}", 80, 130, 900, 104, "playfair-700", "#FFFFFF", { lineHeight: 1.0 }),
      text("society", "presented by {{society}}", 80, 345, 800, 32, "poppins-400", GOLD_SOFT, { italic: true }),
      rect("info-box", 80, 410, 860, 150, "rgba(233,196,106,0.12)", { stroke: GOLD, strokeWidth: 2, cornerRadius: 18 }),
      text("info-date-label", "DATE", 110, 432, 260, 20, "poppins-600", GOLD, { letterSpacing: 4 }),
      text("info-date", "{{date}}", 110, 460, 300, 34, "poppins-600", "#FFFFFF"),
      text("info-time-label", "TIME", 430, 432, 200, 20, "poppins-600", GOLD, { letterSpacing: 4 }),
      text("info-time", "{{time}}", 430, 460, 200, 34, "poppins-600", "#FFFFFF"),
      text("info-price-label", "ENTRY", 650, 432, 260, 20, "poppins-600", GOLD, { letterSpacing: 4 }),
      text("info-price", "{{price}}", 650, 460, 270, 34, "poppins-800", GOLD),
      text("info-venue", "{{venue}}", 110, 510, 800, 28, "poppins-400", GOLD_SOFT),
      qr("#062A1F"),
      brand("dark"),
      ...stub({ bg: "#F4EBD0", ink: "#0D3B2E", accent: "#0D6B4E", title: "playfair-700", body: "poppins-600", rule: "#B89A55" }),
    ]),
  },
  {
    key: "dj-neon",
    name: "Neon DJ Night",
    category: "dj-night",
    design: design("#07070F", [
      ellipse("glow-1", -200, -250, 900, 700, linear(45, [0, "rgba(255,0,153,0.55)"], [1, "rgba(255,0,153,0)"]), { name: "Glow" }),
      ellipse("glow-2", 600, 250, 900, 650, linear(225, [0, "rgba(0,229,255,0.45)"], [1, "rgba(0,229,255,0)"]), { name: "Glow" }),
      path("eq", bars(1380, 240, 46, 3), [1380, 240], 0, 410, STUB_X, 240, linear(0, [0, "#FF0099"], [0.5, "#8B5CF6"], [1, "#00E5FF"]), { opacity: 0.45, name: "Equalizer" }),
      text("kicker", "{{society}} PRESENTS", 80, 70, 900, 26, "poppins-600", "#00E5FF", { letterSpacing: 8, uppercase: true }),
      text("title", "{{event_name}}", 80, 115, 920, 110, "orbitron-800", "#FFFFFF", { uppercase: true, lineHeight: 1.0, stroke: "#FF0099", strokeWidth: 3 }),
      text("date", "{{weekday}} {{day}} {{month}} · {{time}}", 80, 345, 900, 44, "bebas-400", "#FF5BC0", { letterSpacing: 3 }),
      text("venue", "{{venue}}", 80, 398, 900, 32, "poppins-600", "#E0E7FF"),
      rect("price-chip", 80, 470, 380, 80, linear(0, [0, "#FF0099"], [1, "#8B5CF6"]), { cornerRadius: 14 }),
      text("price", "{{ticket_type}} · {{price}}", 80, 490, 380, 36, "poppins-800", "#FFFFFF", { align: "center" }),
      qr("#07070F"),
      brand("dark"),
      ...stub({ bg: "#14142B", ink: "#FFFFFF", accent: "#00E5FF", title: "orbitron-800", body: "poppins-600", rule: "#8B5CF6", notch: "#FFFFFF" }),
    ]),
  },
  {
    key: "concert-gold",
    name: "Live Concert",
    category: "concert",
    design: design("#0B1F3A", [
      rect("band-1", 760, -200, 120, 1100, linear(90, [0, "#F59E0B"], [1, "#FBBF24"]), { rotation: 25, opacity: 0.95, name: "Stripe" }),
      rect("band-2", 900, -200, 40, 1100, "#FBBF24", { rotation: 25, opacity: 0.6, name: "Stripe" }),
      path("notes", NOTES, [200, 300], 610, 300, 160, 240, "#FBBF24", { opacity: 0.25 }),
      text("kicker", "LIVE IN CONCERT", 80, 70, 700, 30, "poppins-600", "#FBBF24", { letterSpacing: 10 }),
      text("title", "{{event_name}}", 80, 115, 700, 120, "bebas-400", "#FFFFFF", { lineHeight: 0.95, uppercase: true }),
      rect("date-box", 80, 380, 230, 150, "#FFFFFF", { cornerRadius: 10 }),
      text("date-day", "{{day}}", 80, 388, 230, 84, "bebas-400", "#0B1F3A", { align: "center" }),
      text("date-month", "{{month}} {{year}}", 80, 470, 230, 32, "poppins-800", "#F59E0B", { align: "center" }),
      text("time", "{{weekday}} · {{time}}", 340, 395, 420, 38, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 340, 445, 420, 30, "poppins-400", "#CBD5E1"),
      text("price", "{{ticket_type}} · {{price}}", 340, 492, 420, 34, "poppins-800", "#FBBF24"),
      qr("#0B1F3A"),
      brand("dark"),
      ...stub({ bg: "#FFF8E8", ink: "#0B1F3A", accent: "#D97706", title: "bebas-400", body: "poppins-600", rule: "#F59E0B" }),
    ]),
  },
  {
    key: "trip-adventure",
    name: "Adventure Trip",
    category: "trip",
    design: design(linear(90, [0, "#7DD3FC"], [0.6, "#E0F2FE"], [1, "#FFFFFF"]), [
      ellipse("sun", 780, 70, 170, 170, linear(90, [0, "#FDE047"], [1, "#F59E0B"]), { name: "Sun" }),
      path("mount-back", MOUNTAINS_BACK, [1380, 300], 0, 350, STUB_X, 300, "#0EA5A4", { opacity: 0.55, name: "Mountains" }),
      path("mount-front", MOUNTAINS_FRONT, [1380, 300], 0, 350, STUB_X, 300, "#0F766E", { name: "Mountains" }),
      text("kicker", "LET'S GO", 80, 60, 600, 30, "poppins-800", "#0F766E", { letterSpacing: 10 }),
      text("title", "{{event_name}}", 80, 95, 760, 96, "pacifico-400", "#0B1F3A", { lineHeight: 1.25 }),
      text("date", "{{date}} · {{time}}", 80, 330, 760, 38, "poppins-600", "#0B1F3A"),
      text("venue", "Departure: {{venue}}", 80, 380, 760, 30, "poppins-600", "#FFFFFF", { stroke: "#0F766E", strokeWidth: 0 }),
      rect("price-chip", 80, 470, 380, 80, "#FFFFFF", { cornerRadius: 40, opacity: 0.95 }),
      text("price", "{{ticket_type}} · {{price}}", 80, 490, 380, 34, "poppins-800", "#0F766E", { align: "center" }),
      qr("#0B1F3A"),
      brand("light", 1050, 490),
      rect("brand-bg", 1035, 480, 320, 125, "#FFFFFF", { cornerRadius: 14, opacity: 0.9, name: "Logo background" }),
      ...stub({ bg: "#FFFFFF", ink: "#0B1F3A", accent: "#0F766E", title: "poppins-800", body: "poppins-600", rule: "#0EA5A4", notch: "#E0F2FE" }),
    ]),
  },
  {
    key: "auto-show",
    name: "Auto Show",
    category: "auto-show",
    design: design(linear(0, [0, "#111111"], [1, "#2B2B2B"]), [
      rect("stripe-red", 0, 440, STUB_X, 26, "#E11D48", { name: "Racing stripe" }),
      rect("stripe-white", 0, 476, STUB_X, 8, "#FFFFFF", { opacity: 0.85, name: "Racing stripe" }),
      path("checker", checker(240, 650, 40), [240, 650], 760, 0, 240, H, "#FFFFFF", { opacity: 0.07, name: "Checker" }),
      path("car", CAR, [600, 200], 520, 250, 480, 160, "#E11D48", { opacity: 0.9, name: "Car" }),
      ellipse("wheel-1", 604, 344, 64, 64, "#0A0A0A", { stroke: "#9CA3AF", strokeWidth: 8 }),
      ellipse("wheel-2", 868, 344, 64, 64, "#0A0A0A", { stroke: "#9CA3AF", strokeWidth: 8 }),
      text("kicker", "{{society}}", 80, 60, 900, 28, "poppins-600", "#F43F5E", { letterSpacing: 6, uppercase: true }),
      text("title", "{{event_name}}", 80, 100, 680, 92, "russo-400", "#FFFFFF", { uppercase: true, lineHeight: 1.05 }),
      text("date", "{{date}} · {{time}}", 80, 310, 460, 34, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 80, 356, 460, 28, "poppins-400", "#D1D5DB"),
      text("price", "{{ticket_type}} · {{price}}", 80, 525, 700, 44, "russo-400", "#FFFFFF"),
      qr("#111111"),
      brand("dark"),
      ...stub({ bg: "#F3F4F6", ink: "#111111", accent: "#E11D48", title: "russo-400", body: "poppins-600", rule: "#9CA3AF" }),
    ]),
  },
  {
    key: "sports-arena",
    name: "Sports Match",
    category: "sports",
    design: design("#15803D", [
      rect("field-1", 0, 0, 230, H, "#16A34A", { name: "Field stripe" }),
      rect("field-2", 460, 0, 230, H, "#16A34A", { name: "Field stripe" }),
      rect("field-3", 920, 0, 230, H, "#16A34A", { name: "Field stripe" }),
      ellipse("centre", 420, 175, 300, 300, "rgba(0,0,0,0)", { stroke: "#FFFFFF", strokeWidth: 5, opacity: 0.35 }),
      line("half", 570, 0, H, "#FFFFFF", 5, { rotation: 90, opacity: 0.35 }),
      path("trophy", TROPHY, [200, 240], 790, 300, 200, 240, GOLD, { opacity: 0.9, name: "Trophy" }),
      rect("panel", 50, 50, 720, 550, "rgba(4,47,26,0.72)", { cornerRadius: 24, name: "Panel" }),
      text("kicker", "MATCH DAY", 90, 85, 640, 30, "oswald-600", GOLD, { letterSpacing: 10 }),
      text("title", "{{event_name}}", 90, 130, 650, 92, "oswald-600", "#FFFFFF", { uppercase: true, lineHeight: 1.0 }),
      text("date", "{{weekday}}, {{day}} {{month}} · {{time}}", 90, 350, 650, 36, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 90, 400, 650, 30, "poppins-400", "#BBF7D0"),
      text("price", "{{ticket_type}} · {{price}}", 90, 500, 650, 44, "oswald-600", GOLD),
      qr("#052E16"),
      brand("dark"),
      ...stub({ bg: "#FFFFFF", ink: "#052E16", accent: "#15803D", title: "oswald-600", body: "poppins-600", rule: "#16A34A" }),
    ]),
  },
  {
    key: "conference-clean",
    name: "Conference Pass",
    category: "conference",
    design: design("#FFFFFF", [
      rect("band", 0, 0, 40, H, "#0F9D58", { name: "Band" }),
      path("dots", dotGrid(420, 650, 42, 5), [420, 650], 600, 0, 420, H, "#0B1F3A", { opacity: 0.08, name: "Dots" }),
      text("kicker", "{{society}}", 100, 70, 860, 28, "montserrat-800", "#0F9D58", { letterSpacing: 6, uppercase: true }),
      text("title", "{{event_name}}", 100, 112, 860, 86, "montserrat-800", "#0B1F3A", { lineHeight: 1.08 }),
      line("rule", 102, 330, 120, "#0F9D58", 8, { lineCap: "round" }),
      text("date-label", "DATE & TIME", 100, 370, 420, 20, "montserrat-800", "#64748B", { letterSpacing: 4 }),
      text("date", "{{date}} · {{time}}", 100, 398, 460, 32, "poppins-600", "#0B1F3A"),
      text("venue-label", "VENUE", 580, 370, 400, 20, "montserrat-800", "#64748B", { letterSpacing: 4 }),
      text("venue", "{{venue}}", 580, 398, 420, 32, "poppins-600", "#0B1F3A"),
      rect("type-chip", 100, 485, 420, 78, "#0B1F3A", { cornerRadius: 12 }),
      text("type", "{{ticket_type}} · {{price}}", 100, 505, 420, 34, "poppins-600", "#FFFFFF", { align: "center" }),
      qr("#0B1F3A"),
      brand("light"),
      ...stub({ bg: "#F1F5F9", ink: "#0B1F3A", accent: "#0F9D58", title: "montserrat-800", body: "poppins-600", rule: "#94A3B8" }),
    ]),
  },
  {
    key: "festival-mela",
    name: "Festival Mela",
    category: "festival",
    design: design(linear(0, [0, "#FFF1D6"], [1, "#FFE0E9"]), [
      path("bunting-1", bunting(1380, 70, 23, 0, 4), [1380, 70], 0, 0, STUB_X, 70, "#E11D48"),
      path("bunting-2", bunting(1380, 70, 23, 1, 4), [1380, 70], 0, 0, STUB_X, 70, "#F59E0B"),
      path("bunting-3", bunting(1380, 70, 23, 2, 4), [1380, 70], 0, 0, STUB_X, 70, "#0EA5A4"),
      path("bunting-4", bunting(1380, 70, 23, 3, 4), [1380, 70], 0, 0, STUB_X, 70, "#7C3AED"),
      path("flowers", starRow(1380, 60, 18, 6, 0.45), [1380, 60], 0, 575, STUB_X, 60, "#E11D48", { opacity: 0.45, name: "Flowers" }),
      text("kicker", "{{society}} PRESENTS", 80, 105, 900, 28, "poppins-800", "#7C3AED", { letterSpacing: 6, uppercase: true }),
      text("title", "{{event_name}}", 80, 145, 900, 110, "bebas-400", "#BE123C", { lineHeight: 0.95, uppercase: true }),
      text("date", "{{date}} · {{time}}", 80, 380, 900, 38, "poppins-600", "#1F2937"),
      text("venue", "{{venue}}", 80, 428, 900, 32, "poppins-400", "#374151"),
      rect("price-chip", 80, 488, 380, 76, "#0EA5A4", { cornerRadius: 38 }),
      text("price", "{{ticket_type}} · {{price}}", 80, 507, 380, 34, "poppins-800", "#FFFFFF", { align: "center" }),
      qr("#1F2937", 1050, 90),
      brand("light", 1050, 500),
      ...stub({ bg: "#FFFFFF", ink: "#1F2937", accent: "#BE123C", title: "bebas-400", body: "poppins-600", rule: "#F59E0B", notch: "#FFF1D6" }),
    ]),
  },
  {
    key: "minimal-green",
    name: "Classic Minimal",
    category: "general",
    design: design("#FFFFFF", [
      rect("frame", 30, 30, STUB_X - 60, H - 60, "rgba(0,0,0,0)", { stroke: "#0B1F3A", strokeWidth: 3, cornerRadius: 18, name: "Frame" }),
      rect("accent", 80, 80, 14, 200, "#0F9D58", { cornerRadius: 7 }),
      text("kicker", "ADMIT ONE", 120, 80, 800, 28, "grotesk-700", "#0F9D58", { letterSpacing: 10 }),
      text("title", "{{event_name}}", 120, 120, 860, 88, "grotesk-700", "#0B1F3A", { lineHeight: 1.05 }),
      text("society", "{{society}}", 120, 320, 860, 30, "poppins-400", "#475569"),
      text("date", "{{date}} · {{time}}", 120, 385, 860, 36, "poppins-600", "#0B1F3A"),
      text("venue", "{{venue}}", 120, 432, 860, 30, "poppins-400", "#334155"),
      text("price", "{{ticket_type}} · {{price}}", 120, 500, 860, 38, "grotesk-700", "#0F9D58"),
      qr("#0B1F3A"),
      brand("light"),
      ...stub({ bg: "#F8FAFC", ink: "#0B1F3A", accent: "#0F9D58", title: "grotesk-700", body: "poppins-600", rule: "#CBD5E1" }),
    ]),
  },
  {
    key: "poster-photo",
    name: "Poster Photo",
    category: "general",
    design: design("#0B1F3A", [
      image("poster", "{{poster}}", 0, 0, 520, H, { name: "Event poster" }),
      path("poster-edge", "M0 0H120L0 650Z", [120, 650], 460, 0, 120, H, "#0B1F3A", { name: "Edge" }),
      rect("orange-bar", 560, 0, 18, H, "#F97316", { name: "Accent" }),
      text("kicker", "EVENT TICKET", 620, 70, 400, 28, "poppins-800", "#F97316", { letterSpacing: 8 }),
      text("title", "{{event_name}}", 620, 112, 410, 74, "montserrat-800", "#FFFFFF", { lineHeight: 1.05 }),
      text("date", "{{date}}", 620, 360, 410, 32, "poppins-600", "#FFFFFF"),
      text("time", "{{time}}", 620, 400, 410, 30, "poppins-400", "#CBD5E1"),
      text("venue", "{{venue}}", 620, 440, 410, 28, "poppins-400", "#CBD5E1"),
      rect("price-chip", 620, 505, 380, 70, "#F97316", { cornerRadius: 10 }),
      text("price", "{{ticket_type}} · {{price}}", 620, 522, 380, 32, "poppins-800", "#FFFFFF", { align: "center" }),
      qr("#0B1F3A"),
      brand("dark"),
      ...stub({ bg: "#FFF7ED", ink: "#0B1F3A", accent: "#EA580C", title: "montserrat-800", body: "poppins-600", rule: "#FDBA74" }),
    ]),
  },
];

export function templateByKey(key: string | null | undefined): TicketTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** A deep copy so the editor never changes the built-in template. */
export function cloneDesign(d: TicketDesign): TicketDesign {
  return JSON.parse(JSON.stringify(d)) as TicketDesign;
}

/**
 * Built-in printed-ticket templates (PRT-01). All artwork is original and
 * made of vector shapes, so it prints sharp at any size. Every template is
 * 180 × 65 mm: the main part (with the QR, kept by the guest) and a 42 mm
 * tear-off stub (kept by the seller, with space for the buyer's name/phone).
 */
import type { Layer, TicketDesign } from "./design";
import {
  CAR, DOME, H, LANTERN, MOUNTAINS_BACK, MOUNTAINS_FRONT, NOTES, STUB_X, TROPHY,
  bars, brand, bunting, checker, design, dotGrid, ellipse, image, line, linear, path, qr, rect, star, starRow, stub, text,
} from "./template-kit";
import { modernTemplates } from "./templates-modern";

export const TEMPLATE_CATEGORIES = [
  { key: "qawwali", label: "Qawwali" },
  { key: "mushaira", label: "Mushaira / Poetry" },
  { key: "concert", label: "Concert" },
  { key: "dj-night", label: "DJ Night" },
  { key: "festival", label: "Festival / Mela" },
  { key: "gala", label: "Gala / Dinner" },
  { key: "graduation", label: "Convocation / Farewell" },
  { key: "conference", label: "Conference / Seminar" },
  { key: "workshop", label: "Workshop" },
  { key: "competition", label: "Competition" },
  { key: "sports", label: "Sports" },
  { key: "exhibition", label: "Exhibition / Expo" },
  { key: "theatre", label: "Theatre / Comedy" },
  { key: "trip", label: "Trip / Tour" },
  { key: "auto-show", label: "Auto Show" },
  { key: "general", label: "General" },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["key"];

export interface TicketTemplate {
  key: string;
  name: string;
  category: TemplateCategory;
  design: TicketDesign;
}


// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const GOLD = "#E9C46A";
const GOLD_SOFT = "#F6E3B4";

const HANDMADE: TicketTemplate[] = [
  {
    key: "qawwali-royal",
    name: "Royal Qawwali",
    category: "qawwali",
    design: design(linear(0, [0, "#2A0B3D"], [0.55, "#4A1240"], [1, "#6B1A2E"]), [
      path("dome", DOME, [500, 300], 40, 250, 700, 420, GOLD, { opacity: 0.12, name: "Mosque" }),
      path("stars-top", starRow(1380, 40, 26), [1380, 40], 0, 18, STUB_X, 40, GOLD, { opacity: 0.55, name: "Stars" }),
      path("stars-bottom", starRow(1380, 40, 26), [1380, 40], 0, 592, STUB_X, 40, GOLD, { opacity: 0.55, name: "Stars" }),
      text("urdu", "قوالی نائٹ", 70, 55, 900, 64, "nastaliq-700", GOLD_SOFT, { opacity: 0.9 }),
      text("kicker", "", 72, 170, 900, 21, "poppins-600", GOLD_SOFT, { letterSpacing: 6, name: "Festival line" }),
      text("title", "{{event_name}}", 70, 198, 940, 96, "cinzel-700", GOLD, { uppercase: true, lineHeight: 1.05, letterSpacing: 2, fitHeight: 125 }),
      line("rule", 72, 330, 420, GOLD, 3),
      text("date", "{{date}}  ·  {{time}}", 70, 360, 900, 40, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 70, 412, 900, 34, "poppins-400", GOLD_SOFT, { fitHeight: 42 }),
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
      text("kicker", "AN EVENING OF SUFI MUSIC", 80, 80, 800, 28, "poppins-600", GOLD, { letterSpacing: 8 }),
      text("title", "{{event_name}}", 80, 130, 900, 104, "playfair-700", "#FFFFFF", { lineHeight: 1.0, fitHeight: 205 }),
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
      text("title", "{{event_name}}", 80, 115, 920, 110, "orbitron-800", "#FFFFFF", { uppercase: true, lineHeight: 1.0, stroke: "#FF0099", strokeWidth: 3, fitHeight: 220 }),
      text("date", "{{weekday}} {{day}} {{month}} · {{time}}", 80, 345, 900, 44, "bebas-400", "#FF5BC0", { letterSpacing: 3 }),
      text("venue", "{{venue}}", 80, 398, 900, 32, "poppins-600", "#E0E7FF", { fitHeight: 40 }),
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
      rect("band-1", 700, -200, 120, 1100, linear(90, [0, "#F59E0B"], [1, "#FBBF24"]), { rotation: -25, opacity: 0.95, name: "Stripe" }),
      rect("band-2", 860, -200, 40, 1100, "#FBBF24", { rotation: -25, opacity: 0.6, name: "Stripe" }),
      path("notes", NOTES, [200, 300], 560, 420, 110, 165, "#FBBF24", { opacity: 0.3 }),
      text("kicker", "LIVE IN CONCERT", 80, 70, 700, 30, "poppins-600", "#FBBF24", { letterSpacing: 10 }),
      text("title", "{{event_name}}", 80, 115, 700, 120, "bebas-400", "#FFFFFF", { lineHeight: 0.95, uppercase: true, fitHeight: 245 }),
      rect("date-box", 80, 380, 230, 150, "#FFFFFF", { cornerRadius: 10 }),
      text("date-day", "{{day}}", 80, 388, 230, 84, "bebas-400", "#0B1F3A", { align: "center" }),
      text("date-month", "{{month}} {{year}}", 80, 470, 230, 32, "poppins-800", "#F59E0B", { align: "center" }),
      text("time", "{{weekday}} · {{time}}", 340, 395, 420, 38, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 340, 445, 420, 30, "poppins-400", "#CBD5E1", { fitHeight: 38 }),
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
      text("title", "{{event_name}}", 80, 95, 680, 84, "pacifico-400", "#0B1F3A", { lineHeight: 1.2, fitHeight: 195 }),
      text("date", "{{date}} · {{time}}", 80, 295, 760, 38, "poppins-600", "#0B1F3A"),
      text("venue", "Departure: {{venue}}", 80, 343, 760, 30, "poppins-600", "#0F766E", { fitHeight: 38 }),
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
      text("title", "{{event_name}}", 80, 100, 680, 92, "russo-400", "#FFFFFF", { uppercase: true, lineHeight: 1.05, fitHeight: 200 }),
      text("date", "{{date}} · {{time}}", 80, 310, 460, 34, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 80, 356, 460, 28, "poppins-400", "#D1D5DB", { fitHeight: 35 }),
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
      text("title", "{{event_name}}", 90, 130, 650, 92, "oswald-600", "#FFFFFF", { uppercase: true, lineHeight: 1.0, fitHeight: 205 }),
      text("date", "{{weekday}}, {{day}} {{month}} · {{time}}", 90, 350, 650, 36, "poppins-600", "#FFFFFF"),
      text("venue", "{{venue}}", 90, 400, 650, 30, "poppins-400", "#BBF7D0", { fitHeight: 38 }),
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
      text("title", "{{event_name}}", 100, 112, 860, 86, "montserrat-800", "#0B1F3A", { lineHeight: 1.08, fitHeight: 205 }),
      line("rule", 102, 330, 120, "#0F9D58", 8, { lineCap: "round" }),
      text("date-label", "DATE & TIME", 100, 370, 420, 20, "montserrat-800", "#64748B", { letterSpacing: 4 }),
      text("date", "{{date}} · {{time}}", 100, 398, 460, 32, "poppins-600", "#0B1F3A"),
      text("venue-label", "VENUE", 580, 370, 400, 20, "montserrat-800", "#64748B", { letterSpacing: 4 }),
      text("venue", "{{venue}}", 580, 398, 420, 32, "poppins-600", "#0B1F3A", { fitHeight: 77 }),
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
      text("title", "{{event_name}}", 80, 145, 900, 110, "bebas-400", "#BE123C", { lineHeight: 0.95, uppercase: true, fitHeight: 220 }),
      text("date", "{{date}} · {{time}}", 80, 380, 900, 38, "poppins-600", "#1F2937"),
      text("venue", "{{venue}}", 80, 428, 900, 32, "poppins-400", "#374151", { fitHeight: 40 }),
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
      text("title", "{{event_name}}", 120, 120, 860, 88, "grotesk-700", "#0B1F3A", { lineHeight: 1.05, fitHeight: 190 }),
      text("society", "{{society}}", 120, 320, 860, 30, "poppins-400", "#475569"),
      text("date", "{{date}} · {{time}}", 120, 385, 860, 36, "poppins-600", "#0B1F3A"),
      text("venue", "{{venue}}", 120, 432, 860, 30, "poppins-400", "#334155", { fitHeight: 38 }),
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
      text("title", "{{event_name}}", 620, 112, 410, 74, "montserrat-800", "#FFFFFF", { lineHeight: 1.05, fitHeight: 235 }),
      text("date", "{{date}}", 620, 360, 410, 32, "poppins-600", "#FFFFFF"),
      text("time", "{{time}}", 620, 400, 410, 30, "poppins-400", "#CBD5E1"),
      text("venue", "{{venue}}", 620, 440, 410, 28, "poppins-400", "#CBD5E1", { fitHeight: 35 }),
      rect("price-chip", 620, 505, 380, 70, "#F97316", { cornerRadius: 10 }),
      text("price", "{{ticket_type}} · {{price}}", 620, 522, 380, 32, "poppins-800", "#FFFFFF", { align: "center" }),
      qr("#0B1F3A"),
      brand("dark"),
      ...stub({ bg: "#FFF7ED", ink: "#0B1F3A", accent: "#EA580C", title: "montserrat-800", body: "poppins-600", rule: "#FDBA74" }),
    ]),
  },
];

/** Templates per category in the gallery: the hand-made ones first, then modern layouts up to this number. */
export const TEMPLATES_PER_CATEGORY = 6;

/**
 * D-079: the small line above the headline says "AUREX 2.0 PRESENTS" (or "FESTIVAL PASS") on
 * festival tickets and keeps the template's own words ("LIVE IN CONCERT") everywhere else.
 * It shrinks to one line so a long festival name never runs into the headline.
 */
function festivalReady(t: TicketTemplate): TicketTemplate {
  const layers = t.design.layers.map((l): Layer => {
    if (l.type !== "text" || l.id !== "kicker" || l.text.startsWith("{{presents")) return l;
    return { ...l, text: `{{presents|${l.text}}}`, fitHeight: l.fitHeight ?? Math.round(l.fontSize * 1.35) };
  });
  return { ...t, design: { ...t.design, layers } };
}

export const TEMPLATES: TicketTemplate[] = TEMPLATE_CATEGORIES.flatMap((c) => {
  const own = HANDMADE.filter((t) => t.category === c.key);
  return [...own, ...modernTemplates(c.key, Math.max(0, TEMPLATES_PER_CATEGORY - own.length))];
}).map(festivalReady);

export function templateByKey(key: string | null | undefined): TicketTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** A deep copy so the editor never changes the built-in template. */
export function cloneDesign(d: TicketDesign): TicketDesign {
  return JSON.parse(JSON.stringify(d)) as TicketDesign;
}

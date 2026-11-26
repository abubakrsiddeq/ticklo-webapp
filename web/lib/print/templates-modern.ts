/**
 * Modern printed-ticket templates (D-040). Six layouts (Split, Boarding pass,
 * Glass, Diagonal, Big type, Minimal) × a kit per category (colours, fonts,
 * icon, background pattern, wording). Every layout has a society-logo slot
 * ({{logo}}, printed only when the society has a logo), the QR and the
 * fixed-size "Ticket partner: TickLO" logo. All artwork is original vector art.
 */
import type { Fill, Layer, TicketDesign } from "./design";
import type { TemplateCategory, TicketTemplate } from "./templates";
import {
  CAR,
  DOME,
  LANTERN,
  NOTES,
  STUB_X,
  TROPHY,
  bars,
  brand,
  bunting,
  checker,
  circle,
  design,
  dotGrid,
  ellipse,
  f,
  image,
  line,
  linear,
  path,
  qr,
  rect,
  star,
  stub,
  text,
} from "./template-kit";

// ---------------------------------------------------------------------------
// Icons (one path each, drawn into a box) and background patterns
// ---------------------------------------------------------------------------

interface Icon {
  d: string;
  vb: [number, number];
}

/** Circle wound clockwise (same way as most shapes) – adds to a shape instead of cutting a hole. */
const solidCircle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 1 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-r * 2)} 0Z`;

function gear(cx: number, cy: number, teeth: number, ro: number, ri: number, hole: number): string {
  let d = "";
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    const r = i % 4 < 2 ? ro : ri;
    const a = (i / steps) * Math.PI * 2;
    d += `${i ? "L" : "M"}${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  }
  return `${d}Z${circle(cx, cy, hole)}`; // circle() winds the other way → a hole
}

const ICONS: Record<string, Icon> = {
  dome: { d: DOME, vb: [500, 300] },
  headphones: {
    d: "M30 120C30 50 60 15 100 15C140 15 170 50 170 120H155C155 60 132 32 100 32C68 32 45 60 45 120Z M18 108h42v84H18Z M140 108h42v84h-42Z",
    vb: [200, 200],
  },
  notes: { d: NOTES, vb: [200, 300] },
  mountain: { d: `M0 100L45 28L66 58L92 18L140 100Z${circle(118, 22, 12)}`, vb: [140, 100] },
  car: { d: `${CAR}${solidCircle(140, 164, 38)}${solidCircle(470, 164, 38)}`, vb: [600, 205] },
  trophy: { d: TROPHY, vb: [200, 240] },
  mic: {
    d: "M80 0h40a20 20 0 0 1 20 20v80a20 20 0 0 1-20 20H80a20 20 0 0 1-20-20V20A20 20 0 0 1 80 0Z M40 90h12c0 30 20 50 48 50s48-20 48-50h12c0 36-24 60-54 62v26h30v12H70v-12h30v-26c-30-2-54-26-54-62Z",
    vb: [200, 200],
  },
  lantern: { d: LANTERN, vb: [100, 200] },
  gear: { d: gear(100, 100, 10, 96, 76, 30), vb: [200, 200] },
  medal: { d: `M58 0H92L118 70H84Z M142 0H108L82 70H116Z${solidCircle(100, 125, 55)}`, vb: [200, 182] },
  sparkle: { d: "M50 0C55 35 65 45 100 50C65 55 55 65 50 100C45 65 35 55 0 50C35 45 45 35 50 0Z", vb: [100, 100] },
  frame: { d: `M0 0H200V160H0Z M20 20V140H180V20Z M35 125L80 70L108 104L128 84L165 125Z${circle(140, 52, 13)}`, vb: [200, 160] },
  mask: {
    d: `M20 20C70 42 130 42 180 20C180 140 140 192 100 192C60 192 20 140 20 20Z${circle(66, 82, 17)}${circle(134, 82, 17)}M70 140C85 128 115 128 130 140C120 160 80 160 70 140Z`,
    vb: [200, 195],
  },
  cap: { d: "M100 10L200 50L100 90L0 50Z M40 70V108C40 130 160 130 160 108V70L100 94Z M183 56V112h7V56Z", vb: [200, 130] },
  feather: { d: "M180 10C120 20 60 70 40 150L30 190L45 160C90 150 140 110 160 60C130 80 100 90 80 95C110 75 150 45 180 10Z", vb: [200, 200] },
  ticket: { d: "M0 0H200V32A28 28 0 0 0 200 88V120H0V88A28 28 0 0 0 0 32Z", vb: [200, 120] },
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Pattern = (w: number, h: number) => string;

const PATTERNS: Record<string, Pattern> = {
  stars: (w, h) => {
    let d = "";
    for (let y = 36, row = 0; y < h + 36; y += 78, row++) for (let x = row % 2 ? 39 : 0; x < w + 39; x += 78) d += star(Math.round(x), y, 8, 16, 9, -90 + 11.25);
    return d;
  },
  bars: (w, h) => bars(w, h, Math.round(w / 30), 5),
  checker: (w, h) => checker(w, h, 40),
  dots: (w, h) => dotGrid(w, h, 36, 4),
  peaks: (w, h) => {
    const r = rng(7);
    let d = `M0 ${h}`;
    for (let x = 0; x <= w; x += 60) d += `L${x} ${f(h * (0.35 + r() * 0.5))}`;
    return `${d}L${w} ${h}Z`;
  },
  grid: (w, h) => {
    let d = "";
    for (let x = 0; x < w; x += 40) d += `M${x} 0h2v${h}h-2Z`;
    for (let y = 0; y < h; y += 40) d += `M0 ${y}h${w}v2H0Z`;
    return d;
  },
  stripes: (w, h) => {
    let d = "";
    for (let x = -h; x < w; x += 56) d += `M${x} ${h}L${x + h} 0h18L${x + 18} ${h}Z`;
    return d;
  },
  sparkles: (w, h) => {
    const r = rng(11);
    let d = "";
    for (let i = 0; i < Math.round((w * h) / 9000); i++) d += star(r() * w, r() * h, 4, 6 + r() * 14, 2 + r() * 3, -90);
    return d;
  },
  confetti: (w, h) => {
    const r = rng(3);
    let d = "";
    for (let i = 0; i < Math.round((w * h) / 7000); i++) {
      const x = r() * w;
      const y = r() * h;
      d += r() > 0.5 ? circle(x, y, 3 + r() * 5) : star(x, y, 4, 6 + r() * 6, 5 + r() * 4, -45);
    }
    return d;
  },
  waves: (w, h) => {
    let d = "";
    for (let y = 30; y < h; y += 46) {
      const a = 14;
      const t = 5;
      d += `M0 ${y}Q${w / 8} ${y - a} ${w / 4} ${y}T${w / 2} ${y}T${(3 * w) / 4} ${y}T${w} ${y}V${y + t}Q${(7 * w) / 8} ${y + t + a} ${(3 * w) / 4} ${y + t}T${w / 2} ${y + t}T${w / 4} ${y + t}T0 ${y + t}Z`;
    }
    return d;
  },
  bunting: (w, h) => {
    let d = "";
    for (let y = 0; y < h; y += 110) d += bunting(w, 60, Math.round(w / 60), 0, 2).replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_m, x: string, yy: string) => `${x} ${f(Number(yy) + y)}`);
    return d;
  },
  diamonds: (w, h) => {
    let d = "";
    for (let y = 0, row = 0; y < h + 52; y += 52, row++) for (let x = row % 2 ? 26 : 0; x < w + 52; x += 52) d += `M${x} ${y - 12}l12 12-12 12-12-12Z`;
    return d;
  },
};

// ---------------------------------------------------------------------------
// Category kits
// ---------------------------------------------------------------------------

interface Palette {
  deep: Fill; // dark background
  light: Fill; // light background
  accent: string;
  accent2: string;
  onAccent: string; // text on the accent colour
  bright: string; // accent that reads on dark backgrounds
  inkDark: string; // text on light (also the QR colour – must be dark)
  mutedDark: string;
  accentInk: string; // accent that reads on light backgrounds
  inkLight: string;
  mutedLight: string;
  stub: string;
}

interface Kit {
  category: TemplateCategory;
  label: string;
  titleFont: string;
  upper?: boolean;
  icon: keyof typeof ICONS;
  pattern: keyof typeof PATTERNS;
  kickers: [string, string, string, string, string, string];
  palettes: [Palette, Palette];
}

const pal = (p: Palette) => p;

const KITS: Kit[] = [
  {
    category: "qawwali",
    label: "Qawwali",
    titleFont: "cinzel-700",
    upper: true,
    icon: "dome",
    pattern: "stars",
    kickers: ["AN EVENING OF QAWWALI", "SUFI NIGHT", "MEHFIL-E-SAMA", "LIVE QAWWALI", "SOUL OF SUFI MUSIC", "QAWWALI NIGHT"],
    palettes: [
      pal({ deep: linear(0, [0, "#2A0B3D"], [1, "#5A1640"]), light: "#FFF7E6", accent: "#4A1240", accent2: "#7A1F3D", onAccent: "#F6E3B4", bright: "#E9C46A", inkDark: "#2A0B3D", mutedDark: "#6B4E5E", accentInk: "#8A1C3A", inkLight: "#FFFFFF", mutedLight: "#F6E3B4", stub: "#FFF7E6" }),
      pal({ deep: linear(90, [0, "#0D4A37"], [1, "#062A1F"]), light: "#F4EBD0", accent: "#0D5C45", accent2: "#0A3D2E", onAccent: "#F6E3B4", bright: "#E9C46A", inkDark: "#0B2E24", mutedDark: "#4B6358", accentInk: "#0D6B4E", inkLight: "#FFFFFF", mutedLight: "#E8DDB5", stub: "#F4EBD0" }),
    ],
  },
  {
    category: "dj-night",
    label: "DJ Night",
    titleFont: "orbitron-800",
    upper: true,
    icon: "headphones",
    pattern: "bars",
    kickers: ["DJ NIGHT", "LIVE DJ SET", "ALL NIGHT LONG", "BASS & BEATS", "NEON PARTY", "CLUB NIGHT"],
    palettes: [
      pal({ deep: linear(0, [0, "#07070F"], [1, "#1A1038"]), light: "#F5F3FF", accent: "#FF0099", accent2: "#7C3AED", onAccent: "#FFFFFF", bright: "#00E5FF", inkDark: "#0F0A24", mutedDark: "#5B5677", accentInk: "#C2007A", inkLight: "#FFFFFF", mutedLight: "#C7C3E6", stub: "#F5F3FF" }),
      pal({ deep: linear(45, [0, "#0B0B0B"], [1, "#1A2E05"]), light: "#F7FEE7", accent: "#65A30D", accent2: "#14532D", onAccent: "#FFFFFF", bright: "#A3E635", inkDark: "#111827", mutedDark: "#4B5563", accentInk: "#3F6212", inkLight: "#FFFFFF", mutedLight: "#D9F99D", stub: "#F7FEE7" }),
    ],
  },
  {
    category: "concert",
    label: "Concert",
    titleFont: "bebas-400",
    upper: true,
    icon: "notes",
    pattern: "waves",
    kickers: ["LIVE IN CONCERT", "LIVE MUSIC", "UNPLUGGED", "THE TOUR", "ACOUSTIC NIGHT", "ONE NIGHT ONLY"],
    palettes: [
      pal({ deep: linear(0, [0, "#0B1F3A"], [1, "#16365F"]), light: "#FFF8E8", accent: "#F59E0B", accent2: "#D97706", onAccent: "#0B1F3A", bright: "#FBBF24", inkDark: "#0B1F3A", mutedDark: "#475569", accentInk: "#B45309", inkLight: "#FFFFFF", mutedLight: "#CBD5E1", stub: "#FFF8E8" }),
      pal({ deep: linear(0, [0, "#3B0A0A"], [1, "#7F1D1D"]), light: "#FDF2E9", accent: "#B91C1C", accent2: "#7F1D1D", onAccent: "#FFFFFF", bright: "#FDE68A", inkDark: "#2B0A0A", mutedDark: "#7C4A4A", accentInk: "#B91C1C", inkLight: "#FFFFFF", mutedLight: "#FECACA", stub: "#FDF2E9" }),
    ],
  },
  {
    category: "trip",
    label: "Trip",
    titleFont: "montserrat-800",
    icon: "mountain",
    pattern: "peaks",
    kickers: ["LET'S GO", "ADVENTURE AWAITS", "STUDY TRIP", "DAY TRIP", "TOUR", "EXPLORE"],
    palettes: [
      pal({ deep: linear(90, [0, "#0F766E"], [1, "#134E4A"]), light: "#ECFEFF", accent: "#0EA5A4", accent2: "#0F766E", onAccent: "#FFFFFF", bright: "#FDE047", inkDark: "#083344", mutedDark: "#3F6B73", accentInk: "#0F766E", inkLight: "#FFFFFF", mutedLight: "#CCFBF1", stub: "#ECFEFF" }),
      pal({ deep: linear(90, [0, "#14532D"], [1, "#052E16"]), light: "#FFF7ED", accent: "#EA580C", accent2: "#C2410C", onAccent: "#FFFFFF", bright: "#FDBA74", inkDark: "#1C1917", mutedDark: "#57534E", accentInk: "#C2410C", inkLight: "#FFFFFF", mutedLight: "#D6F5DD", stub: "#FFF7ED" }),
    ],
  },
  {
    category: "auto-show",
    label: "Auto Show",
    titleFont: "russo-400",
    upper: true,
    icon: "car",
    pattern: "checker",
    kickers: ["AUTO SHOW", "CAR SHOW", "MOTOR EXPO", "DRAG DAY", "SUPERCARS", "RALLY"],
    palettes: [
      pal({ deep: linear(0, [0, "#111111"], [1, "#2B2B2B"]), light: "#F3F4F6", accent: "#E11D48", accent2: "#9F1239", onAccent: "#FFFFFF", bright: "#F43F5E", inkDark: "#111111", mutedDark: "#4B5563", accentInk: "#BE123C", inkLight: "#FFFFFF", mutedLight: "#D1D5DB", stub: "#F3F4F6" }),
      pal({ deep: linear(0, [0, "#0F172A"], [1, "#1E3A5F"]), light: "#F8FAFC", accent: "#FACC15", accent2: "#EAB308", onAccent: "#0F172A", bright: "#FACC15", inkDark: "#0F172A", mutedDark: "#475569", accentInk: "#A16207", inkLight: "#FFFFFF", mutedLight: "#CBD5E1", stub: "#F8FAFC" }),
    ],
  },
  {
    category: "sports",
    label: "Sports",
    titleFont: "oswald-600",
    upper: true,
    icon: "trophy",
    pattern: "stripes",
    kickers: ["MATCH DAY", "THE FINAL", "TOURNAMENT", "GAME ON", "SPORTS GALA", "CHAMPIONSHIP"],
    palettes: [
      pal({ deep: linear(90, [0, "#15803D"], [1, "#052E16"]), light: "#F0FDF4", accent: "#16A34A", accent2: "#15803D", onAccent: "#FFFFFF", bright: "#E9C46A", inkDark: "#052E16", mutedDark: "#4B5563", accentInk: "#15803D", inkLight: "#FFFFFF", mutedLight: "#BBF7D0", stub: "#FFFFFF" }),
      pal({ deep: linear(0, [0, "#1E3A8A"], [1, "#172554"]), light: "#EFF6FF", accent: "#F97316", accent2: "#EA580C", onAccent: "#FFFFFF", bright: "#FB923C", inkDark: "#172554", mutedDark: "#475569", accentInk: "#C2410C", inkLight: "#FFFFFF", mutedLight: "#BFDBFE", stub: "#EFF6FF" }),
    ],
  },
  {
    category: "conference",
    label: "Conference",
    titleFont: "montserrat-800",
    icon: "mic",
    pattern: "dots",
    kickers: ["CONFERENCE", "SUMMIT", "SEMINAR", "KEYNOTE", "TALK SERIES", "SYMPOSIUM"],
    palettes: [
      pal({ deep: linear(0, [0, "#0B1F3A"], [1, "#0F3B2E"]), light: "#FFFFFF", accent: "#0F9D58", accent2: "#0B7D47", onAccent: "#FFFFFF", bright: "#3DDC97", inkDark: "#0B1F3A", mutedDark: "#64748B", accentInk: "#0B7D47", inkLight: "#FFFFFF", mutedLight: "#CBD5E1", stub: "#F1F5F9" }),
      pal({ deep: linear(0, [0, "#0C1A3B"], [1, "#1D4ED8"]), light: "#F8FAFC", accent: "#2563EB", accent2: "#1D4ED8", onAccent: "#FFFFFF", bright: "#7DD3FC", inkDark: "#0C1A3B", mutedDark: "#64748B", accentInk: "#1D4ED8", inkLight: "#FFFFFF", mutedLight: "#BFDBFE", stub: "#EFF6FF" }),
    ],
  },
  {
    category: "festival",
    label: "Festival",
    titleFont: "bebas-400",
    upper: true,
    icon: "lantern",
    pattern: "confetti",
    kickers: ["FESTIVAL", "MELA", "FUN FAIR", "CULTURE DAY", "FOOD FESTIVAL", "SPRING FEST"],
    palettes: [
      pal({ deep: linear(0, [0, "#831843"], [1, "#BE185D"]), light: "#FFF1F2", accent: "#DB2777", accent2: "#0EA5A4", onAccent: "#FFFFFF", bright: "#FDE047", inkDark: "#3B0A24", mutedDark: "#6B4A5A", accentInk: "#BE185D", inkLight: "#FFFFFF", mutedLight: "#FBCFE8", stub: "#FFFFFF" }),
      pal({ deep: linear(0, [0, "#4C1D95"], [1, "#7C3AED"]), light: "#FFFBEB", accent: "#F59E0B", accent2: "#DC2626", onAccent: "#FFFFFF", bright: "#FCD34D", inkDark: "#2E1065", mutedDark: "#6B5B8A", accentInk: "#B45309", inkLight: "#FFFFFF", mutedLight: "#DDD6FE", stub: "#FFFBEB" }),
    ],
  },
  {
    category: "workshop",
    label: "Workshop",
    titleFont: "grotesk-700",
    icon: "gear",
    pattern: "grid",
    kickers: ["HANDS-ON WORKSHOP", "MASTERCLASS", "BOOTCAMP", "TRAINING SESSION", "LEARN & BUILD", "SKILLS LAB"],
    palettes: [
      pal({ deep: linear(0, [0, "#1E1B4B"], [1, "#312E81"]), light: "#EEF2FF", accent: "#4F46E5", accent2: "#3730A3", onAccent: "#FFFFFF", bright: "#FACC15", inkDark: "#1E1B4B", mutedDark: "#4B5563", accentInk: "#4338CA", inkLight: "#FFFFFF", mutedLight: "#C7D2FE", stub: "#EEF2FF" }),
      pal({ deep: linear(0, [0, "#1C1917"], [1, "#292524"]), light: "#FFF7ED", accent: "#F97316", accent2: "#EA580C", onAccent: "#FFFFFF", bright: "#FB923C", inkDark: "#1C1917", mutedDark: "#57534E", accentInk: "#C2410C", inkLight: "#FFFFFF", mutedLight: "#D6D3D1", stub: "#FFF7ED" }),
    ],
  },
  {
    category: "competition",
    label: "Competition",
    titleFont: "oswald-600",
    upper: true,
    icon: "medal",
    pattern: "stripes",
    kickers: ["COMPETITION", "GRAND FINALE", "HACKATHON", "QUIZ CHAMPIONSHIP", "DEBATE", "THE CHALLENGE"],
    palettes: [
      pal({ deep: linear(0, [0, "#18181B"], [1, "#3F0D12"]), light: "#FEF2F2", accent: "#DC2626", accent2: "#991B1B", onAccent: "#FFFFFF", bright: "#FACC15", inkDark: "#18181B", mutedDark: "#52525B", accentInk: "#B91C1C", inkLight: "#FFFFFF", mutedLight: "#E4E4E7", stub: "#FEF2F2" }),
      pal({ deep: linear(45, [0, "#2E1065"], [1, "#0E7490"]), light: "#F5F3FF", accent: "#7C3AED", accent2: "#0891B2", onAccent: "#FFFFFF", bright: "#22D3EE", inkDark: "#2E1065", mutedDark: "#5B5677", accentInk: "#6D28D9", inkLight: "#FFFFFF", mutedLight: "#DDD6FE", stub: "#F5F3FF" }),
    ],
  },
  {
    category: "gala",
    label: "Gala Dinner",
    titleFont: "playfair-700",
    icon: "sparkle",
    pattern: "sparkles",
    kickers: ["GALA DINNER", "FORMAL DINNER", "ANNUAL DINNER", "BLACK TIE EVENING", "AWARDS NIGHT", "FAREWELL DINNER"],
    palettes: [
      pal({ deep: linear(0, [0, "#0A0A0A"], [1, "#1F1A10"]), light: "#FBF7EE", accent: "#B08D57", accent2: "#8C6D3F", onAccent: "#FFFFFF", bright: "#E5C98F", inkDark: "#141414", mutedDark: "#6B6355", accentInk: "#8C6D3F", inkLight: "#FFFFFF", mutedLight: "#E8DCC2", stub: "#FBF7EE" }),
      pal({ deep: linear(0, [0, "#3B0716"], [1, "#6D1530"]), light: "#FDF6F0", accent: "#9F1239", accent2: "#6D1530", onAccent: "#FCE7D6", bright: "#F3D2B3", inkDark: "#2A0510", mutedDark: "#7A5560", accentInk: "#9F1239", inkLight: "#FFFFFF", mutedLight: "#F3D2B3", stub: "#FDF6F0" }),
    ],
  },
  {
    category: "exhibition",
    label: "Exhibition",
    titleFont: "montserrat-800",
    icon: "frame",
    pattern: "diamonds",
    kickers: ["EXHIBITION", "ART SHOW", "EXPO", "SHOWCASE", "OPEN HOUSE", "GALLERY NIGHT"],
    palettes: [
      pal({ deep: linear(0, [0, "#111827"], [1, "#1F2937"]), light: "#FFFFFF", accent: "#F43F5E", accent2: "#E11D48", onAccent: "#FFFFFF", bright: "#FB7185", inkDark: "#111827", mutedDark: "#6B7280", accentInk: "#E11D48", inkLight: "#FFFFFF", mutedLight: "#D1D5DB", stub: "#FFF1F2" }),
      pal({ deep: linear(0, [0, "#042F2E"], [1, "#134E4A"]), light: "#F0FDFA", accent: "#14B8A6", accent2: "#0D9488", onAccent: "#FFFFFF", bright: "#5EEAD4", inkDark: "#042F2E", mutedDark: "#4B6B68", accentInk: "#0F766E", inkLight: "#FFFFFF", mutedLight: "#CCFBF1", stub: "#F0FDFA" }),
    ],
  },
  {
    category: "theatre",
    label: "Theatre",
    titleFont: "playfair-700",
    icon: "mask",
    pattern: "waves",
    kickers: ["LIVE ON STAGE", "STAND-UP COMEDY", "DRAMA", "THEATRE NIGHT", "COMEDY NIGHT", "THE PLAY"],
    palettes: [
      pal({ deep: linear(90, [0, "#7F1D1D"], [1, "#450A0A"]), light: "#FFF7ED", accent: "#B91C1C", accent2: "#7F1D1D", onAccent: "#FDE68A", bright: "#FBBF24", inkDark: "#2A0A0A", mutedDark: "#78463F", accentInk: "#B91C1C", inkLight: "#FFFFFF", mutedLight: "#FDE68A", stub: "#FFF7ED" }),
      pal({ deep: linear(0, [0, "#0F0C29"], [1, "#302B63"]), light: "#FDF4FF", accent: "#DB2777", accent2: "#9333EA", onAccent: "#FFFFFF", bright: "#F472B6", inkDark: "#1E1B3A", mutedDark: "#5F5A7A", accentInk: "#BE185D", inkLight: "#FFFFFF", mutedLight: "#E9D5FF", stub: "#FDF4FF" }),
    ],
  },
  {
    category: "graduation",
    label: "Convocation",
    titleFont: "cinzel-700",
    upper: true,
    icon: "cap",
    pattern: "diamonds",
    kickers: ["CONVOCATION", "GRADUATION", "CLASS OF {{year}}", "FAREWELL", "ALUMNI MEETUP", "GRAND CEREMONY"],
    palettes: [
      pal({ deep: linear(0, [0, "#0B1F3A"], [1, "#1E3A8A"]), light: "#FBF8F1", accent: "#1E3A8A", accent2: "#0B1F3A", onAccent: "#F6E3B4", bright: "#E9C46A", inkDark: "#0B1F3A", mutedDark: "#5B6478", accentInk: "#1E3A8A", inkLight: "#FFFFFF", mutedLight: "#E8DDB5", stub: "#FBF8F1" }),
      pal({ deep: linear(0, [0, "#4A0E1A"], [1, "#7A1B2E"]), light: "#FFF8F0", accent: "#7A1B2E", accent2: "#4A0E1A", onAccent: "#F6E3B4", bright: "#E9C46A", inkDark: "#3A0A14", mutedDark: "#7A5A60", accentInk: "#7A1B2E", inkLight: "#FFFFFF", mutedLight: "#F6E3B4", stub: "#FFF8F0" }),
    ],
  },
  {
    category: "mushaira",
    label: "Mushaira",
    titleFont: "playfair-700",
    icon: "feather",
    pattern: "stars",
    kickers: ["MUSHAIRA", "AN EVENING OF POETRY", "BAZM-E-SUKHAN", "URDU POETRY NIGHT", "SHAM-E-GHAZAL", "MEHFIL-E-MUSHAIRA"],
    palettes: [
      pal({ deep: linear(0, [0, "#042F2E"], [1, "#0F3D3E"]), light: "#FBF5E6", accent: "#0F4C4C", accent2: "#083535", onAccent: "#F6E3B4", bright: "#E9C46A", inkDark: "#06302F", mutedDark: "#4E6A68", accentInk: "#0F5C5C", inkLight: "#FFFFFF", mutedLight: "#E8DDB5", stub: "#FBF5E6" }),
      pal({ deep: linear(0, [0, "#1E1B4B"], [1, "#3B2A5E"]), light: "#FDF6F3", accent: "#B76E79", accent2: "#8E4A57", onAccent: "#FFFFFF", bright: "#F2C6B4", inkDark: "#1E1B4B", mutedDark: "#6B5F7A", accentInk: "#9C4F5E", inkLight: "#FFFFFF", mutedLight: "#F2D7CC", stub: "#FDF6F3" }),
    ],
  },
  {
    category: "general",
    label: "Event",
    titleFont: "grotesk-700",
    icon: "ticket",
    pattern: "dots",
    kickers: ["ADMIT ONE", "EVENT TICKET", "ENTRY PASS", "YOU'RE INVITED", "GENERAL ADMISSION", "SAVE THE DATE"],
    palettes: [
      pal({ deep: linear(0, [0, "#0B1F3A"], [1, "#12305A"]), light: "#FFFFFF", accent: "#0F9D58", accent2: "#0B7D47", onAccent: "#FFFFFF", bright: "#3DDC97", inkDark: "#0B1F3A", mutedDark: "#64748B", accentInk: "#0B7D47", inkLight: "#FFFFFF", mutedLight: "#CBD5E1", stub: "#F8FAFC" }),
      pal({ deep: linear(0, [0, "#1F2937"], [1, "#111827"]), light: "#FFFBF5", accent: "#F97316", accent2: "#EA580C", onAccent: "#FFFFFF", bright: "#FDBA74", inkDark: "#1F2937", mutedDark: "#6B7280", accentInk: "#C2410C", inkLight: "#FFFFFF", mutedLight: "#E5E7EB", stub: "#FFF7ED" }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function icon(id: string, name: keyof typeof ICONS, x: number, y: number, maxW: number, maxH: number, fill: Fill, opacity = 1): Layer {
  const i = ICONS[name];
  const s = Math.min(maxW / i.vb[0], maxH / i.vb[1]);
  const w = Math.round(i.vb[0] * s);
  const h = Math.round(i.vb[1] * s);
  return path(id, i.d, i.vb, Math.round(x + (maxW - w) / 2), Math.round(y + (maxH - h) / 2), w, h, fill, { opacity, name: "Icon" });
}

function pattern(id: string, name: keyof typeof PATTERNS, x: number, y: number, w: number, h: number, fill: string, opacity: number): Layer {
  return path(id, PATTERNS[name](w, h), [w, h], x, y, w, h, fill, { opacity, name: "Pattern" });
}

/** Society logo slot – prints only when the society has a logo. */
const logo = (x: number, y: number, size: number, plate?: string): Layer =>
  image("logo", "{{logo}}", x, y, size, size, { fit: "contain", cornerRadius: plate ? size / 2 : 0, plate, name: "Society logo" });

const label = (id: string, t: string, x: number, y: number, w: number, fill: string) => text(id, t, x, y, w, 19, "poppins-600", fill, { letterSpacing: 4 });

function tail(k: Kit, p: Palette, dark: boolean): Layer[] {
  return [
    qr(p.inkDark),
    brand(dark ? "dark" : "light"),
    ...stub({ bg: p.stub, ink: p.inkDark, accent: p.accentInk, title: k.titleFont, body: "poppins-600", rule: p.accent }),
  ];
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

type Layout = { key: string; name: string; build: (k: Kit, p: Palette, kicker: string) => TicketDesign };

const LAYOUTS: Layout[] = [
  {
    key: "split",
    name: "Split",
    build: (k, p, kicker) =>
      design(p.light, [
        rect("panel", 0, 0, 340, 650, linear(90, [0, p.accent], [1, p.accent2]), { name: "Date panel" }),
        pattern("pattern", k.pattern, 0, 0, 340, 650, p.onAccent, 0.1),
        logo(110, 50, 120, "#FFFFFF"),
        text("day", "{{day}}", 0, 212, 340, 150, k.titleFont, p.onAccent, { align: "center", lineHeight: 1, fitHeight: 165 }),
        text("month", "{{month}} {{year}}", 0, 380, 340, 38, "poppins-800", p.onAccent, { align: "center", letterSpacing: 4 }),
        text("weekday", "{{weekday}} · {{time}}", 0, 436, 340, 30, "poppins-600", p.onAccent, { align: "center", opacity: 0.9 }),
        icon("icon", k.icon, 120, 515, 100, 90, p.onAccent, 0.9),
        text("kicker", kicker, 390, 68, 610, 26, "poppins-800", p.accentInk, { letterSpacing: 6, uppercase: true }),
        text("title", "{{event_name}}", 390, 110, 610, 88, k.titleFont, p.inkDark, { uppercase: k.upper, lineHeight: 1.05, fitHeight: 235 }),
        text("society", "{{society}}", 390, 362, 610, 28, "poppins-600", p.mutedDark, { fitHeight: 36 }),
        text("venue", "{{venue}}", 390, 404, 610, 30, "poppins-400", p.mutedDark, { fitHeight: 38 }),
        rect("price-chip", 390, 480, 390, 76, linear(0, [0, p.accent], [1, p.accent2]), { cornerRadius: 38 }),
        text("price", "{{ticket_type}} · {{price}}", 390, 499, 390, 34, "poppins-800", p.onAccent, { align: "center", fitHeight: 40 }),
        ...tail(k, p, false),
      ]),
  },
  {
    key: "boarding",
    name: "Boarding Pass",
    build: (k, p, kicker) =>
      design(p.light, [
        rect("header", 0, 0, STUB_X, 120, linear(0, [0, p.accent], [1, p.accent2]), { name: "Header" }),
        pattern("pattern", k.pattern, 0, 0, 1000, 120, p.onAccent, 0.12),
        logo(40, 15, 90, "#FFFFFF"),
        text("society", "{{society}}", 150, 22, 700, 32, "poppins-800", p.onAccent, { fitHeight: 40 }),
        text("kicker", kicker, 150, 68, 700, 20, "poppins-600", p.onAccent, { letterSpacing: 5, uppercase: true, opacity: 0.85 }),
        icon("icon", k.icon, 880, 15, 110, 90, p.onAccent, 0.9),
        text("title", "{{event_name}}", 60, 152, 940, 80, k.titleFont, p.inkDark, { uppercase: k.upper, lineHeight: 1.05, fitHeight: 170 }),
        line("rule-1", 60, 345, 940, p.accent, 3, { dash: [12, 10] }),
        label("l-date", "DATE", 60, 368, 400, p.mutedDark),
        label("l-time", "TIME", 480, 368, 220, p.mutedDark),
        label("l-price", "PRICE", 720, 368, 280, p.mutedDark),
        text("date", "{{date}}", 60, 394, 400, 34, "poppins-600", p.inkDark, { fitHeight: 42 }),
        text("time", "{{time}}", 480, 394, 220, 34, "poppins-600", p.inkDark),
        text("price", "{{price}}", 720, 394, 280, 34, "poppins-800", p.accentInk, { fitHeight: 42 }),
        line("rule-2", 60, 462, 940, p.accent, 3, { dash: [12, 10] }),
        label("l-venue", "VENUE", 60, 486, 620, p.mutedDark),
        label("l-type", "TICKET", 720, 486, 280, p.mutedDark),
        text("venue", "{{venue}}", 60, 512, 620, 30, "poppins-600", p.inkDark, { fitHeight: 38 }),
        text("type", "{{ticket_type}}", 720, 512, 280, 30, "poppins-800", p.inkDark, { fitHeight: 38 }),
        ...tail(k, p, false),
      ]),
  },
  {
    key: "glass",
    name: "Glass",
    build: (k, p, kicker) =>
      design(p.deep, [
        ellipse("blob-1", -160, -220, 720, 620, linear(45, [0, alpha(p.accent, 0.85)], [1, alpha(p.accent, 0)]), { name: "Glow" }),
        ellipse("blob-2", 520, 240, 720, 620, linear(225, [0, alpha(p.accent2, 0.8)], [1, alpha(p.accent2, 0)]), { name: "Glow" }),
        pattern("pattern", k.pattern, 0, 0, 1040, 650, p.inkLight, 0.06),
        rect("card", 50, 50, 960, 550, "rgba(255,255,255,0.10)", { stroke: "rgba(255,255,255,0.35)", strokeWidth: 2, cornerRadius: 36, name: "Glass card" }),
        logo(880, 80, 100, "#FFFFFF"),
        text("kicker", kicker, 100, 95, 740, 24, "poppins-800", p.bright, { letterSpacing: 6, uppercase: true }),
        text("title", "{{event_name}}", 100, 135, 760, 92, k.titleFont, p.inkLight, { uppercase: k.upper, lineHeight: 1.02, fitHeight: 215 }),
        label("l-date", "DATE", 100, 385, 360, p.mutedLight),
        label("l-time", "TIME", 480, 385, 200, p.mutedLight),
        label("l-price", "PRICE", 700, 385, 280, p.mutedLight),
        text("date", "{{date}}", 100, 412, 360, 34, "poppins-600", p.inkLight, { fitHeight: 42 }),
        text("time", "{{time}}", 480, 412, 200, 34, "poppins-600", p.inkLight),
        text("price", "{{price}}", 700, 412, 280, 34, "poppins-800", p.bright, { fitHeight: 42 }),
        text("venue", "{{venue}} · {{ticket_type}}", 100, 495, 740, 30, "poppins-400", p.mutedLight, { fitHeight: 38 }),
        icon("icon", k.icon, 870, 470, 110, 100, p.bright, 0.9),
        ...tail(k, p, true),
      ]),
  },
  {
    key: "diagonal",
    name: "Diagonal",
    build: (k, p, kicker) =>
      design(p.deep, [
        path("slab", "M0 0H700L520 650H0Z", [1380, 650], 0, 0, STUB_X, 650, linear(90, [0, p.accent], [1, p.accent2]), { name: "Slab" }),
        path("stripe", "M730 0H770L590 650H550Z", [1380, 650], 0, 0, STUB_X, 650, p.bright, { opacity: 0.9, name: "Stripe" }),
        pattern("pattern", k.pattern, 0, 0, 520, 650, p.onAccent, 0.1),
        logo(60, 55, 110, "#FFFFFF"),
        text("kicker", kicker, 60, 195, 520, 24, "poppins-800", p.onAccent, { letterSpacing: 5, uppercase: true, opacity: 0.9 }),
        text("title", "{{event_name}}", 60, 232, 500, 82, k.titleFont, p.onAccent, { uppercase: k.upper, lineHeight: 1.04, fitHeight: 190 }),
        text("date", "{{date}}", 60, 448, 460, 30, "poppins-600", p.onAccent),
        text("venue", "{{venue}}", 60, 492, 440, 26, "poppins-400", p.onAccent, { opacity: 0.85, fitHeight: 33 }),
        icon("icon", k.icon, 400, 545, 100, 80, p.onAccent, 0.85),
        text("day", "{{day}}", 760, 112, 260, 170, k.titleFont, p.inkLight, { align: "center", lineHeight: 1, fitHeight: 185 }),
        text("month", "{{month}} {{year}}", 760, 300, 260, 36, "poppins-800", p.bright, { align: "center", letterSpacing: 4 }),
        text("time", "{{weekday}} · {{time}}", 760, 350, 260, 30, "poppins-600", p.mutedLight, { align: "center" }),
        text("type", "{{ticket_type}}", 740, 428, 290, 26, "poppins-600", p.inkLight, { align: "center", fitHeight: 32 }),
        rect("price-chip", 740, 470, 290, 72, p.bright, { cornerRadius: 36 }),
        text("price", "{{price}}", 740, 488, 290, 32, "poppins-800", p.inkDark, { align: "center", fitHeight: 38 }),
        ...tail(k, p, true),
      ]),
  },
  {
    key: "bigtype",
    name: "Big Type",
    build: (k, p, kicker) =>
      design(p.deep, [
        pattern("pattern", k.pattern, 420, 0, 600, 650, p.inkLight, 0.06),
        icon("icon-big", k.icon, 640, 300, 360, 320, p.bright, 0.14),
        text("kicker", kicker, 60, 58, 900, 26, "poppins-800", p.bright, { letterSpacing: 8, uppercase: true }),
        text("title", "{{event_name}}", 60, 98, 950, 130, k.titleFont, p.inkLight, { uppercase: true, lineHeight: 0.95, fitHeight: 272 }),
        rect("bar", 62, 392, 140, 12, p.bright, { cornerRadius: 6 }),
        text("date", "{{date}} · {{time}}", 60, 422, 900, 36, "poppins-600", p.inkLight, { fitHeight: 44 }),
        text("venue", "{{venue}}", 60, 470, 900, 30, "poppins-400", p.mutedLight, { fitHeight: 38 }),
        rect("price-chip", 60, 530, 340, 70, p.bright, { cornerRadius: 35 }),
        text("price", "{{ticket_type}} · {{price}}", 60, 548, 340, 32, "poppins-800", p.inkDark, { align: "center", fitHeight: 38 }),
        logo(430, 525, 80, "#FFFFFF"),
        text("society", "{{society}}", 530, 548, 460, 28, "poppins-600", p.mutedLight, { fitHeight: 36 }),
        ...tail(k, p, true),
      ]),
  },
  {
    key: "minimal",
    name: "Minimal",
    build: (k, p, kicker) =>
      design(p.light, [
        rect("frame", 28, 28, STUB_X - 56, 594, "rgba(0,0,0,0)", { stroke: p.inkDark, strokeWidth: 2, cornerRadius: 16, name: "Frame" }),
        rect("accent", 60, 62, 70, 8, p.accent, { cornerRadius: 4 }),
        logo(60, 92, 100),
        text("society", "{{society}}", 180, 100, 800, 26, "poppins-600", p.mutedDark, { fitHeight: 34 }),
        text("kicker", kicker, 180, 140, 800, 22, "poppins-800", p.accentInk, { letterSpacing: 6, uppercase: true }),
        text("title", "{{event_name}}", 60, 212, 940, 78, k.titleFont, p.inkDark, { uppercase: k.upper, lineHeight: 1.05, fitHeight: 165 }),
        line("rule", 60, 396, 940, p.inkDark, 1.5, { opacity: 0.25 }),
        text("l-date", "DATE", 60, 418, 320, 18, "poppins-600", p.mutedDark, { letterSpacing: 4 }),
        text("l-time", "TIME", 400, 418, 200, 18, "poppins-600", p.mutedDark, { letterSpacing: 4 }),
        text("l-venue", "VENUE", 620, 418, 380, 18, "poppins-600", p.mutedDark, { letterSpacing: 4 }),
        text("date", "{{date}}", 60, 444, 320, 30, "poppins-600", p.inkDark, { fitHeight: 38 }),
        text("time", "{{time}}", 400, 444, 200, 30, "poppins-600", p.inkDark),
        text("venue", "{{venue}}", 620, 444, 380, 28, "poppins-600", p.inkDark, { fitHeight: 70 }),
        text("price", "{{ticket_type}} · {{price}}", 60, 538, 760, 38, k.titleFont, p.accentInk, { fitHeight: 46 }),
        icon("icon", k.icon, 880, 520, 110, 80, p.accent),
        ...tail(k, p, false),
      ]),
  },
];

/**
 * `count` modern templates for a category (one per layout, in layout order),
 * alternating the category's two colour palettes.
 */
export function modernTemplates(category: TemplateCategory, count: number): TicketTemplate[] {
  const kit = KITS.find((k) => k.category === category);
  if (!kit) return [];
  const offset = KITS.indexOf(kit) % 2;
  return LAYOUTS.slice(0, count).map((layout, i) => ({
    key: `${category}-${layout.key}`,
    name: `${kit.label} ${layout.name}`,
    category,
    design: layout.build(kit, kit.palettes[(i + offset) % 2], kit.kickers[i]),
  }));
}

export const MODERN_LAYOUT_COUNT = LAYOUTS.length;

import { z } from "zod";

/**
 * Printed ticket design (D-039). A design is plain JSON so it can be stored
 * on the batch, saved as a template and rendered the same way in the editor,
 * the thumbnails and the PDF.
 *
 * Units: 1 design unit = 0.1 mm (a 180 × 65 mm ticket is 1800 × 650).
 * Text can contain placeholders like {{event_name}}; {{serial}} and {{code}}
 * change on every ticket, the rest are the same for the whole batch.
 * A placeholder can carry a fallback: {{presents|LIVE IN CONCERT}} prints the
 * fallback when the value is empty (D-079: festival tickets fill it).
 *
 * Rules (also checked in Postgres → print_design_problem):
 *  - exactly one QR layer, at least 20 mm, not rotated, fully on the ticket
 *  - at least one "Ticket partner: TickLO" (brand) layer at its fixed size (29 mm wide, full
 *    opacity) – it can be moved, never made smaller (owner rule, D-040)
 *  - QR and brand layers are always drawn on top of everything else
 */

export const UNITS_PER_MM = 10;
export const MIN_QR_SIZE = 200; // 20 mm
export const BRAND_HEIGHT_RATIO = 0.35; // brand layer height = width × ratio
/** "Ticket partner: TickLO" has one fixed size on every ticket: 29 × 10.2 mm. */
export const BRAND_WIDTH = 290;
export const BRAND_HEIGHT = Math.round(BRAND_WIDTH * BRAND_HEIGHT_RATIO);
export const QR_CAPTION_RATIO = 0.17; // serial caption under the QR (height = size × ratio)
export const MAX_LAYERS = 300;

export const mm = (units: number) => units / UNITS_PER_MM;
export const units = (millimetres: number) => Math.round(millimetres * UNITS_PER_MM);

export interface GradientFill {
  type: "linear";
  angle: number; // degrees, 0 = left → right, 90 = top → bottom
  stops: [number, string][]; // [offset 0..1, colour]
}
export type Fill = string | GradientFill;

interface Base {
  id: string;
  name?: string;
  x: number;
  y: number;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  locked?: boolean; // locked by the user in the editor (cannot be dragged)
}

export interface TextLayer extends Base {
  type: "text";
  text: string;
  width: number;
  fontFamily: string; // font id from lib/print/fonts
  fontSize: number;
  fill: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
  italic?: boolean;
  uppercase?: boolean;
  stroke?: string;
  strokeWidth?: number;
  /** Shrink the font (down to 40 %) until the text is no taller than this. */
  fitHeight?: number;
}

export interface ImageLayer extends Base {
  type: "image";
  src: string; // https URL, "/…" path, "{{poster}}" (event poster) or "{{logo}}" (society logo)
  width: number;
  height: number;
  fit?: "cover" | "contain" | "stretch";
  cornerRadius?: number;
  /** Coloured plate behind the image (e.g. white circle behind a logo); drawn only when the image exists. */
  plate?: string;
}

export interface RectLayer extends Base {
  type: "rect";
  width: number;
  height: number;
  fill: Fill;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  dash?: number[];
}

export interface EllipseLayer extends Base {
  type: "ellipse";
  width: number;
  height: number;
  fill: Fill;
  stroke?: string;
  strokeWidth?: number;
}

/** A straight line from (x, y) to (x + width, y), rotated by `rotation`. */
export interface LineLayer extends Base {
  type: "line";
  width: number;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  lineCap?: "butt" | "round";
}

/** SVG path data drawn into a box. `viewBox` = [width, height] of the path's own coordinates. */
export interface PathLayer extends Base {
  type: "path";
  data: string;
  viewBox: [number, number];
  width: number;
  height: number;
  fill: Fill;
  stroke?: string;
  strokeWidth?: number;
}

export interface QrLayer extends Base {
  type: "qr";
  size: number;
  dark?: string; // module colour; the background is always white
  caption?: boolean; // serial number printed under the QR (default true)
}

export interface BrandLayer extends Base {
  type: "brand";
  width: number;
  height: number; // always BRAND_HEIGHT
  variant?: "light" | "dark"; // light = for light backgrounds (navy logo); dark = white logo
}

export type Layer = TextLayer | ImageLayer | RectLayer | EllipseLayer | LineLayer | PathLayer | QrLayer | BrandLayer;
export type LayerType = Layer["type"];

export interface TicketDesign {
  version: 1;
  width: number;
  height: number;
  background: Fill;
  layers: Layer[];
  /** D-082: what the organizer typed in "What the ticket says" – wins over the event's values. */
  texts?: Partial<Record<EditableTextKey, string>>;
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

export const PLACEHOLDERS = [
  { key: "event_name", label: "Headline (event or session name)", sample: "Qawwali Night 2026" },
  { key: "presents", label: "Festival line (e.g. AUREX PRESENTS)", sample: "AUREX 2.0 PRESENTS" },
  { key: "festival", label: "Festival name", sample: "Aurex 2.0" },
  { key: "includes", label: "Sessions included", sample: "Qawwali Night, Mushaira" },
  { key: "society", label: "Society", sample: "LUMS Music Society" },
  { key: "date", label: "Date", sample: "Sat, 12 Dec 2026" },
  { key: "day", label: "Day (12)", sample: "12" },
  { key: "month", label: "Month (DEC)", sample: "DEC" },
  { key: "weekday", label: "Weekday (SAT)", sample: "SAT" },
  { key: "year", label: "Year", sample: "2026" },
  { key: "time", label: "Time", sample: "8:00 PM" },
  { key: "venue", label: "Venue", sample: "Alhamra Hall, Lahore" },
  { key: "ticket_type", label: "Ticket type", sample: "General" },
  { key: "price", label: "Price", sample: "Rs 2,000" },
  { key: "serial", label: "Serial no. (changes per ticket)", sample: "QWL-0001" },
  { key: "code", label: "Ticket code (changes per ticket)", sample: "K7Q2-M9XD" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];
export type PlaceholderValues = Partial<Record<PlaceholderKey | "poster" | "logo", string>>;

/** Placeholders that are different on every ticket. */
export const PER_TICKET_KEYS: ReadonlySet<string> = new Set(["serial", "code"]);

/** {{key}} or {{key|fallback}}; the fallback may contain plain {{other}} placeholders. */
export const TOKEN = /\{\{\s*([a-z_]+)\s*(?:\|((?:[^{}]|\{\{\s*[a-z_]+\s*\}\})*))?\}\}/g;

export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(TOKEN, (whole, key: string, fallback: string | undefined) => {
    const v = (values as Record<string, string | undefined>)[key];
    if (fallback !== undefined) return v ? v : fillPlaceholders(fallback, values);
    return v ?? whole;
  });
}

/** Placeholder keys used by the visible text layers of a design (fallbacks included). */
export function usedPlaceholders(design: Pick<TicketDesign, "layers">): Set<string> {
  const keys = new Set<string>();
  for (const l of design.layers) {
    if (l.type !== "text" || l.hidden) continue;
    for (const m of l.text.matchAll(TOKEN)) {
      keys.add(m[1]);
      if (m[2]) for (const inner of m[2].matchAll(TOKEN)) keys.add(inner[1]);
    }
  }
  return keys;
}

/** D-082: details the organizer may retype in "What the ticket says" (stored on the design). */
export const EDITABLE_TEXT_KEYS = ["event_name", "presents", "festival", "includes", "date", "time", "venue", "society"] as const;
export type EditableTextKey = (typeof EDITABLE_TEXT_KEYS)[number];

/** The event's values with the organizer's own texts on top (empty texts are ignored). */
export function withTexts(values: PlaceholderValues, texts: TicketDesign["texts"] | null | undefined): PlaceholderValues {
  if (!texts) return values;
  const out: PlaceholderValues = { ...values };
  for (const k of EDITABLE_TEXT_KEYS) {
    const t = texts[k]?.trim();
    if (t) out[k] = t;
  }
  return out;
}

/** The design without the organizer's texts (editor, saved templates). */
export function withoutTexts(d: TicketDesign): TicketDesign {
  const { texts: _texts, ...rest } = d;
  void _texts;
  return rest;
}

export function hasPerTicketPlaceholder(text: string): boolean {
  for (const m of text.matchAll(TOKEN)) if (PER_TICKET_KEYS.has(m[1])) return true;
  return false;
}

export const sampleValues = (): PlaceholderValues =>
  Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.sample])) as PlaceholderValues;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const num = z.number().finite();
const colour = z.string().max(40);
const fill = z.union([
  colour,
  z.object({
    type: z.literal("linear"),
    angle: num,
    stops: z.array(z.tuple([z.number().min(0).max(1), colour])).min(2).max(8),
  }),
]);
const base = {
  id: z.string().min(1).max(40),
  name: z.string().max(60).optional(),
  x: num,
  y: num,
  rotation: num.optional(),
  opacity: z.number().min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
};
const size = z.number().finite().min(1).max(6000);

const layerSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("text"),
    text: z.string().max(1000),
    width: size,
    fontFamily: z.string().max(40),
    fontSize: z.number().min(10).max(1500),
    fill: colour,
    align: z.enum(["left", "center", "right"]).optional(),
    letterSpacing: z.number().min(-50).max(200).optional(),
    lineHeight: z.number().min(0.5).max(3).optional(),
    italic: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    stroke: colour.optional(),
    strokeWidth: z.number().min(0).max(50).optional(),
    fitHeight: z.number().min(10).max(6000).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("image"),
    src: z.string().max(1000),
    width: size,
    height: size,
    fit: z.enum(["cover", "contain", "stretch"]).optional(),
    cornerRadius: z.number().min(0).max(3000).optional(),
    plate: colour.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("rect"),
    width: size,
    height: size,
    fill,
    stroke: colour.optional(),
    strokeWidth: z.number().min(0).max(200).optional(),
    cornerRadius: z.number().min(0).max(3000).optional(),
    dash: z.array(z.number().min(0).max(500)).max(8).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("ellipse"),
    width: size,
    height: size,
    fill,
    stroke: colour.optional(),
    strokeWidth: z.number().min(0).max(200).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("line"),
    width: size,
    stroke: colour,
    strokeWidth: z.number().min(0.5).max(200),
    dash: z.array(z.number().min(0).max(500)).max(8).optional(),
    lineCap: z.enum(["butt", "round"]).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("path"),
    data: z.string().max(40000),
    viewBox: z.tuple([z.number().positive(), z.number().positive()]),
    width: size,
    height: size,
    fill,
    stroke: colour.optional(),
    strokeWidth: z.number().min(0).max(200).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("qr"),
    size: z.number().min(1).max(3000),
    dark: colour.optional(),
    caption: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("brand"),
    width: size,
    height: size,
    variant: z.enum(["light", "dark"]).optional(),
  }),
]);

export const designSchema = z.object({
  version: z.literal(1),
  width: z.number().min(400).max(3000),
  height: z.number().min(300).max(3000),
  background: fill,
  layers: z.array(layerSchema).max(MAX_LAYERS),
  texts: z.partialRecord(z.enum(EDITABLE_TEXT_KEYS), z.string().max(200)).optional(),
});

export interface DesignProblem {
  layerId?: string;
  message: string;
}

/**
 * Same rules as Postgres `print_design_problem` (plus the shape check).
 * Returns an empty list when the design can be printed.
 */
export function designProblems(design: unknown): DesignProblem[] {
  const parsed = designSchema.safeParse(design);
  if (!parsed.success) return [{ message: "The ticket design is damaged. Reload the editor and try again." }];
  const d = parsed.data;
  const problems: DesignProblem[] = [];
  if (JSON.stringify(d).length > 400000) problems.push({ message: "The design is too large. Remove some images or shapes." });

  const qrs = d.layers.filter((l) => l.type === "qr");
  if (qrs.length !== 1) problems.push({ message: "The ticket must have exactly one QR code." });
  const qr = qrs[0];
  if (qr) {
    if (qr.hidden) problems.push({ layerId: qr.id, message: "The QR code cannot be hidden." });
    if (qr.size < MIN_QR_SIZE) problems.push({ layerId: qr.id, message: "The QR code must be at least 20 mm wide so phones can scan it." });
    if ((qr.rotation ?? 0) !== 0) problems.push({ layerId: qr.id, message: "The QR code cannot be rotated." });
    if (qr.x < 0 || qr.y < 0 || qr.x + qr.size > d.width || qr.y + qr.size > d.height) {
      problems.push({ layerId: qr.id, message: "The QR code must be fully on the ticket." });
    }
  }

  const brands = d.layers.filter((l) => l.type === "brand");
  const brandOk = brands.some(
    (b) =>
      !b.hidden &&
      Math.abs(b.width - BRAND_WIDTH) <= 1 &&
      Math.abs(b.height - BRAND_HEIGHT) <= 2 &&
      (b.opacity ?? 1) >= 0.99 &&
      (b.rotation ?? 0) === 0 &&
      b.x >= 0 &&
      b.y >= 0 &&
      b.x + b.width <= d.width &&
      b.y + b.height <= d.height,
  );
  if (!brandOk) {
    problems.push({
      layerId: brands[0]?.id,
      message: 'The "Ticket partner: TickLO" logo must be on the ticket at its normal size (29 mm wide) and fully visible. You can move it, not shrink it.',
    });
  }
  return problems;
}

export function parseDesign(input: unknown): TicketDesign | null {
  const parsed = designSchema.safeParse(input);
  return parsed.success ? (parsed.data as TicketDesign) : null;
}

/**
 * Put every "Ticket partner: TickLO" layer back to its fixed size (keeps its position, kept on
 * the ticket). Used when a design is loaded into the editor (old saved designs, templates).
 */
export function normalizeDesign(d: TicketDesign): TicketDesign {
  return {
    ...d,
    layers: d.layers.map((l) => {
      if (l.type !== "brand") return l;
      return {
        ...l,
        width: BRAND_WIDTH,
        height: BRAND_HEIGHT,
        opacity: undefined,
        rotation: undefined,
        hidden: undefined,
        x: Math.round(Math.min(Math.max(0, l.x), d.width - BRAND_WIDTH)),
        y: Math.round(Math.min(Math.max(0, l.y), d.height - BRAND_HEIGHT)),
      };
    }),
  };
}

/** QR and brand layers can't be deleted (the editor hides the delete button). */
export const isProtected = (l: Layer) => l.type === "qr" || l.type === "brand";

/** Draw order: everything in array order, then QR and brand on top. */
export function drawOrder(layers: Layer[]): Layer[] {
  return [...layers.filter((l) => !isProtected(l)), ...layers.filter(isProtected)];
}

/** Axis-aligned box of a layer before rotation. */
export function layerBox(l: Layer): { x: number; y: number; width: number; height: number } {
  switch (l.type) {
    case "qr":
      return { x: l.x, y: l.y, width: l.size, height: l.size * (l.caption === false ? 1 : 1 + QR_CAPTION_RATIO) };
    case "line":
      return { x: l.x, y: l.y - l.strokeWidth / 2, width: l.width, height: l.strokeWidth };
    case "text":
      return {
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.fitHeight ?? l.fontSize * (l.lineHeight ?? 1.15) * Math.max(1, l.text.split("\n").length),
      };
    default:
      return { x: l.x, y: l.y, width: l.width, height: l.height };
  }
}

let idCounter = 0;
export function newLayerId(prefix = "l"): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A suggested serial prefix from the event name: "Qawwali Night" → "QN". */
export function suggestPrefix(eventName: string): string {
  const words = eventName.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "TKT";
  const initials = words.map((w) => w[0]).join("").slice(0, 4);
  return initials.length >= 2 ? initials : words[0].slice(0, 3);
}

export function serialLabel(prefix: string, n: number): string {
  const s = String(n);
  return `${prefix}-${s.padStart(Math.max(4, s.length), "0")}`;
}

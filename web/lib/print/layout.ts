/**
 * Page layout ("imposition") for printed tickets – pure math, unit-tested.
 * All lengths in millimetres; the PDF code converts to points.
 */

export type PrintLayout = "a4" | "a3" | "single";

export const PAPER: Record<"a4" | "a3", { width: number; height: number; label: string }> = {
  a4: { width: 210, height: 297, label: "A4" },
  a3: { width: 297, height: 420, label: "A3" },
};

export const SHEET_MARGIN = 9; // room for crop marks + footer
export const SHEET_GAP = 5; // space between tickets (2 mm bleed each side + 1 mm white)
export const SHEET_BLEED = 2;
export const PRESS_BLEED = 3; // standard bleed for printing presses
export const PRESS_SLUG = 8; // extra room for crop marks on single-ticket pages

export interface Slot {
  /** Trim box of the ticket (where it is cut), from the top-left of the page. */
  x: number;
  y: number;
}

export interface SheetPlan {
  pageWidth: number;
  pageHeight: number;
  cols: number;
  rows: number;
  perPage: number;
  bleed: number;
  slots: Slot[];
  /** Cut lines for crop marks */
  cutX: number[];
  cutY: number[];
  grid: { left: number; top: number; right: number; bottom: number };
}

function plan(pageW: number, pageH: number, tw: number, th: number): SheetPlan | null {
  const availW = pageW - SHEET_MARGIN * 2;
  const availH = pageH - SHEET_MARGIN * 2;
  const cols = Math.floor((availW + SHEET_GAP) / (tw + SHEET_GAP));
  const rows = Math.floor((availH + SHEET_GAP) / (th + SHEET_GAP));
  if (cols < 1 || rows < 1) return null;
  const gridW = cols * tw + (cols - 1) * SHEET_GAP;
  const gridH = rows * th + (rows - 1) * SHEET_GAP;
  const left = (pageW - gridW) / 2;
  const top = (pageH - gridH) / 2;
  const slots: Slot[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: left + c * (tw + SHEET_GAP), y: top + r * (th + SHEET_GAP) });
  const cutX = [...new Set(Array.from({ length: cols }, (_, c) => [left + c * (tw + SHEET_GAP), left + c * (tw + SHEET_GAP) + tw]).flat())];
  const cutY = [...new Set(Array.from({ length: rows }, (_, r) => [top + r * (th + SHEET_GAP), top + r * (th + SHEET_GAP) + th]).flat())];
  return {
    pageWidth: pageW,
    pageHeight: pageH,
    cols,
    rows,
    perPage: cols * rows,
    bleed: SHEET_BLEED,
    slots,
    cutX,
    cutY,
    grid: { left, top, right: left + gridW, bottom: top + gridH },
  };
}

/** Best of portrait and landscape (most tickets per sheet; portrait wins a tie). */
export function sheetPlan(paper: "a4" | "a3", ticketW: number, ticketH: number): SheetPlan | null {
  const p = PAPER[paper];
  const portrait = plan(p.width, p.height, ticketW, ticketH);
  const landscape = plan(p.height, p.width, ticketW, ticketH);
  if (!portrait) return landscape;
  if (!landscape) return portrait;
  return landscape.perPage > portrait.perPage ? landscape : portrait;
}

export function singlePlan(ticketW: number, ticketH: number, cropMarks: boolean): SheetPlan {
  const pad = PRESS_BLEED + (cropMarks ? PRESS_SLUG : 0);
  return {
    pageWidth: ticketW + pad * 2,
    pageHeight: ticketH + pad * 2,
    cols: 1,
    rows: 1,
    perPage: 1,
    bleed: PRESS_BLEED,
    slots: [{ x: pad, y: pad }],
    cutX: [pad, pad + ticketW],
    cutY: [pad, pad + ticketH],
    grid: { left: pad, top: pad, right: pad + ticketW, bottom: pad + ticketH },
  };
}

export function layoutPlan(layout: PrintLayout, ticketW: number, ticketH: number, cropMarks: boolean): SheetPlan {
  if (layout === "single") return singlePlan(ticketW, ticketH, cropMarks);
  return sheetPlan(layout, ticketW, ticketH) ?? singlePlan(ticketW, ticketH, cropMarks);
}

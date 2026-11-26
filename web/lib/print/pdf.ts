/**
 * Builds the print-ready PDF in the browser (PRT-06): no server load, works
 * for 2000 tickets. Per page:
 *   - the artwork (everything that is the same on every ticket) rendered once
 *     at 400 DPI and reused for every ticket (one image in the file)
 *   - the QR code as vector rectangles (razor sharp at any size)
 *   - the serial number under the QR as real text
 *   - texts with {{serial}} / {{code}} rendered at 600 DPI per ticket
 *   - bleed, crop marks and a small footer for the printer
 */
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import {
  hasPerTicketPlaceholder,
  mm,
  type Layer,
  type PlaceholderValues,
  type QrLayer,
  type TextLayer,
  type TicketDesign,
} from "./design";
import { layoutPlan, type PrintLayout } from "./layout";
import { QR_MARGIN_MODULES, qrMatrix, qrRunsPath } from "./qr-matrix";
import { buildLayerNode, loadKonva, prepareAssets, qrCaptionMetrics, renderToCanvas } from "./render";

export interface PdfTicket {
  serial: string;
  code: string;
  token: string;
}

export interface PdfOptions {
  layout: PrintLayout;
  cropMarks: boolean;
  title: string; // footer, e.g. "Qawwali Night · General"
  artworkDpi?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const PT_PER_MM = 72 / 25.4;
const pt = (millimetres: number) => millimetres * PT_PER_MM;

function hexToRgb(hex: string | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render the ticket artwork.");
  return new Uint8Array(await blob.arrayBuffer());
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function buildTicketsPdf(design: TicketDesign, baseValues: PlaceholderValues, tickets: PdfTicket[], opts: PdfOptions): Promise<Uint8Array> {
  if (!tickets.length) throw new Error("No tickets to print.");
  const K = await loadKonva();
  const assets = await prepareAssets(design, { ...baseValues, serial: tickets[0].serial, code: tickets[0].code });

  const ticketW = mm(design.width);
  const ticketH = mm(design.height);
  const plan = layoutPlan(opts.layout, ticketW, ticketH, opts.cropMarks);
  const bleedUnits = plan.bleed * 10;

  const qrLayer = design.layers.find((l): l is QrLayer => l.type === "qr" && !l.hidden);
  const variableTexts = design.layers.filter((l): l is TextLayer => l.type === "text" && !l.hidden && hasPerTicketPlaceholder(l.text));
  const variableIds = new Set(variableTexts.map((l) => l.id));
  const isVariable = (l: Layer) => l.type === "qr" || variableIds.has(l.id);

  const doc = await PDFDocument.create();
  doc.setTitle(`TickLO tickets – ${opts.title}`);
  doc.setCreator("TickLO (ticklo.pk)");
  doc.setProducer("TickLO");
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helv = await doc.embedFont(StandardFonts.Helvetica);

  // 1) Artwork shared by all tickets, with bleed
  const dpi = opts.artworkDpi ?? 400;
  const artCanvas = renderToCanvas(K, design, { values: baseValues, assets, qrToken: null, bleed: bleedUnits, pixelRatio: dpi / 254, skip: isVariable });
  const art = await doc.embedPng(await canvasToPng(artCanvas));
  artCanvas.width = artCanvas.height = 0;

  // 2) A small stage reused to render per-ticket texts
  const container = document.createElement("div");
  const stage = new K.Stage({ container, width: design.width, height: design.height });
  const kLayer = new K.Layer({ listening: false });
  stage.add(kLayer);
  const textRatio = 600 / 254;

  const total = tickets.length;
  const pages = Math.ceil(total / plan.perPage);
  let page: PDFPage | null = null;

  try {
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const slotIndex = i % plan.perPage;
      if (slotIndex === 0) {
        page = doc.addPage([pt(plan.pageWidth), pt(plan.pageHeight)]);
        drawSheetExtras(page, plan, opts, Math.floor(i / plan.perPage) + 1, pages, tickets, i, helv);
      }
      const t = tickets[i];
      const slot = plan.slots[slotIndex];
      // pdf-lib: origin bottom-left. Trim box top-left = (slot.x, slot.y) mm from top-left.
      const left = pt(slot.x);
      const top = pt(plan.pageHeight - slot.y);
      const u = (v: number) => pt(mm(v)); // design units → pt
      const b = pt(plan.bleed);

      page!.drawImage(art, { x: left - b, y: top - u(design.height) - b, width: u(design.width) + 2 * b, height: u(design.height) + 2 * b });

      const values: PlaceholderValues = { ...baseValues, serial: t.serial, code: t.code };
      for (const l of variableTexts) {
        await drawVariableText(doc, page!, K, kLayer, l, values, assets, design, textRatio, left, top, u);
      }
      if (qrLayer) drawQr(page!, qrLayer, t, left, top, u, helvBold);

      if (i % 10 === 9) {
        opts.onProgress?.(i + 1, total);
        await tick();
      }
    }
  } finally {
    stage.destroy();
  }
  opts.onProgress?.(total, total);
  return doc.save();
}

async function drawVariableText(
  doc: PDFDocument,
  page: PDFPage,
  K: Awaited<ReturnType<typeof loadKonva>>,
  kLayer: InstanceType<Awaited<ReturnType<typeof loadKonva>>["Layer"]>,
  l: TextLayer,
  values: PlaceholderValues,
  assets: Awaited<ReturnType<typeof prepareAssets>>,
  design: TicketDesign,
  ratio: number,
  left: number,
  top: number,
  u: (v: number) => number,
) {
  kLayer.destroyChildren();
  const node = buildLayerNode(K, l, { values, assets, designSize: { width: design.width, height: design.height } });
  kLayer.add(node);
  const r = node.getClientRect({ relativeTo: kLayer });
  if (r.width < 1 || r.height < 1) return;
  const pad = 4;
  const box = { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
  const canvas = kLayer.toCanvas({ ...box, pixelRatio: ratio }) as HTMLCanvasElement;
  const img: PDFImage = await doc.embedPng(await canvasToPng(canvas));
  page.drawImage(img, { x: left + u(box.x), y: top - u(box.y + box.height), width: u(box.width), height: u(box.height) });
}

function drawQr(page: PDFPage, l: QrLayer, t: PdfTicket, left: number, top: number, u: (v: number) => number, font: Awaited<ReturnType<PDFDocument["embedFont"]>>) {
  const caption = l.caption !== false;
  const { captionH, fontSize } = qrCaptionMetrics(l.size);
  const boxH = l.size + (caption ? captionH : 0);
  // White box (quiet zone + caption area)
  page.drawRectangle({ x: left + u(l.x), y: top - u(l.y + boxH), width: u(l.size), height: u(boxH), color: rgb(1, 1, 1) });
  const m = qrMatrix(t.token);
  const modules = m.size + QR_MARGIN_MODULES * 2;
  const moduleUnits = l.size / modules;
  page.drawSvgPath(qrRunsPath(m), {
    x: left + u(l.x),
    y: top - u(l.y),
    scale: u(moduleUnits),
    color: hexToRgb(l.dark ?? "#000000"),
    borderWidth: 0,
  });
  if (caption) {
    const size = u(fontSize);
    const spacing = size * 0.08;
    const width = font.widthOfTextAtSize(t.serial, size) + spacing * (t.serial.length - 1);
    let x = left + u(l.x) + (u(l.size) - width) / 2;
    const baseline = top - u(l.y + l.size - l.size * 0.02 + (captionH - fontSize) / 2) - size * 0.8;
    for (const ch of t.serial) {
      page.drawText(ch, { x, y: baseline, size, font, color: hexToRgb(l.dark ?? "#000000") });
      x += font.widthOfTextAtSize(ch, size) + spacing;
    }
  }
}

function drawSheetExtras(
  page: PDFPage,
  plan: ReturnType<typeof layoutPlan>,
  opts: PdfOptions,
  pageNo: number,
  pages: number,
  tickets: PdfTicket[],
  firstIndex: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  const H = plan.pageHeight;
  const black = rgb(0, 0, 0);
  const markLen = 5;
  const offset = plan.bleed + 1;
  if (opts.cropMarks) {
    const g = plan.grid;
    for (const x of plan.cutX) {
      // above and below the grid
      page.drawLine({ start: { x: pt(x), y: pt(H - (g.top - offset)) }, end: { x: pt(x), y: pt(H - (g.top - offset - markLen)) }, thickness: 0.25, color: black });
      page.drawLine({ start: { x: pt(x), y: pt(H - (g.bottom + offset)) }, end: { x: pt(x), y: pt(H - (g.bottom + offset + markLen)) }, thickness: 0.25, color: black });
    }
    for (const y of plan.cutY) {
      page.drawLine({ start: { x: pt(g.left - offset), y: pt(H - y) }, end: { x: pt(g.left - offset - markLen), y: pt(H - y) }, thickness: 0.25, color: black });
      page.drawLine({ start: { x: pt(g.right + offset), y: pt(H - y) }, end: { x: pt(g.right + offset + markLen), y: pt(H - y) }, thickness: 0.25, color: black });
    }
  }
  if (opts.layout !== "single") {
    const last = Math.min(firstIndex + plan.perPage, tickets.length) - 1;
    const footer = `${opts.title} · ${tickets[firstIndex].serial} – ${tickets[last].serial} · Page ${pageNo} of ${pages} · Printed with TickLO`;
    page.drawText(footer, { x: pt(Math.max(6, plan.grid.left)), y: pt(3.5), size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });
  }
}


/** Render a design to a PNG data URL (template thumbnails and previews). */
export async function designPreviewDataUrl(design: TicketDesign, values: PlaceholderValues, widthPx: number, qrToken: string): Promise<string> {
  const K = await loadKonva();
  const assets = await prepareAssets(design, values);
  const canvas = renderToCanvas(K, design, { values, assets, qrToken, pixelRatio: widthPx / design.width });
  return canvas.toDataURL("image/png");
}


import { describe, expect, it } from "vitest";
import {
  designProblems,
  drawOrder,
  fillPlaceholders,
  hasPerTicketPlaceholder,
  serialLabel,
  suggestPrefix,
  type TicketDesign,
} from "@/lib/print/design";
import { TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATES_PER_CATEGORY, cloneDesign, templateByKey } from "@/lib/print/templates";
import { BRAND_HEIGHT, BRAND_WIDTH, normalizeDesign } from "@/lib/print/design";
import { layoutPlan, sheetPlan } from "@/lib/print/layout";
import { qrMatrix, qrRunsPath, SAMPLE_QR_TOKEN } from "@/lib/print/qr-matrix";
import { TICKET_FONTS, fontById } from "@/lib/print/fonts";
import { staticTicketToken } from "@/lib/qr-token";

const base = (): TicketDesign => cloneDesign(templateByKey("minimal-green")!.design);

describe("ticket design rules (PRT-05)", () => {
  it("accepts every built-in template", () => {
    for (const t of TEMPLATES) expect(designProblems(t.design), t.key).toEqual([]);
  });

  it("uses only fonts the editor knows", () => {
    const ids = new Set(TICKET_FONTS.map((f) => f.id));
    for (const t of TEMPLATES) for (const l of t.design.layers) if (l.type === "text") expect(ids.has(l.fontFamily), `${t.key}/${l.id}`).toBe(true);
  });

  it("has unique layer ids in every template", () => {
    for (const t of TEMPLATES) {
      const ids = t.design.layers.map((l) => l.id);
      expect(new Set(ids).size, t.key).toBe(ids.length);
    }
  });

  it("needs exactly one QR, big enough, not rotated, on the ticket", () => {
    const noQr = base();
    noQr.layers = noQr.layers.filter((l) => l.type !== "qr");
    expect(designProblems(noQr)[0].message).toMatch(/exactly one QR/);

    const small = base();
    const q = small.layers.find((l) => l.type === "qr")!;
    if (q.type === "qr") q.size = 150;
    expect(designProblems(small).map((p) => p.message).join()).toMatch(/20 mm/);

    const off = base();
    const q2 = off.layers.find((l) => l.type === "qr")!;
    q2.x = 1700;
    expect(designProblems(off).map((p) => p.message).join()).toMatch(/fully on the ticket/);

    const rotated = base();
    rotated.layers.find((l) => l.type === "qr")!.rotation = 10;
    expect(designProblems(rotated).map((p) => p.message).join()).toMatch(/rotated/);
  });

  it("needs a visible TickLO logo at its fixed size – it can move, not shrink (D-040)", () => {
    const d = base();
    const b = d.layers.find((l) => l.type === "brand")!;
    b.hidden = true;
    expect(designProblems(d).map((p) => p.message).join()).toMatch(/TickLO/);
    b.hidden = false;
    b.opacity = 0.8;
    expect(designProblems(d)).toHaveLength(1);
    b.opacity = undefined;
    if (b.type === "brand") {
      b.width = 200;
      b.height = 70;
    }
    expect(designProblems(d)).toHaveLength(1);
    const fixed = normalizeDesign(d);
    const nb = fixed.layers.find((l) => l.type === "brand")!;
    expect(nb.type === "brand" && [nb.width, nb.height]).toEqual([BRAND_WIDTH, BRAND_HEIGHT]);
    expect(designProblems(fixed)).toEqual([]);
    // Moving is fine
    nb.x = 40;
    nb.y = 20;
    expect(designProblems(fixed)).toEqual([]);
  });

  it("has 6 templates in every category, unique keys, logo slot in modern ones", () => {
    for (const c of TEMPLATE_CATEGORIES) expect(TEMPLATES.filter((t) => t.category === c.key), c.key).toHaveLength(TEMPLATES_PER_CATEGORY);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      const b = t.design.layers.find((l) => l.type === "brand");
      expect(b && b.type === "brand" && [b.width, b.height], t.key).toEqual([BRAND_WIDTH, BRAND_HEIGHT]);
    }
    const modern = TEMPLATES.filter((t) => /-(split|boarding|glass|diagonal|bigtype|minimal)$/.test(t.key));
    expect(modern.length).toBeGreaterThanOrEqual(80);
    for (const t of modern) expect(t.design.layers.some((l) => l.type === "image" && l.src === "{{logo}}"), t.key).toBe(true);
  });

  it("rejects damaged JSON", () => {
    expect(designProblems({ version: 2 })).toHaveLength(1);
    expect(designProblems(null)).toHaveLength(1);
  });

  it("always draws QR and logo on top", () => {
    const order = drawOrder(base().layers).map((l) => l.type);
    expect(order.slice(-2).sort()).toEqual(["brand", "qr"]);
  });
});

describe("placeholders", () => {
  it("fills known keys and keeps unknown ones", () => {
    expect(fillPlaceholders("{{event_name}} – {{ price }} {{nope}}", { event_name: "Gala", price: "Rs 500" })).toBe("Gala – Rs 500 {{nope}}");
  });
  it("knows which change per ticket", () => {
    expect(hasPerTicketPlaceholder("No. {{serial}}")).toBe(true);
    expect(hasPerTicketPlaceholder("{{event_name}}")).toBe(false);
  });
  it("makes serial labels and prefixes", () => {
    expect(serialLabel("QWL", 42)).toBe("QWL-0042");
    expect(serialLabel("A", 12345)).toBe("A-12345");
    expect(suggestPrefix("Qawwali Night 2026")).toBe("QN2");
    expect(suggestPrefix("Gala")).toBe("GAL");
    expect(suggestPrefix("!!!")).toBe("TKT");
  });
});

describe("page layout (PRT-06)", () => {
  it("fits four 180 × 65 mm tickets on A4 portrait", () => {
    const p = sheetPlan("a4", 180, 65)!;
    expect(p.perPage).toBe(4);
    expect(p.pageWidth).toBe(210);
    for (const s of p.slots) {
      expect(s.x).toBeGreaterThanOrEqual(9 - 1e-9);
      expect(s.x + 180).toBeLessThanOrEqual(201 + 1e-9);
    }
    expect(p.cutX).toHaveLength(2);
    expect(p.cutY).toHaveLength(8);
  });

  it("uses landscape when it fits more", () => {
    const p = sheetPlan("a4", 85, 55)!;
    expect(p.perPage).toBeGreaterThanOrEqual(8);
  });

  it("falls back to one ticket per page when the ticket is bigger than the paper", () => {
    const p = layoutPlan("a4", 290, 290, true);
    expect(p.perPage).toBe(1);
    expect(p.pageWidth).toBe(290 + 2 * (3 + 8));
  });

  it("single press page = ticket + 3 mm bleed", () => {
    const p = layoutPlan("single", 180, 65, false);
    expect([p.pageWidth, p.pageHeight, p.bleed]).toEqual([186, 71, 3]);
  });
});

describe("QR for print", () => {
  it("encodes a real T2 token and merges runs into a compact path", () => {
    const token = staticTicketToken("123e4567-e89b-12d3-a456-426614174000", "x".repeat(32));
    expect(token.length).toBe(SAMPLE_QR_TOKEN.length);
    const m = qrMatrix(token);
    expect(m.size).toBeGreaterThanOrEqual(25);
    const d = qrRunsPath(m);
    let dark = 0;
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) dark++;
    // Every dark module is covered exactly once by the run rectangles
    const covered = [...d.matchAll(/h(\d+)v1/g)].reduce((s, x) => s + Number(x[1]), 0);
    expect(covered).toBe(dark);
    // Finder pattern top-left starts at the quiet zone (2 modules)
    expect(d.startsWith("M2 2h7")).toBe(true);
  });
});

describe("fonts", () => {
  it("falls back to the default font", () => {
    expect(fontById("nope").family).toBe("Poppins");
  });
});

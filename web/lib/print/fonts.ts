/**
 * Fonts available in the ticket editor. They are self-hosted (@fontsource,
 * imported in components/print/ticket-fonts.tsx) so the editor and the PDF
 * look the same and work without Google Fonts.
 */
export interface TicketFont {
  id: string;
  family: string;
  weight: number;
  label: string;
  /** Text used to make the browser download the right subset (Urdu needs Arabic glyphs). */
  sample?: string;
}

export const TICKET_FONTS: TicketFont[] = [
  { id: "poppins-400", family: "Poppins", weight: 400, label: "Poppins" },
  { id: "poppins-600", family: "Poppins", weight: 600, label: "Poppins Semibold" },
  { id: "poppins-800", family: "Poppins", weight: 800, label: "Poppins Extra Bold" },
  { id: "montserrat-500", family: "Montserrat", weight: 500, label: "Montserrat" },
  { id: "montserrat-800", family: "Montserrat", weight: 800, label: "Montserrat Extra Bold" },
  { id: "grotesk-700", family: "Space Grotesk", weight: 700, label: "Space Grotesk Bold" },
  { id: "playfair-700", family: "Playfair Display", weight: 700, label: "Playfair Display" },
  { id: "cinzel-700", family: "Cinzel", weight: 700, label: "Cinzel" },
  { id: "bebas-400", family: "Bebas Neue", weight: 400, label: "Bebas Neue" },
  { id: "oswald-600", family: "Oswald", weight: 600, label: "Oswald" },
  { id: "orbitron-800", family: "Orbitron", weight: 800, label: "Orbitron" },
  { id: "russo-400", family: "Russo One", weight: 400, label: "Russo One" },
  { id: "greatvibes-400", family: "Great Vibes", weight: 400, label: "Great Vibes (script)" },
  { id: "pacifico-400", family: "Pacifico", weight: 400, label: "Pacifico" },
  { id: "nastaliq-700", family: "Noto Nastaliq Urdu", weight: 700, label: "Nastaliq (اردو)", sample: "قوالی نائٹ abc" },
];

const BY_ID = new Map(TICKET_FONTS.map((f) => [f.id, f]));
export const DEFAULT_FONT_ID = "poppins-600";

export function fontById(id: string | undefined): TicketFont {
  return BY_ID.get(id ?? "") ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

/** CSS font shorthand pieces for Konva: fontFamily + fontStyle. */
export function konvaFont(id: string | undefined, italic?: boolean): { fontFamily: string; fontStyle: string } {
  const f = fontById(id);
  return { fontFamily: `"${f.family}"`, fontStyle: `${italic ? "italic " : ""}${f.weight}` };
}

/** Wait until the fonts used by these texts are downloaded (canvas can't wait by itself). */
export async function loadFonts(uses: { fontFamily: string; text: string; italic?: boolean }[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const seen = new Set<string>();
  const jobs: Promise<unknown>[] = [];
  for (const u of uses) {
    const f = fontById(u.fontFamily);
    const sample = (u.text || "") + (f.sample ?? "") + "Aa0";
    const key = `${f.id}|${u.italic ? 1 : 0}|${/[؀-ۿ]/.test(sample) ? "ar" : "la"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(document.fonts.load(`${u.italic ? "italic " : ""}${f.weight} 40px "${f.family}"`, sample).catch(() => undefined));
  }
  // The QR caption and brand label use system Helvetica/Arial; nothing to load.
  await Promise.all(jobs);
}

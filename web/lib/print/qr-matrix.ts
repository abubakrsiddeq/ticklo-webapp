import QRCode from "qrcode";

/** Quiet zone (white border) inside the QR layer, in modules. */
export const QR_MARGIN_MODULES = 2;
/** Error correction Q (25 %): a smudged or slightly torn print still scans. */
export const QR_LEVEL = "Q" as const;

export interface QrMatrix {
  size: number; // modules per side (without margin)
  dark: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_LEVEL });
  const { size, data } = qr.modules;
  return { size, dark: (r, c) => Boolean(data[r * size + c]) };
}

/**
 * SVG path (in module units, margin included) with one rectangle per run of
 * dark modules in a row – small enough for thousands of QR codes in one PDF.
 */
export function qrRunsPath(m: QrMatrix, margin = QR_MARGIN_MODULES): string {
  let d = "";
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.dark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.dark(r, c)) c++;
      d += `M${start + margin} ${r + margin}h${c - start}v1h${start - c}z`;
    }
  }
  return d;
}

/** A realistic-looking sample token (same length as a real T2 token) for previews. */
export const SAMPLE_QR_TOKEN = "T2.U2FtcGxlVGlja2V0UVIwMQ.VGlja0xPLVByZXZpZXctUQ";

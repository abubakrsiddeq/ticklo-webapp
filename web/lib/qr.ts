import "server-only";
import QRCode from "qrcode";
import { serverEnv } from "@/lib/env.server";
import { staticTicketToken } from "@/lib/qr-token";

/** The ticket's fixed QR content, or null if QR_SIGNING_SECRET is not configured. */
export function ticketQrToken(ticketId: string): string | null {
  if (!serverEnv.qrSigningSecret) {
    console.error("QR_SIGNING_SECRET is not set – cannot create ticket QR codes");
    return null;
  }
  return staticTicketToken(ticketId, serverEnv.qrSigningSecret);
}

const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#0B1F3A", light: "#FFFFFF" } };

export async function ticketQrPng(ticketId: string, width = 600): Promise<Buffer | null> {
  const token = ticketQrToken(ticketId);
  return token ? QRCode.toBuffer(token, { ...QR_OPTIONS, width, type: "png" }) : null;
}

export async function ticketQrDataUrl(ticketId: string, width = 640): Promise<string | null> {
  const token = ticketQrToken(ticketId);
  return token ? QRCode.toDataURL(token, { ...QR_OPTIONS, width }) : null;
}

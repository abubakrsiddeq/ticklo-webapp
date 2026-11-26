import { createHmac, timingSafeEqual } from "node:crypto";

// Fixed per-ticket QR token (D-037). Must stay byte-for-byte identical to
// supabase/functions/_shared/qr-token.ts → signStaticTicketToken (unit-tested).

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function staticTicketToken(ticketId: string, secret: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) throw new Error("Invalid UUID");
  if (!secret || secret.length < 16) throw new Error("QR signing secret must be at least 16 characters");
  const payload = `T2.${b64url(Buffer.from(ticketId.replace(/-/g, ""), "hex"))}`;
  const sig = createHmac("sha256", secret).update(payload).digest().subarray(0, 16);
  return `${payload}.${b64url(sig)}`;
}

/**
 * Check a scanned T2 token (the seller's Sell screen, D-041). Returns the
 * ticket id when the signature is ours, otherwise null. Timing-safe.
 */
export function verifyStaticTicketToken(token: string, secret: string): string | null {
  const m = /^T2\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!m || !secret || secret.length < 16) return null;
  const hex = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/") + "==", "base64").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const expected = Buffer.from(staticTicketToken(id, secret));
  const given = Buffer.from(token.trim());
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

import { createHmac } from "node:crypto";

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

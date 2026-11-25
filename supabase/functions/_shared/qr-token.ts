/**
 * TickLO rotating QR tokens (TKT-02, SCN-03, NFR-06, business rule 8).
 *
 * Format (≈56 chars, keeps the QR code small and fast to scan):
 *
 *   T1.<ticket id: 16 bytes base64url>.<issued-at: unix seconds base36>.<HMAC-SHA256, first 16 bytes, base64url>
 *
 * - Only IDs and time are inside the token – no personal data (NFR-06).
 * - The owner's page asks for a fresh token every 30 seconds.
 * - The scanner accepts a token for 60 seconds by server time, plus a small
 *   future skew allowance.
 *
 * Pure Web Crypto with no imports, so it runs unchanged in Deno (Supabase Edge
 * Functions), Node 20+ (tests) and any future server code.
 */

export const QR_TOKEN_VERSION = "T1";
export const QR_ROTATE_SECONDS = 30;
export const QR_MAX_AGE_SECONDS = 60;
export const QR_MAX_FUTURE_SKEW_SECONDS = 5;
const SIGNATURE_BYTES = 16;
const MIN_SECRET_LENGTH = 16;

const encoder = new TextEncoder();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padding = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function uuidToBytes(uuid: string): Uint8Array {
  if (!isUuid(uuid)) throw new Error("Invalid UUID");
  const hex = uuid.replace(/-/g, "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error("A UUID needs 16 bytes");
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(secret, key);
  }
  return key;
}

async function signPayload(payload: string, secret: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const full = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return full.slice(0, SIGNATURE_BYTES);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function assertSecret(secret: string) {
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`QR signing secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
}

/** Create a signed token for a ticket, issued at `issuedAtSeconds` (unix seconds). */
export async function signTicketToken(ticketId: string, issuedAtSeconds: number, secret: string): Promise<string> {
  assertSecret(secret);
  const issuedAt = Math.floor(issuedAtSeconds);
  if (!Number.isFinite(issuedAt) || issuedAt < 0) throw new Error("Invalid issue time");
  const payload = `${QR_TOKEN_VERSION}.${base64UrlEncode(uuidToBytes(ticketId))}.${issuedAt.toString(36)}`;
  const signature = await signPayload(payload, secret);
  return `${payload}.${base64UrlEncode(signature)}`;
}

export type TokenFailureReason = "malformed" | "bad_signature" | "expired" | "not_yet_valid";

export type VerifyTokenResult =
  | { ok: true; ticketId: string; issuedAt: number; ageSeconds: number }
  | { ok: false; reason: TokenFailureReason; ticketId?: string; issuedAt?: number };

export interface VerifyOptions {
  maxAgeSeconds?: number;
  maxFutureSkewSeconds?: number;
}

/**
 * Verify signature and freshness. The ticket id is only returned for a valid
 * signature, so a forged token can never point at a real ticket.
 */
export async function verifyTicketToken(
  token: string,
  secret: string,
  nowSeconds: number,
  options: VerifyOptions = {},
): Promise<VerifyTokenResult> {
  assertSecret(secret);
  const maxAge = options.maxAgeSeconds ?? QR_MAX_AGE_SECONDS;
  const maxSkew = options.maxFutureSkewSeconds ?? QR_MAX_FUTURE_SKEW_SECONDS;

  if (typeof token !== "string" || token.length > 200) return { ok: false, reason: "malformed" };
  const parts = token.trim().split(".");
  if (parts.length !== 4 || parts[0] !== QR_TOKEN_VERSION) return { ok: false, reason: "malformed" };

  const [version, idPart, timePart, sigPart] = parts;
  const idBytes = base64UrlDecode(idPart);
  if (!idBytes || idBytes.length !== 16) return { ok: false, reason: "malformed" };
  if (!/^[0-9a-z]{1,10}$/.test(timePart)) return { ok: false, reason: "malformed" };
  const signature = base64UrlDecode(sigPart);
  if (!signature || signature.length !== SIGNATURE_BYTES) return { ok: false, reason: "malformed" };

  const expected = await signPayload(`${version}.${idPart}.${timePart}`, secret);
  if (!constantTimeEqual(signature, expected)) return { ok: false, reason: "bad_signature" };

  const ticketId = bytesToUuid(idBytes);
  const issuedAt = parseInt(timePart, 36);
  const age = Math.floor(nowSeconds) - issuedAt;
  if (age > maxAge) return { ok: false, reason: "expired", ticketId, issuedAt };
  if (age < -maxSkew) return { ok: false, reason: "not_yet_valid", ticketId, issuedAt };
  return { ok: true, ticketId, issuedAt, ageSeconds: age };
}

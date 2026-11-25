import { describe, expect, it } from "vitest";
import {
  QR_MAX_AGE_SECONDS,
  base64UrlDecode,
  base64UrlEncode,
  bytesToUuid,
  signTicketToken,
  uuidToBytes,
  verifyTicketToken,
} from "../../../supabase/functions/_shared/qr-token.ts";

const SECRET = "test-secret-that-is-long-enough-123";
const TICKET = "6f1c2a9e-3b4d-4c5e-8f60-718293a4b5c6";
const NOW = 1_795_000_000;

describe("QR token (TKT-02, SCN-03, rule 8, NFR-06)", () => {
  it("round-trips UUIDs and base64url", () => {
    expect(bytesToUuid(uuidToBytes(TICKET))).toBe(TICKET);
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(base64UrlDecode(base64UrlEncode(bytes))!)).toEqual(Array.from(bytes));
    expect(base64UrlDecode("not valid!")).toBeNull();
  });

  it("produces a short token without personal data", async () => {
    const token = await signTicketToken(TICKET, NOW, SECRET);
    expect(token.startsWith("T1.")).toBe(true);
    expect(token.length).toBeLessThan(64);
    expect(token.split(".")).toHaveLength(4);
    expect(token).not.toContain(TICKET); // id is encoded, not spelled out
  });

  it("verifies a fresh token and returns the ticket id", async () => {
    const token = await signTicketToken(TICKET, NOW, SECRET);
    const r = await verifyTicketToken(token, SECRET, NOW + 10);
    expect(r).toEqual({ ok: true, ticketId: TICKET, issuedAt: NOW, ageSeconds: 10 });
  });

  it("accepts tokens up to 60 seconds old and rejects older ones (screenshots)", async () => {
    const token = await signTicketToken(TICKET, NOW, SECRET);
    expect((await verifyTicketToken(token, SECRET, NOW + QR_MAX_AGE_SECONDS)).ok).toBe(true);
    const old = await verifyTicketToken(token, SECRET, NOW + QR_MAX_AGE_SECONDS + 1);
    expect(old).toMatchObject({ ok: false, reason: "expired", ticketId: TICKET });
  });

  it("rejects tokens from the future beyond the small skew allowance", async () => {
    const token = await signTicketToken(TICKET, NOW + 30, SECRET);
    expect((await verifyTicketToken(token, SECRET, NOW + 26)).ok).toBe(true);
    expect(await verifyTicketToken(token, SECRET, NOW)).toMatchObject({ ok: false, reason: "not_yet_valid" });
  });

  it("rejects a token signed with another key", async () => {
    const token = await signTicketToken(TICKET, NOW, "another-secret-that-is-long-enough");
    const r = await verifyTicketToken(token, SECRET, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects tampered tokens (changed ticket id or time)", async () => {
    const token = await signTicketToken(TICKET, NOW, SECRET);
    const [v, id, t, sig] = token.split(".");
    const otherId = base64UrlEncode(uuidToBytes("00000000-0000-4000-8000-000000000001"));
    expect(await verifyTicketToken([v, otherId, t, sig].join("."), SECRET, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const laterTime = (NOW + 600).toString(36);
    expect(await verifyTicketToken([v, id, laterTime, sig].join("."), SECRET, NOW + 600)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects malformed input", async () => {
    for (const bad of ["", "hello", "T1.a.b.c", "T2.x.y.z", "T1..1.", "x".repeat(300), "T1.AAAA.zz.AAAA"]) {
      expect(await verifyTicketToken(bad, SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("refuses weak secrets and invalid ids", async () => {
    await expect(signTicketToken(TICKET, NOW, "short")).rejects.toThrow(/at least/);
    await expect(signTicketToken("not-a-uuid", NOW, SECRET)).rejects.toThrow(/UUID/);
  });
});

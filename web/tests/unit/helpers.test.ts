import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { slugify } from "@/lib/slug";
import { safeNext } from "@/lib/site";
import { toCsv } from "@/lib/csv";
import { friendlyError, errorCode } from "@/lib/errors";
import { describeScan } from "@/lib/scan/results";

describe("phone numbers", () => {
  it("normalises Pakistani mobile numbers", () => {
    expect(normalizePhone("0300 1234567")).toBe("+923001234567");
    expect(normalizePhone("+92 300-1234567")).toBe("+923001234567");
    expect(normalizePhone("923001234567")).toBe("+923001234567");
    expect(normalizePhone("00923001234567")).toBe("+923001234567");
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
    expect(normalizePhone("12345")).toBeNull();
    expect(formatPhone("+923001234567")).toBe("0300 1234567");
  });
});

describe("slugs (EVT-04 clean links)", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("LUMS Music Society")).toBe("lums-music-society");
    expect(slugify("Rock & Roll Night!! 2026")).toBe("rock-and-roll-night-2026");
    expect(slugify("Café Ünïcode")).toBe("cafe-unicode");
    expect(slugify("x").length).toBeGreaterThanOrEqual(2);
  });
});

describe("safeNext (AUTH-07 without open redirects)", () => {
  it("allows only local paths", () => {
    expect(safeNext("/e/lums/gala")).toBe("/e/lums/gala");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
    expect(safeNext("/confirm-email?token_hash=x")).toBe("/");
    expect(safeNext(undefined, "/me/tickets")).toBe("/me/tickets");
  });
});

describe("CSV export (ORG-09, ORG-12)", () => {
  it("escapes values and blocks spreadsheet formulas", () => {
    const csv = toCsv(["Name", "Note"], [["Ali, Raza", 'He said "hi"'], ["=HYPERLINK()", null]]);
    expect(csv.startsWith("﻿Name,Note\r\n")).toBe(true);
    expect(csv).toContain('"Ali, Raza","He said ""hi"""');
    expect(csv).toContain("'=HYPERLINK(),");
  });
});

describe("error messages", () => {
  it("uses the database detail for TL errors and hides technical ones", () => {
    const e = { message: "TL:SOLD_OUT", details: 'Only 2 "VIP" ticket(s) left.' };
    expect(errorCode(e)).toBe("SOLD_OUT");
    expect(friendlyError(e)).toBe('Only 2 "VIP" ticket(s) left.');
    expect(friendlyError({ message: "TL:FORBIDDEN" })).toBe("You are not allowed to do that.");
    expect(friendlyError({ message: 'relation "x" does not exist', code: "42P01" })).toBe("Something went wrong. Please try again.");
  });
});

describe("scanner result wording (SCN-04)", () => {
  it("maps results to the screens from the requirements", () => {
    expect(describeScan({ result: "ok", holder_name: "Ali", ticket_type: "VIP" })).toMatchObject({ ok: true, title: "Entry OK", name: "Ali" });
    expect(describeScan({ result: "already_used", checked_in_at: "2026-12-14T11:12:00Z" }).title).toBe("Already used at 4:12 PM");
    expect(describeScan({ result: "expired_code" })).toMatchObject({ ok: false, title: "Not valid here" });
    expect(describeScan({ result: "wrong_event" })).toMatchObject({ ok: false, title: "Not valid here" });
    expect(describeScan({ result: "invalid" })).toMatchObject({ ok: false, title: "Invalid" });
  });
});

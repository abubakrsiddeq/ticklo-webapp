import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDate,
  formatEventRange,
  formatPKR,
  formatTime,
  fromPKTInputValue,
  paisaToRupeesInput,
  rupeesToPaisa,
  toPKTInputValue,
} from "@/lib/format";

describe("money (NFR-08)", () => {
  it("formats paisa as Rs with thousands separators", () => {
    expect(formatPKR(150000)).toBe("Rs 1,500");
    expect(formatPKR(250000000)).toBe("Rs 2,500,000");
    expect(formatPKR(12345)).toBe("Rs 123.45");
    expect(formatPKR(0)).toBe("Rs 0");
    expect(formatPKR(0, { freeLabel: "Free" })).toBe("Free");
  });

  it("converts typed rupees to paisa and back", () => {
    expect(rupeesToPaisa("1,500")).toBe(150000);
    expect(rupeesToPaisa("99.5")).toBe(9950);
    expect(Number.isNaN(rupeesToPaisa("abc"))).toBe(true);
    expect(paisaToRupeesInput(150000)).toBe("1500");
    expect(paisaToRupeesInput(9950)).toBe("99.50");
  });
});

describe("time in PKT (NFR-09)", () => {
  const utc = "2026-12-14T13:00:00.000Z"; // 6:00 PM in Pakistan

  it("shows Pakistan time regardless of the server time zone", () => {
    expect(formatTime(utc)).toBe("6:00 PM");
    expect(formatDate(utc)).toContain("14 Dec 2026");
    expect(formatEventRange(utc, "2026-12-14T18:00:00.000Z")).toMatch(/6:00 PM – 11:00 PM PKT$/);
  });

  it("round-trips datetime-local values typed in PKT", () => {
    expect(toPKTInputValue(utc)).toBe("2026-12-14T18:00");
    expect(fromPKTInputValue("2026-12-14T18:00")).toBe(utc);
    expect(fromPKTInputValue("")).toBeNull();
    expect(fromPKTInputValue("not a date")).toBeNull();
  });

  it("formats the hold countdown", () => {
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

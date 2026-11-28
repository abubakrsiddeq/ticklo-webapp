import { describe, expect, it } from "vitest";
import { daysUntil, digestIsEmpty, digestSubject, isOverdue, startOfPktDay, waitingLabel } from "@/lib/admin-digest";

// D-088: admin emails
describe("admin digest helpers", () => {
  it("finds midnight in Pakistan (UTC+5)", () => {
    // 2026-11-28 03:00 UTC is 08:00 PKT on the 28th → midnight PKT = 27th 19:00 UTC
    expect(startOfPktDay(new Date("2026-11-28T03:00:00Z")).toISOString()).toBe("2026-11-27T19:00:00.000Z");
    // 2026-11-28 20:00 UTC is already 01:00 PKT on the 29th
    expect(startOfPktDay(new Date("2026-11-28T20:00:00Z")).toISOString()).toBe("2026-11-28T19:00:00.000Z");
  });

  it("labels how long something waited", () => {
    const now = new Date("2026-11-28T09:00:00Z");
    expect(waitingLabel("2026-11-28T08:30:00Z", now)).toBe("just now");
    expect(waitingLabel("2026-11-28T06:00:00Z", now)).toBe("3 h");
    expect(waitingLabel("2026-11-27T00:00:00Z", now)).toBe("33 h");
    expect(waitingLabel("2026-11-25T09:00:00Z", now)).toBe("3 days");
  });

  it("marks requests older than 24 hours as overdue", () => {
    const now = new Date("2026-11-28T09:00:00Z");
    expect(isOverdue("2026-11-27T10:00:00Z", now)).toBe(false);
    expect(isOverdue("2026-11-27T08:00:00Z", now)).toBe(true);
  });

  it("says how many days until an event only when it is close", () => {
    const now = new Date("2026-11-28T09:00:00Z");
    expect(daysUntil("2026-11-28T20:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-11-30T20:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-12-05T20:00:00Z", now)).toBeNull();
    expect(daysUntil("2026-11-27T20:00:00Z", now)).toBeNull();
  });

  it("is not sent on quiet days", () => {
    expect(digestIsEmpty({ waiting: 0, attention: 0 })).toBe(true);
    expect(digestIsEmpty({ waiting: 1, attention: 0 })).toBe(false);
    expect(digestIsEmpty({ waiting: 0, attention: 2 })).toBe(false);
  });

  it("writes a short subject", () => {
    expect(digestSubject({ waiting: 4, attention: 2 })).toBe("TickLO daily: 4 waiting, 2 need attention");
    expect(digestSubject({ waiting: 0, attention: 1 })).toBe("TickLO daily: 1 needs attention");
    expect(digestSubject({ waiting: 3, attention: 0 })).toBe("TickLO daily: 3 waiting");
  });
});

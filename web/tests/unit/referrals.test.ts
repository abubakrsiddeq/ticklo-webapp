import { describe, expect, it } from "vitest";
import {
  ambassadorPath,
  discountFor,
  discountLabel,
  eligibleQuantity,
  isValidCode,
  milestoneProgress,
  normalizeCode,
  rewardDue,
  rewardLabel,
  shareMessage,
  whatsappShareUrl,
} from "@/lib/referrals";

const items = [
  { ticketTypeId: "a", quantity: 2, pricePaisa: 100000 },
  { ticketTypeId: "vip", quantity: 1, pricePaisa: 300000 },
  { ticketTypeId: "free", quantity: 1, pricePaisa: 0 },
];

describe("codes (D-043)", () => {
  it("normalizes like Postgres", () => {
    expect(normalizeCode(" ali-10 ")).toBe("ALI10");
    expect(normalizeCode("---")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(isValidCode("ALI")).toBe(true);
    expect(isValidCode("AL")).toBe(false);
    expect(isValidCode("ali")).toBe(false);
    expect(isValidCode("A".repeat(17))).toBe(false);
  });

  it("builds the share link and WhatsApp message", () => {
    expect(ambassadorPath("rock", "gala", "ALI")).toBe("/e/rock/gala?ref=ALI");
    const msg = shareMessage({ eventName: "Gala", when: "Sat 6 Dec", url: "https://x/e/rock/gala?ref=ALI", code: "ALI", discount: "Rs 100 off each ticket" });
    expect(msg).toContain("*Gala*");
    expect(msg).toContain("Rs 100 off each ticket");
    expect(msg).toContain("Code: *ALI*");
    expect(whatsappShareUrl("a b")).toBe("https://wa.me/?text=a%20b");
  });
});

describe("discounts (AMB-07)", () => {
  it("fixed is off each ticket and never below the price", () => {
    expect(discountFor(items, { type: "fixed", value: 10000 })).toBe(2 * 10000 + 10000 + 0);
    expect(discountFor(items, { type: "fixed", value: 99999999 })).toBe(2 * 100000 + 300000);
  });

  it("percent rounds per ticket and respects ticket types", () => {
    expect(discountFor(items, { type: "percent", value: 10 })).toBe(20000 + 30000);
    expect(discountFor(items, { type: "percent", value: 10, ticketTypeIds: ["vip"] })).toBe(30000);
    expect(discountFor([{ ticketTypeId: "a", quantity: 3, pricePaisa: 33333 }], { type: "percent", value: 15 })).toBe(3 * 5000);
    expect(discountFor(items, { type: "none", value: 10 })).toBe(0);
    expect(discountFor(items, null)).toBe(0);
  });

  it("counts eligible tickets for minimum-ticket deals", () => {
    expect(eligibleQuantity(items, { ticketTypeIds: null })).toBe(4);
    expect(eligibleQuantity(items, { ticketTypeIds: ["a"] })).toBe(2);
  });

  it("labels", () => {
    expect(discountLabel("percent", 10)).toBe("10% off");
    expect(discountLabel("fixed", 10000)).toMatch(/Rs\s?100 off each ticket/);
    expect(discountLabel("none", 10)).toBeNull();
    expect(rewardLabel("fixed", 5000)).toMatch(/Rs\s?50 per ticket/);
    expect(rewardLabel("percent", 5)).toBe("5% of the money you bring");
  });
});

describe("rewards (AMB-06)", () => {
  const ms = [
    { tickets: 25, reward: "VIP" },
    { tickets: 10, reward: "Free ticket" },
  ];
  it("shows reached milestones and progress to the next", () => {
    expect(milestoneProgress(ms, 0)).toMatchObject({ reached: [], next: { tickets: 10 }, progress: 0, left: 10 });
    expect(milestoneProgress(ms, 15)).toMatchObject({ reached: [{ tickets: 10 }], next: { tickets: 25 }, left: 10 });
    expect(milestoneProgress(ms, 15).progress).toBeCloseTo(5 / 15);
    expect(milestoneProgress(ms, 30)).toMatchObject({ next: null, progress: 1, left: 0 });
    expect(milestoneProgress([], 3)).toMatchObject({ next: null, progress: 1 });
  });
  it("due is never negative", () => {
    expect(rewardDue(10000, 4000)).toBe(6000);
    expect(rewardDue(10000, 15000)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { answerText, checkAnswers, clashes, feeLabel, groupByDay, kindLabel, overlaps, pktDay, seatsLabel, teamSizeLabel, type Question } from "@/lib/sessions";

const q = (o: Partial<Question>): Question => ({ id: "q1", label: "Q", type: "text", options: [], required: false, ...o });

describe("sessions (D-044)", () => {
  it("groups by Pakistan day, not UTC", () => {
    // 20:00 UTC on the 13th = 01:00 PKT on the 14th
    expect(pktDay("2026-12-13T20:00:00Z")).toBe("2026-12-14");
    const days = groupByDay([
      { id: "b", starts_at: "2026-12-14T05:00:00Z" },
      { id: "a", starts_at: "2026-12-13T20:00:00Z" },
      { id: "c", starts_at: "2026-12-15T05:00:00Z" },
    ]);
    expect(days.map((d) => d.day)).toEqual(["2026-12-14", "2026-12-15"]);
    expect(days[0].sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(days[0].label).toMatch(/^Day 1 · /);
    expect(groupByDay([{ starts_at: "2026-12-14T05:00:00Z" }])[0].label).not.toMatch(/Day 1/);
  });

  it("finds time clashes", () => {
    const a = { id: "a", name: "A", starts_at: "2026-12-14T05:00:00Z", ends_at: "2026-12-14T07:00:00Z" };
    const b = { id: "b", name: "B", starts_at: "2026-12-14T06:00:00Z", ends_at: "2026-12-14T08:00:00Z" };
    const c = { id: "c", name: "C", starts_at: "2026-12-14T07:00:00Z", ends_at: "2026-12-14T09:00:00Z" };
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(a, c)).toBe(false); // back to back is fine
    expect(clashes([a, b, c]).map(([x, y]) => `${x.id}${y.id}`)).toEqual(["ab", "bc"]);
  });

  it("checks answers like the database", () => {
    const qs = [q({ id: "q1", required: true }), q({ id: "q2", type: "number" }), q({ id: "q3", type: "select", options: ["S", "M"] }), q({ id: "q4", type: "yes_no" })];
    expect(checkAnswers(qs, {})).toEqual({ q1: "Required" });
    expect(checkAnswers(qs, { q1: "x", q2: "abc", q3: "XL", q4: "maybe" })).toEqual({ q2: "Enter a number", q3: "Choose one", q4: "Choose yes or no" });
    expect(checkAnswers(qs, { q1: "x", q2: "12.5", q3: "M", q4: "yes" })).toEqual({});
    expect(answerText(q({ type: "yes_no" }), "yes")).toBe("Yes");
  });

  it("labels", () => {
    expect(kindLabel("workshop")).toBe("Workshop");
    expect(feeLabel(0, "per_team")).toBe("Free");
    expect(feeLabel(150000, "per_team")).toMatch(/Rs\s?1,500 per team/);
    expect(feeLabel(50000, "per_member")).toMatch(/per member/);
    expect(teamSizeLabel(1, 1)).toBe("Individual");
    expect(teamSizeLabel(2, 3)).toBe("Teams of 2–3");
    expect(teamSizeLabel(4, 4)).toBe("Teams of 4");
    expect(seatsLabel({ kind: "workshop", capacity: 40, remaining: 3 })).toBe("3 seats left");
    expect(seatsLabel({ kind: "workshop", capacity: 40, remaining: 0 })).toBe("Sold out");
    expect(seatsLabel({ kind: "competition", capacity: 10, remaining: 1 })).toBe("1 team place left");
    expect(seatsLabel({ kind: "talk", capacity: null, remaining: null })).toBeNull();
  });
});

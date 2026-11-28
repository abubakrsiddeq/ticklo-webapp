import { describe, expect, it } from "vitest";
import { SESSION_STYLE_KEYS, guessCategory, guessStyle, sessionCategory, stylesForKind, suggestedCategory } from "@/lib/print/category";
import { TEMPLATE_CATEGORIES } from "@/lib/print/templates";

// D-081: which designs to show first
describe("design category guesses", () => {
  it("reads common event names", () => {
    expect(guessCategory("Qawwali Night")).toBe("qawwali");
    expect(guessCategory("Sufi Music Concert")).toBe("qawwali");
    expect(guessCategory("Mehfil-e-Mushaira")).toBe("mushaira");
    expect(guessCategory("DJ Night 2026")).toBe("dj-night");
    expect(guessCategory("Annual Gala Dinner")).toBe("gala");
    expect(guessCategory("Farewell 2026")).toBe("graduation");
    expect(guessCategory("Futsal Tournament")).toBe("sports");
    expect(guessCategory("Stand-up Comedy Night")).toBe("theatre");
    expect(guessCategory("Live Concert by Ali")).toBe("concert");
    expect(guessCategory("Aurex Spring Fest")).toBe("festival");
    expect(guessCategory("قوالی نائٹ")).toBe("qawwali");
    expect(guessCategory("Aurex 2.0")).toBeNull();
  });

  it("only offers styles for nights and other sessions", () => {
    expect(stylesForKind("concert").map((s) => s.key)).toContain("qawwali");
    expect(stylesForKind("other").map((s) => s.key)).toContain("sports");
    expect(stylesForKind("workshop")).toEqual([]);
    expect(guessStyle("concert", "Qawwali Night")).toBe("qawwali");
    expect(guessStyle("concert", "Futsal match")).toBeNull();
    expect(guessStyle("other", "Futsal match")).toBe("sports");
  });

  it("uses only real template categories", () => {
    const keys = new Set<string>(TEMPLATE_CATEGORIES.map((c) => c.key));
    for (const k of SESSION_STYLE_KEYS) expect(keys.has(k), k).toBe(true);
  });

  it("prefers the organizer's choice, then the name, then the kind", () => {
    expect(sessionCategory({ kind: "concert", name: "Night 1", style: "dj-night" })).toBe("dj-night");
    expect(sessionCategory({ kind: "concert", name: "Qawwali Night" })).toBe("qawwali");
    expect(sessionCategory({ kind: "concert", name: "Evening one" })).toBe("concert");
    expect(sessionCategory({ kind: "workshop", name: "Qawwali workshop" })).toBe("workshop");
    expect(sessionCategory({ kind: "talk", name: "Founders panel" })).toBe("conference");
    expect(sessionCategory({ kind: "other", name: "Northern areas trip" })).toBe("trip");
  });

  it("suggests designs per ticket", () => {
    const q = { id: "q", name: "Qawwali Night", kind: "concert", starts_at: "", ends_at: "", venue: null, pass_access: true };
    expect(suggestedCategory("festival", "Aurex", { kind: "session", sessions: [q] })).toBe("qawwali");
    expect(suggestedCategory("festival", "Aurex", { kind: "pass", sessions: [q] })).toBe("festival");
    expect(suggestedCategory("festival", "Aurex", { kind: "entry", sessions: [] })).toBe("festival");
    expect(suggestedCategory("competition", "Code Wars", { kind: "event", sessions: [] })).toBe("competition");
    expect(suggestedCategory("single", "Winter Gala", { kind: "event", sessions: [] })).toBe("gala");
    expect(suggestedCategory("single", "Aurex", { kind: "event", sessions: [] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { cleanSearch, decisionActions, decisionReason, parseKind, parseResult, reasonLabel } from "@/lib/decisions";

describe("decision history helpers (D-076)", () => {
  it("lists a kind's actions, with or without the steps in between", () => {
    expect(decisionActions("societies", "all")).toEqual(["org.register", "org.resubmit", "org.approve", "org.reject"]);
    expect(decisionActions("societies", "approved")).toEqual(["org.approve"]);
    expect(decisionActions("events", "rejected")).toEqual(["event.reject", "event.cancel"]);
    expect(decisionActions(null, "approved")).toContain("order.approve");
    expect(decisionActions(null, "approved")).not.toContain("org.register");
  });

  it("parses filters safely", () => {
    expect(parseKind("payments")).toBe("payments");
    expect(parseKind("nope")).toBeNull();
    expect(parseKind(undefined)).toBeNull();
    expect(parseResult("rejected")).toBe("rejected");
    expect(parseResult("x")).toBe("all");
  });

  it("finds the reason under any of the keys the database uses", () => {
    expect(decisionReason({ note: "Proof unreadable" })).toBe("Proof unreadable");
    expect(decisionReason({ reason: " Wrong amount " })).toBe("Wrong amount");
    expect(decisionReason({ previous_note: "Old reason" })).toBe("Old reason");
    expect(decisionReason({ note: null, name: "X" })).toBeNull();
    expect(decisionReason(null)).toBeNull();
    expect(reasonLabel("org.resubmit")).toBe("Was rejected for");
    expect(reasonLabel("org.reject")).toBe("Reason");
  });

  it("cleans search text for the filter", () => {
    expect(cleanSearch("  Media, (Club)* 50% ")).toBe("Media Club 50");
    expect(cleanSearch(undefined)).toBe("");
    expect(cleanSearch("a".repeat(200))).toHaveLength(80);
  });
});

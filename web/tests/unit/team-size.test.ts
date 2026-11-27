import { describe, expect, it } from "vitest";
import { parseTeamSize, participationOf, seatsLabel, teamSizeLabel } from "@/lib/sessions";

describe("competition: individuals or teams", () => {
  it("individuals are always 1 per entry, whatever was typed", () => {
    expect(parseTeamSize("individual", "5", "9")).toEqual({ ok: true, team_min: 1, team_max: 1 });
  });

  it("teams need whole numbers with 1 ≤ min ≤ max ≤ 20 and max at least 2", () => {
    expect(parseTeamSize("team", "2", "4")).toEqual({ ok: true, team_min: 2, team_max: 4 });
    expect(parseTeamSize("team", "1", "3")).toEqual({ ok: true, team_min: 1, team_max: 3 });
    expect(parseTeamSize("team", "5", "5")).toEqual({ ok: true, team_min: 5, team_max: 5 });
    const bad = (min: string, max: string) => {
      const r = parseTeamSize("team", min, max);
      return r.ok ? {} : r.errors;
    };
    expect(bad("4", "2").team_max).toMatch(/minimum/);
    expect(bad("0", "3").team_min).toBeDefined();
    expect(bad("2", "1").team_max).toBeDefined();
    expect(bad("2", "21").team_max).toBeDefined();
    expect(bad("2.5", "4").team_min).toBeDefined();
    expect(bad("", "").team_min).toBeDefined();
  });

  it("labels follow the choice", () => {
    expect(participationOf(1)).toBe("individual");
    expect(participationOf(4)).toBe("team");
    expect(teamSizeLabel(1, 1)).toBe("Individual");
    expect(teamSizeLabel(2, 4)).toBe("Teams of 2–4");
    const comp = { kind: "competition", capacity: 50, remaining: 3 };
    expect(seatsLabel({ ...comp, team_max: 1 })).toMatch(/3 places/);
    expect(seatsLabel({ ...comp, team_max: 4 })).toMatch(/3 team places/);
  });
});

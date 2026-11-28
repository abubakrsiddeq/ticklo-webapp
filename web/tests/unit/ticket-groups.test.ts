import { describe, expect, it } from "vitest";
import { defaultSessionTicketName, groupTicketTypes, sessionTickets, ticketGroupOf, ticketsTabLabel } from "@/lib/ticket-groups";

const t = (id: string, o: { all?: boolean; sessions?: string[]; team?: string | null } = {}) => ({
  id,
  all_sessions: o.all ?? false,
  session_ids: o.sessions ?? [],
  registration_for: o.team ?? null,
});

describe("festival tickets next to their session (D-087)", () => {
  it("puts each ticket in the group buyers see", () => {
    expect(ticketGroupOf(t("p", { all: true }))).toBe("pass");
    expect(ticketGroupOf(t("s", { sessions: ["dj"] }))).toBe("session");
    expect(ticketGroupOf(t("e"))).toBe("entry");
    expect(ticketGroupOf(t("c", { team: "Hackathon" }))).toBe("team");
  });

  it("orders groups pass → one event → entry → team, and session tickets by the session's start", () => {
    const groups = groupTicketTypes(
      [t("team", { team: "Hackathon" }), t("qawwali", { sessions: ["q"] }), t("entry"), t("dj", { sessions: ["d"] }), t("pass", { all: true })],
      ["d", "q"],
    );
    expect(groups.map((g) => g.key)).toEqual(["pass", "session", "entry", "team"]);
    expect(groups[1].types.map((x) => x.id)).toEqual(["dj", "qawwali"]);
  });

  it("leaves out empty groups", () => {
    expect(groupTicketTypes([t("pass", { all: true })]).map((g) => g.key)).toEqual(["pass"]);
  });

  it("edits a session's ticket in place only when it is the one ticket for that session alone", () => {
    expect(sessionTickets("dj", [t("pass", { all: true }), t("dj-t", { sessions: ["dj"] })]).own?.id).toBe("dj-t");
    // two prices for the same night: shown, changed on the tickets tab
    const two = sessionTickets("dj", [t("student", { sessions: ["dj"] }), t("general", { sessions: ["dj"] })]);
    expect(two.own).toBeNull();
    expect(two.all.map((x) => x.id)).toEqual(["student", "general"]);
    // one ticket for two nights is not "this session's own ticket"
    const shared = sessionTickets("dj", [t("both", { sessions: ["dj", "qawwali"] })]);
    expect(shared.own).toBeNull();
    expect(shared.all).toHaveLength(1);
    // passes and competition entries never count
    expect(sessionTickets("dj", [t("pass", { all: true, sessions: ["dj"] }), t("c", { team: "X", sessions: ["dj"] })]).all).toEqual([]);
  });

  it("names a new ticket after its session", () => {
    expect(defaultSessionTicketName("DJ Night")).toBe("DJ Night ticket");
    expect(defaultSessionTicketName("  Qawwali Night Ticket ")).toBe("Qawwali Night Ticket");
    expect(defaultSessionTicketName("")).toBe("");
    expect(defaultSessionTicketName("x".repeat(120))).toHaveLength(80);
  });

  it("calls the tickets tab Passes & tickets for festivals", () => {
    expect(ticketsTabLabel("festival")).toBe("Passes & tickets");
    expect(ticketsTabLabel("single")).toBe("Tickets");
    expect(ticketsTabLabel("competition")).toBe("Tickets");
  });
});

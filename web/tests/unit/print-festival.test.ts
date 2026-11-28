import { describe, expect, it } from "vitest";
import { cleanTexts, designSchema, fillPlaceholders, placeholderFallback, usedPlaceholders, withTexts, withoutTexts } from "@/lib/print/design";
import { TEMPLATES, cloneDesign, templateByKey } from "@/lib/print/templates";
import { printDateRange, printValues, scopeHeadline, ticketScope, type PrintSession } from "@/lib/print/values";

// D-079: festival tickets print what they get you in
const event = { name: "Aurex 2.0", venue: "Bahria University H-11 Campus", starts_at: "2026-11-30T19:00:00Z", ends_at: "2026-12-02T18:59:00Z", poster_url: "https://x/festival.jpg" };
const org = { name: "BKR Society", logo_url: null };
const sessions: PrintSession[] = [
  { id: "q", name: "Qawwali Night", kind: "concert", starts_at: "2026-12-02T15:00:00Z", ends_at: "2026-12-02T18:00:00Z", venue: "Main Lawn", poster_url: "https://x/qawwali.jpg", pass_access: true },
  { id: "m", name: "Mushaira", kind: "concert", starts_at: "2026-12-01T14:00:00Z", ends_at: "2026-12-01T16:00:00Z", venue: "", poster_url: null, pass_access: true },
  { id: "w", name: "AI Workshop", kind: "workshop", starts_at: "2026-12-01T05:00:00Z", ends_at: "2026-12-01T08:00:00Z", venue: "Lab 3", poster_url: null, pass_access: false },
];
const sufi = { name: "Sufi Night Ticket", price_paisa: 100000 };

describe("what a ticket type gets you in", () => {
  it("is the event itself outside festivals", () => {
    expect(ticketScope("single", { all_sessions: true, session_ids: [] }, sessions).kind).toBe("event");
  });
  it("tells session, combo, pass and entry tickets apart", () => {
    expect(ticketScope("festival", { all_sessions: false, session_ids: ["q"] }, sessions)).toMatchObject({ kind: "session", sessions: [{ id: "q" }] });
    expect(ticketScope("festival", { all_sessions: false, session_ids: ["q", "m"] }, sessions).sessions.map((s) => s.id)).toEqual(["m", "q"]);
    expect(ticketScope("festival", { all_sessions: true, session_ids: [] }, sessions).sessions.map((s) => s.id)).toEqual(["m", "q"]);
    expect(ticketScope("festival", { all_sessions: false, session_ids: [] }, sessions).kind).toBe("entry");
  });
});

describe("printed values (D-079)", () => {
  it("keeps a single event as before", () => {
    const v = printValues(event, org, sufi);
    expect(v).toMatchObject({ event_name: "Aurex 2.0", presents: "", festival: "", venue: event.venue, time: "12:00 AM", poster: "https://x/festival.jpg" });
  });

  it("prints the session on a one-session ticket", () => {
    const v = printValues(event, org, sufi, ticketScope("festival", { session_ids: ["q"] }, sessions));
    expect(v).toMatchObject({
      event_name: "Qawwali Night",
      presents: "AUREX 2.0 PRESENTS",
      festival: "Aurex 2.0",
      date: "Wed, 2 Dec 2026",
      time: "8:00 PM",
      day: "2",
      month: "DEC",
      weekday: "WED",
      venue: "Main Lawn",
      poster: "https://x/qawwali.jpg",
      ticket_type: "Sufi Night Ticket",
      price: "Rs 1,000",
    });
  });

  it("falls back to the festival venue and poster when the session has none", () => {
    const v = printValues(event, org, sufi, ticketScope("festival", { session_ids: ["m"] }, sessions));
    expect(v.venue).toBe(event.venue);
    expect(v.poster).toBe("https://x/festival.jpg");
  });

  it("prints the ticket's name and what it includes on a combo", () => {
    const v = printValues(event, org, { name: "Cultural Combo", price_paisa: 150000 }, ticketScope("festival", { session_ids: ["q", "m"] }, sessions));
    expect(v).toMatchObject({ event_name: "Cultural Combo", includes: "Mushaira, Qawwali Night", date: "1 – 2 Dec 2026", time: "7:00 PM", venue: event.venue });
  });

  it("prints the festival with its dates on a pass and an entry ticket", () => {
    const pass = printValues(event, org, { name: "All Access", price_paisa: 250000 }, ticketScope("festival", { all_sessions: true }, sessions));
    expect(pass).toMatchObject({ event_name: "Aurex 2.0", presents: "FESTIVAL PASS", date: "1 – 2 Dec 2026", time: "7:00 PM" });
    const entry = printValues(event, org, { name: "Gate", price_paisa: 30000 }, ticketScope("festival", { session_ids: [] }, sessions));
    expect(entry).toMatchObject({ event_name: "Aurex 2.0", presents: "ENTRY TICKET", time: "12:00 AM" });
  });

  it("writes day ranges", () => {
    expect(printDateRange("2026-12-01T05:00:00Z", "2026-12-01T09:00:00Z")).toBe("Tue, 1 Dec 2026");
    expect(printDateRange("2026-11-29T05:00:00Z", "2026-12-02T09:00:00Z")).toBe("29 Nov – 2 Dec 2026");
    expect(printDateRange("2026-12-30T05:00:00Z", "2027-01-02T09:00:00Z")).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  it("names the headline", () => {
    expect(scopeHeadline(event, sufi, { kind: "event", sessions: [] })).toBe("Aurex 2.0");
    expect(scopeHeadline(event, sufi, ticketScope("festival", { session_ids: ["q"] }, sessions))).toBe("Qawwali Night");
  });
});

describe("placeholder fallbacks", () => {
  it("prints the fallback when the value is empty", () => {
    expect(fillPlaceholders("{{presents|LIVE IN CONCERT}}", { presents: "" })).toBe("LIVE IN CONCERT");
    expect(fillPlaceholders("{{presents|LIVE IN CONCERT}}", {})).toBe("LIVE IN CONCERT");
    expect(fillPlaceholders("{{presents|LIVE IN CONCERT}}", { presents: "AUREX PRESENTS" })).toBe("AUREX PRESENTS");
    expect(fillPlaceholders("{{presents|}}", {})).toBe("");
  });
  it("fills placeholders inside a fallback", () => {
    expect(fillPlaceholders("{{presents|{{society}} PRESENTS}}", { society: "BKR" })).toBe("BKR PRESENTS");
    expect(fillPlaceholders("{{ presents |CLASS OF {{year}}}} · {{price}}", { year: "2026", price: "Rs 5" })).toBe("CLASS OF 2026 · Rs 5");
  });
  it("lists the placeholders a design uses", () => {
    const keys = usedPlaceholders(templateByKey("qawwali-royal")!.design);
    for (const k of ["event_name", "presents", "date", "time", "venue"]) expect(keys.has(k), k).toBe(true);
    expect(usedPlaceholders({ layers: [{ id: "k", type: "text", text: "{{presents|{{society}} PRESENTS}}", x: 0, y: 0, width: 10, fontSize: 10, fontFamily: "poppins-400", fill: "#000" }] }).has("society")).toBe(true);
  });
});

describe("templates show the festival line", () => {
  it("puts {{presents}} on every template's top line", () => {
    for (const t of TEMPLATES) {
      const kicker = t.design.layers.find((l) => l.id === "kicker");
      expect(kicker?.type === "text" && kicker.text.startsWith("{{presents|"), t.key).toBe(true);
      if (kicker?.type === "text") expect(kicker.fitHeight, t.key).toBeGreaterThan(0);
    }
  });
  it("keeps the template's own words outside festivals", () => {
    const sufiNight = templateByKey("qawwali-sufi")!.design.layers.find((l) => l.id === "kicker");
    expect(sufiNight?.type === "text" && fillPlaceholders(sufiNight.text, { presents: "" })).toBe("AN EVENING OF SUFI MUSIC");
  });
});

describe("organizer texts on the design (D-082)", () => {
  it("win over the event's values, empty ones are ignored", () => {
    expect(withTexts({ event_name: "Qawwali Night", venue: "Lawn" }, { event_name: "  Mehfil-e-Sama ", venue: " " })).toEqual({ event_name: "Mehfil-e-Sama", venue: "Lawn" });
    expect(withTexts({ event_name: "A" }, undefined)).toEqual({ event_name: "A" });
  });
  it("are kept by the schema and dropped for templates", () => {
    const d = { ...cloneDesign(templateByKey("qawwali-royal")!.design), texts: { event_name: "Mehfil" } };
    expect(designSchema.parse(d).texts).toEqual({ event_name: "Mehfil" });
    expect(designSchema.safeParse({ ...d, texts: { serial: "X" } }).success).toBe(false);
    expect("texts" in withoutTexts(d)).toBe(false);
  });
});

describe("What the ticket says (D-082)", () => {
  it("keeps only changed, trimmed texts", () => {
    expect(cleanTexts({ event_name: "  Mehfil ", venue: "", date: "   " })).toEqual({ event_name: "Mehfil" });
    expect(cleanTexts({})).toBeUndefined();
    expect(cleanTexts({ venue: "x".repeat(300) })?.venue).toHaveLength(200);
  });
  it("knows the words a template prints when a value is empty", () => {
    const d = templateByKey("qawwali-sufi")!.design;
    expect(placeholderFallback(d, "presents", {})).toBe("AN EVENING OF SUFI MUSIC");
    expect(placeholderFallback(d, "venue", {})).toBe("");
  });
});

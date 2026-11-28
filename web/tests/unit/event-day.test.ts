import { describe, expect, it } from "vitest";
import { eventDayWhatsAppLink, GUIDE_STEPS, MODE_TEXT } from "@/lib/event-day";
import { roleLabel } from "@/lib/roles";

describe("event day (D-086)", () => {
  it("builds a WhatsApp message for the right job with the link", () => {
    const gate = decodeURIComponent(eventDayWhatsAppLink("gate", "Qawwali Night", "https://ticklo.pk/scan/abc").replace("https://wa.me/?text=", ""));
    expect(gate).toContain("GATE");
    expect(gate).toContain("https://ticklo.pk/scan/abc");
    expect(gate).toContain("Start entry scanning");
    const desk = decodeURIComponent(eventDayWhatsAppLink("desk", "Qawwali Night", "https://ticklo.pk/sell/abc").replace("https://wa.me/?text=", ""));
    expect(desk).toContain("DESK");
    expect(desk).toContain("Sold");
  });

  it("has three steps per job and different words for gate and desk", () => {
    expect(GUIDE_STEPS.gate).toHaveLength(3);
    expect(GUIDE_STEPS.desk).toHaveLength(3);
    expect(MODE_TEXT.gate.place).not.toBe(MODE_TEXT.desk.place);
    expect(MODE_TEXT.desk.job).toContain("Nobody goes in");
  });

  it("calls the scanner role a gate volunteer", () => {
    expect(roleLabel("scanner")).toBe("Gate volunteer");
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("member")).toBe("Member");
  });
});

import { describe, expect, it } from "vitest";
import { eventSchema, ticketTypeSchema, cancelEventSchema } from "@/lib/validation/event";
import { paymentAccountSchema } from "@/lib/validation/payments";
import { signupSchema } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/profile";

const validEvent = {
  name: "Winter Gala",
  description: "",
  venue: "Sports Complex",
  starts_at: "2026-12-14T18:00",
  ends_at: "2026-12-14T23:00",
  capacity: "300",
  visibility: "public",
  max_tickets_per_order: "5",
};

describe("shared zod schemas (NFR-05)", () => {
  it("validates events, including end after start", () => {
    expect(eventSchema.safeParse(validEvent).success).toBe(true);
    const bad = eventSchema.safeParse({ ...validEvent, ends_at: "2026-12-14T17:00" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["ends_at"]);
    expect(eventSchema.safeParse({ ...validEvent, max_tickets_per_order: "50" }).success).toBe(false);
  });

  it("validates ticket types (price in rupees, 0 = free)", () => {
    const base = { name: "VIP", description: "", price: "2500", quantity: "100", sale_starts_at: "", sale_ends_at: "", requires_student_card: false };
    expect(ticketTypeSchema.safeParse(base).success).toBe(true);
    expect(ticketTypeSchema.safeParse({ ...base, price: "0" }).success).toBe(true);
    expect(ticketTypeSchema.safeParse({ ...base, price: "-5" }).success).toBe(false);
    expect(ticketTypeSchema.safeParse({ ...base, sale_starts_at: "2026-12-10T10:00", sale_ends_at: "2026-12-09T10:00" }).success).toBe(false);
  });

  it("requires typing CANCEL to cancel an event", () => {
    expect(cancelEventSchema.safeParse({ reason: "Venue unavailable", confirm: "CANCEL" }).success).toBe(true);
    expect(cancelEventSchema.safeParse({ reason: "Venue unavailable", confirm: "cancel" }).success).toBe(false);
  });

  it("validates payment accounts (bank name + IBAN format)", () => {
    const bank = { kind: "bank", bank_name: "Meezan Bank", account_title: "LUMS Music", account_number: "0211-0105678901", iban: "PK36MEZN0002110105678901" };
    expect(paymentAccountSchema.safeParse(bank).success).toBe(true);
    expect(paymentAccountSchema.safeParse({ ...bank, bank_name: "" }).success).toBe(false);
    expect(paymentAccountSchema.safeParse({ ...bank, iban: "GB00XXXX" }).success).toBe(false);
    expect(paymentAccountSchema.safeParse({ kind: "jazzcash", bank_name: "", account_title: "Ayesha", account_number: "03001234567", iban: "" }).success).toBe(true);
  });

  it("accepts any email at signup (AUTH-05) and checks the profile phone", () => {
    expect(signupSchema.safeParse({ full_name: "Ali Raza", email: "ali@gmail.com", password: "password1" }).success).toBe(true);
    expect(signupSchema.safeParse({ full_name: "Ali Raza", email: "ali@gmail.com", password: "short" }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: "Ali Raza", phone: "0300 1234567", university_id: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ full_name: "Ali Raza", phone: "123", university_id: "" }).success).toBe(false);
  });
});

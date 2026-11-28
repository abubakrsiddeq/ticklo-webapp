import { describe, expect, it } from "vitest";
import { contactSchema, topicLabel } from "@/lib/validation/contact";

const valid = {
  name: "Ali  Raza",
  email: "Ali@Gmail.com",
  phone: "",
  topic: "booking",
  message: "I paid for the Winter Gala but my ticket is not showing yet.",
  website: "",
};

describe("contact form", () => {
  it("accepts a normal message and cleans name and email", () => {
    const r = contactSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Ali Raza");
      expect(r.data.email).toBe("ali@gmail.com");
    }
  });

  it("phone is optional but must be a Pakistani mobile when given", () => {
    expect(contactSchema.safeParse({ ...valid, phone: "0300 1234567" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
  });

  it("rejects bad input", () => {
    expect(contactSchema.safeParse({ ...valid, email: "ali@gmail" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, name: "A1i" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, topic: "" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: "help" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: "x".repeat(2001) }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: `${valid.message}\u0007` }).success).toBe(false);
  });

  it("keeps new lines in the message", () => {
    const r = contactSchema.safeParse({ ...valid, message: `${valid.message}\nRef TL-ABC123` });
    expect(r.success).toBe(true);
  });

  it("labels topics", () => {
    expect(topicLabel("privacy")).toBe("Privacy or account deletion");
    expect(topicLabel("nope")).toBe("Something else");
  });
});

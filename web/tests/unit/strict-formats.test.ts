import { describe, expect, it } from "vitest";
import { checkAnswers, checkRegistration, memberPayload, registrationErrorSummary, repeatedMembers, teamPayload, DEFAULT_FORM, type FormField } from "@/lib/registration-form";
import { actionErrorMessage, FALLBACK_MESSAGE, NETWORK_MESSAGE, UPDATED_MESSAGE } from "@/lib/action-errors";
import { isEmail, isWebLink, normalizeLink, personNameProblem, teamNameProblem } from "@/lib/validation/common";
import { signupSchema } from "@/lib/validation/auth";
import { buyerDetailsSchema } from "@/lib/validation/profile";
import { paymentProofSchema } from "@/lib/validation/payments";
import { parseRegMembers } from "@/lib/validation/team";
import { optionalPhone, phoneInput } from "@/lib/phone";

const field = (id: string, type: FormField["type"], extra: Partial<FormField> = {}): FormField => ({ id, type, label: id, required: false, hidden: false, ...extra });

describe("strict formats (D-073)", () => {
  it("emails: name@domain.tld only", () => {
    for (const ok of ["ali@gmail.com", "a.b+c@uni.edu.pk", "x_y@sub.domain.io"]) expect(isEmail(ok)).toBe(true);
    for (const bad of ["ali@gmail", "ali gmail.com", "@gmail.com", "ali@.com", "ali..b@gmail.com", ".ali@gmail.com", "ali@gmail.c", "ali@gmail.com<script>"]) expect(isEmail(bad)).toBe(false);
  });

  it("links: http(s) with a real domain; a missing https:// is added", () => {
    expect(isWebLink("https://github.com/ali")).toBe(true);
    expect(isWebLink(normalizeLink("github.com/ali"))).toBe(true);
    for (const bad of ["https://abc", "javascript:alert(1)", "ftp://x.com", "https://user:pw@x.com", "https://exa mple.com", "hello", "https://x.123"]) {
      expect(isWebLink(normalizeLink(bad))).toBe(false);
    }
  });

  it("names: letters only, any script", () => {
    expect(personNameProblem("Ali Raza")).toBeNull();
    expect(personNameProblem("Muhammad bin Qasim-Khan")).toBeNull();
    expect(personNameProblem("علی رضا")).toBeNull();
    expect(personNameProblem("A")).not.toBeNull();
    expect(personNameProblem("Ali123")).not.toBeNull();
    expect(personNameProblem("<b>Ali</b>")).not.toBeNull();
    expect(personNameProblem("https://x.com")).not.toBeNull();
  });

  it("team names: letters or digits, no links", () => {
    expect(teamNameProblem("Code Warriors 2")).toBeNull();
    expect(teamNameProblem("!!")).not.toBeNull();
    expect(teamNameProblem("www.spam.com")).not.toBeNull();
    expect(teamNameProblem("x")).not.toBeNull();
  });

  it("phone typing keeps digits, + and spaces only; optional phones", () => {
    expect(phoneInput("0300-abc 1234567")).toBe("0300- 1234567");
    expect(optionalPhone("")).toBeNull();
    expect(optionalPhone("0300 1234567")).toBe("+923001234567");
    expect(optionalPhone("12")).toBe(false);
  });

  it("form answers: each type takes only its own format", () => {
    const fields = [field("e", "email"), field("p", "phone"), field("u", "url"), field("d", "date"), field("n", "number", { min: 1, max: 5 }), field("y", "yes_no"), field("m", "multi", { options: ["A", "B"] }), field("f", "file")];
    const e = checkAnswers(fields, { e: "ali@gmail", p: "+447700900123", u: "abc", d: "2026-02-31", n: "7", y: "maybe", m: ["A", "Z"], f: "../../etc/passwd" });
    expect(Object.keys(e).sort()).toEqual(["d", "e", "f", "m", "n", "p", "u", "y"]);
    const ok = checkAnswers(fields, { e: "ali@gmail.com", p: "0300 1234567", u: "github.com/ali", d: "2026-02-28", n: "3", y: "yes", m: ["A"], f: "0b8f4a52-1111-4222-8333-944455556666/cv.pdf" });
    expect(ok).toEqual({});
    expect(teamPayload(fields.slice(0, 3), { e: "Ali@Gmail.com", p: "0300 1234567", u: "github.com/ali" })).toEqual({ e: "ali@gmail.com", p: "+923001234567", u: "https://github.com/ali" });
  });

  it("a registration cannot list the same person twice", () => {
    const m = { name: "Ali Raza", phone: "0300 1234567", university: "LUMS" };
    const errs = checkRegistration(DEFAULT_FORM, [m, { ...m, name: "Sara Khan", phone: "+92 300 1234567" }], {}, "Team One");
    expect(errs["m1-phone"]).toBe("Same mobile number as member 1");
    expect(parseRegMembers([memberPayload(DEFAULT_FORM.member, m), memberPayload(DEFAULT_FORM.member, { ...m, name: "Sara Khan" })])).toMatchObject({ ok: false });
    expect(parseRegMembers([{ name: "Ali 007" }])).toMatchObject({ ok: false });
    expect(parseRegMembers([memberPayload(DEFAULT_FORM.member, m)])).toMatchObject({ ok: true });
  });

  it("D-074: a repeated roll number or identical details are caught, with which members repeat", () => {
    const form = { ...DEFAULT_FORM, member: DEFAULT_FORM.member.map((f) => (f.id === "roll_no" ? { ...f, hidden: false } : f)) };
    const a = { name: "Ali Raza", phone: "0300 1234567", email: "ali@gmail.com", roll_no: "21-CS-01", university: "LUMS" };
    // the lead copied into member 2: every detail the same
    const same = checkRegistration(form, [a, { ...a }], {}, "Team One");
    expect(same["m1-phone"]).toBe("Same mobile number as member 1");
    expect(registrationErrorSummary(same)).toBe("The same person is listed twice. Each member must be a different person.");
    expect(parseRegMembers([memberPayload(form.member, a), memberPayload(form.member, a)])).toEqual({
      ok: false,
      error: "Member 2 has the same mobile number as member 1. Each member must be a different person.",
    });
    // names only: identical entries
    expect(repeatedMembers([{ name: "Ali Khan" }, { name: "ali  khan " }])).toEqual([{ index: 1, of: 0, field: "name" }]);
    // same roll number at the same university (any case), not at another one
    expect(repeatedMembers([{ name: "A", roll_no: "21-cs-01", university: "LUMS" }, { name: "B", roll_no: "21-CS-01", university: "lums" }])[0]?.field).toBe("roll_no");
    expect(repeatedMembers([{ name: "A", roll_no: "21-CS-01", university: "LUMS" }, { name: "B", roll_no: "21-CS-01", university: "NUST" }])).toEqual([]);
    // two people may share a name
    expect(repeatedMembers([{ name: "Ali Khan", phone: "03001234567" }, { name: "Ali Khan", phone: "03007654321" }])).toEqual([]);
  });

  it("D-074: actions that could not run get a sentence people can act on", () => {
    expect(actionErrorMessage(new TypeError("Failed to fetch"))).toBe(NETWORK_MESSAGE);
    expect(actionErrorMessage(new Error('Server Action "abc" was not found on the server.'))).toBe(UPDATED_MESSAGE);
    expect(actionErrorMessage(new Error("An unexpected response was received from the server."))).toBe(FALLBACK_MESSAGE);
    expect(actionErrorMessage(new Error("boom"), "Check My tickets.")).toBe("Check My tickets.");
  });

  it("signup passwords need a letter and a number; buyer details are strict", () => {
    expect(signupSchema.safeParse({ full_name: "Ali Raza", email: "ali@gmail.com", password: "password1" }).success).toBe(true);
    expect(signupSchema.safeParse({ full_name: "Ali Raza", email: "ali@gmail.com", password: "password" }).success).toBe(false);
    expect(signupSchema.safeParse({ full_name: "Ali Raza", email: "ali@gmail.com", password: "12345678" }).success).toBe(false);
    expect(signupSchema.safeParse({ full_name: "Ali 123", email: "ali@gmail.com", password: "password1" }).success).toBe(false);
    expect(buyerDetailsSchema.safeParse({ full_name: "Ali Raza", phone: "+447700900123" }).success).toBe(false);
    expect(buyerDetailsSchema.safeParse({ full_name: "  Ali   Raza ", phone: "03001234567" }).data?.full_name).toBe("Ali Raza");
  });

  it("payment proof: transaction id and sender name", () => {
    expect(paymentProofSchema.safeParse({ transaction_id: "TID-12345", sender_name: "Ali Raza", payment_account_id: "" }).success).toBe(true);
    expect(paymentProofSchema.safeParse({ transaction_id: "<script>", sender_name: "Ali", payment_account_id: "" }).success).toBe(false);
    expect(paymentProofSchema.safeParse({ transaction_id: "12345", sender_name: "1234", payment_account_id: "" }).success).toBe(false);
    expect(paymentProofSchema.safeParse({ transaction_id: "12345", sender_name: "Ali", payment_account_id: "abc" }).success).toBe(false);
  });
});

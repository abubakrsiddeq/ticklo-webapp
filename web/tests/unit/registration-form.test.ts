import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM,
  DEFAULT_TICKET_FIELDS,
  FORM_TEMPLATES,
  TICKET_TEMPLATES,
  checkAnswers,
  checkForm,
  isShown,
  legacyTicketFields,
  memberPayload,
  memberToAnswers,
  mergeBuiltins,
  ticketFieldsOf,
  type FormField,
} from "@/lib/registration-form";

const exp: FormField = { id: "exp", type: "yes_no", label: "Done it before?", required: true, hidden: false };
const howMany: FormField = { id: "how", type: "number", label: "How many?", required: true, hidden: false, min: 1, max: 10, show_if: { field: "exp", equals: "yes" } };

describe("registration form (D-068)", () => {
  it("every template is a valid form", () => {
    for (const t of FORM_TEMPLATES) expect(checkForm(t.build())).toBeNull();
    expect(checkForm(DEFAULT_FORM)).toBeNull();
  });

  it("conditions show a field only for the chosen answer", () => {
    expect(isShown(howMany, { exp: "no" })).toBe(false);
    expect(isShown(howMany, { exp: "yes" })).toBe(true);
    expect(checkAnswers([exp, howMany], { exp: "no" })).toEqual({});
    expect(checkAnswers([exp, howMany], { exp: "yes" })).toEqual({ how: "Required" });
    expect(checkAnswers([exp, howMany], { exp: "yes", how: "20" }).how).toMatch(/Between/);
  });

  it("checks types and required built-ins", () => {
    const e = checkAnswers(DEFAULT_FORM.member, { name: "A", phone: "123", email: "x@" });
    expect(e).toMatchObject({ name: "Full name", phone: expect.any(String), university: "Required", email: "Check the email" });
    const url: FormField = { id: "gh", type: "url", label: "GitHub", required: false, hidden: false };
    expect(checkAnswers([url], { gh: "github.com/x" }).gh).toBeDefined();
  });

  it("built-in details go on the member, the rest into answers; hidden or not shown are dropped", () => {
    const fields = [...DEFAULT_FORM.member, exp, howMany];
    const p = memberPayload(fields, { name: " Sara ", phone: "0300 1234567", university: "LUMS", department: "CS", exp: "no", how: "3" });
    expect(p).toEqual({ name: "Sara", phone: "+923001234567", university: "LUMS", answers: { exp: "no" } });
    expect(memberToAnswers({ name: "Sara", phone: "+923001234567", answers: { exp: "no" } })).toEqual({ name: "Sara", phone: "+923001234567", exp: "no" });
  });

  it("finds problems in the form itself", () => {
    expect(checkForm({ member: DEFAULT_FORM.member.filter((f) => f.id !== "name"), team: [] })).toMatch(/Full name/);
    expect(checkForm({ member: [...DEFAULT_FORM.member, howMany, exp], team: [] })).toMatch(/earlier choice/);
    expect(checkForm({ member: [...DEFAULT_FORM.member, { id: "c", type: "select", label: "Committee", required: true, hidden: false, options: [] }], team: [] })).toMatch(/option/);
  });
});


describe("ticket forms (D-069)", () => {
  it("templates are valid ticket forms; the default asks nothing", () => {
    for (const t of TICKET_TEMPLATES) expect(checkForm({ member: t.build(), team: [] }, "ticket")).toBeNull();
    expect(DEFAULT_TICKET_FIELDS.every((f) => f.hidden)).toBe(true);
  });

  it("older settings become a form (name / university levels and session questions)", () => {
    const f = legacyTicketFields("required", "optional", [{ id: "q1", label: "Laptop?", type: "yes_no", required: true }]);
    expect(f.find((x) => x.id === "name")).toMatchObject({ required: true, hidden: false });
    expect(f.find((x) => x.id === "university")).toMatchObject({ required: false, hidden: false });
    expect(f.find((x) => x.id === "q1")).toMatchObject({ type: "yes_no", required: true });
    expect(ticketFieldsOf({ member: [] }, { names: "off" }).every((x) => x.hidden)).toBe(true);
  });

  it("built-ins are asked once, as strictly as the strictest form", () => {
    const a = legacyTicketFields("optional", "off");
    const b = legacyTicketFields("required", "required");
    const merged = mergeBuiltins([a, b]);
    expect(merged.map((x) => [x.id, x.required])).toEqual([
      ["name", true],
      ["university", true],
    ]);
  });
});

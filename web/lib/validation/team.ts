import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { emailField, hasControlChars, isEmail, personNameProblem, teamNameProblem } from "./common";

// ORG-03
export const inviteSchema = z.object({
  email: emailField,
  role: z.enum(["member", "scanner"]),
});

// D-068: competition registrations. Built-in details on the member, the organizer's
// other fields in answers. Postgres checks every answer against the form again.
const answerText = z.string().max(2000).refine((v) => !hasControlChars(v), "Remove the special characters");
export const regAnswersSchema = z.record(
  z.string().regex(/^[a-z0-9_]{1,40}$/),
  z.union([answerText, z.array(z.string().max(100)).max(20)]),
);

export const regMemberSchema = z
  .object({
    name: z.string().trim().max(80),
    phone: z.string().trim().max(20).optional(),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().max(120).refine((v) => isEmail(v, 120), "Check the email")]).optional(),
    roll_no: z.string().trim().max(40).optional(),
    university: z.string().trim().max(120).optional(),
    answers: regAnswersSchema.optional(),
  })
  .superRefine((m, ctx) => {
    const nameProblem = personNameProblem(m.name, 2, 80);
    if (nameProblem) ctx.addIssue({ code: "custom", path: ["name"], message: `${m.name || "A member"}: ${nameProblem.toLowerCase()}` });
    if (m.phone && !normalizePhone(m.phone)) ctx.addIssue({ code: "custom", path: ["phone"], message: `Check the mobile number of ${m.name}.` });
    for (const k of ["roll_no", "university"] as const) {
      if (m[k] && hasControlChars(m[k]!)) ctx.addIssue({ code: "custom", path: [k], message: `Check the details of ${m.name}.` });
    }
  });

/** Members as sent by the form → cleaned (phones as +92…, empty email dropped), or the first problem. */
export function parseRegMembers(input: unknown): { ok: true; members: z.output<typeof regMemberSchema>[] } | { ok: false; error: string } {
  const parsed = z.array(regMemberSchema).min(1, "Add your team members.").max(20, "At most 20 members.").safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Every member needs a name, and emails must be valid." };
  const members = parsed.data.map((m) => ({
    ...m,
    name: m.name.replace(/\s+/g, " "),
    phone: m.phone ? normalizePhone(m.phone)! : undefined,
    email: m.email || undefined,
  }));
  const seen = new Set<string>();
  for (const m of members) {
    for (const key of [m.phone && `p:${m.phone}`, m.email && `e:${m.email}`]) {
      if (!key) continue;
      if (seen.has(key)) return { ok: false, error: "The same person is listed twice (same mobile number or email)." };
      seen.add(key);
    }
  }
  return { ok: true, members };
}

/** Team name as typed ("" for one-person entries: Postgres uses the member's name, and requires one for teams). */
export function teamNameError(name: string): string | null {
  return name.trim() ? teamNameProblem(name) : null;
}

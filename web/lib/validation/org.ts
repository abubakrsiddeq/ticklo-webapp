import { z } from "zod";
import { normalizePhone, PHONE_HINT } from "@/lib/phone";
import { cleanText, isEmail, linkField, optionalText, personNameProblem, requiredText } from "./common";
import { checkOtherUniversity, universityFields } from "./university";

// ORG-01
const orgFields = z.object({
  name: cleanText(requiredText("Society name", 2, 120), "Society name")
    .refine((v) => /\p{L}/u.test(v), "Society name must contain letters")
    .refine((v) => !/[<>{}]|https?:\/\/|www\./i.test(v), "Society name cannot contain links or < > { }"),
  ...universityFields,
  type: z.enum(["society", "department"], { message: "Choose a type" }),
  about: cleanText(optionalText("About", 2000), "About"),
  instagram: linkField("Instagram link", { hosts: ["instagram.com"], example: "https://instagram.com/yoursociety" }),
  linkedin: linkField("LinkedIn link", {
    hosts: ["linkedin.com"],
    required: true,
    example: "https://www.linkedin.com/company/yoursociety",
  }),
  website: linkField("Website", { example: "https://yoursociety.pk" }),
});

/** Editing a society (head details are not part of this form). */
export const orgSchema = orgFields.superRefine(checkOtherUniversity);

// D-060: the society's president / chairperson / lead, for TickLO to verify.
// "self": name and email come from the account (the server ignores typed ones).
export const HEAD_ROLES = ["self", "other"] as const;

const headFields = {
  head_role: z.enum(HEAD_ROLES, { message: "Tell us who leads the society" }).optional(),
  head_name: z.string().trim().max(100, "Name must be at most 100 characters").optional(),
  head_phone: z.string().trim().max(30).optional(),
  head_email: z.string().trim().toLowerCase().max(254, "Email is too long").optional(),
};

type HeadValues = { head_role?: string; head_name?: string; head_phone?: string; head_email?: string };

function checkHead(v: HeadValues, ctx: z.RefinementCtx) {
  if (!v.head_role) {
    ctx.addIssue({ code: "custom", path: ["head_role"], message: "Tell us who leads the society" });
    return;
  }
  const nameProblem = personNameProblem(v.head_name ?? "", 2, 100);
  if (nameProblem) ctx.addIssue({ code: "custom", path: ["head_name"], message: nameProblem });
  if (!normalizePhone(v.head_phone ?? "")) {
    ctx.addIssue({ code: "custom", path: ["head_phone"], message: PHONE_HINT });
  }
  if (!isEmail(v.head_email ?? "")) {
    ctx.addIssue({ code: "custom", path: ["head_email"], message: "Enter a valid email address" });
  }
}

/** Registering a society: everything above plus the head's details (all required). */
export const orgCreateSchema = orgFields.extend(headFields).superRefine((v, ctx) => {
  checkOtherUniversity(v, ctx);
  checkHead(v, ctx);
});

export type OrgInput = z.input<typeof orgCreateSchema>;

/** D-061: changing the society head from Settings (owners). */
export const orgHeadSchema = z.object(headFields).superRefine(checkHead);
export type HeadInput = z.input<typeof orgHeadSchema>;

export function socialLinksFrom(input: Pick<z.output<typeof orgSchema>, "instagram" | "linkedin" | "website">) {
  const links: Record<string, string> = {};
  if (input.instagram) links.instagram = input.instagram;
  if (input.linkedin) links.linkedin = input.linkedin;
  if (input.website) links.website = input.website;
  return links;
}

// Client-side file checks (the server checks the real file bytes again).
export const MAX_ORG_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function checkOrgFile(file: File | null | undefined, opts: { label: string; allowPdf?: boolean; required?: boolean }): string | null {
  if (!file || file.size === 0) return opts.required ? `${opts.label} is required` : null;
  if (file.size > MAX_ORG_FILE_BYTES) return `${opts.label} must be 5 MB or smaller`;
  const ok = IMAGE_TYPES.includes(file.type) || (opts.allowPdf && file.type === "application/pdf");
  if (!ok) return `${opts.label} must be a JPG, PNG or WebP image${opts.allowPdf ? " or a PDF" : ""}`;
  return null;
}

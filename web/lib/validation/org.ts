import { z } from "zod";
import { cleanText, linkField, optionalText, requiredText } from "./common";
import { checkOtherUniversity, universityFields } from "./university";

// ORG-01
export const orgSchema = z
  .object({
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
  })
  .superRefine(checkOtherUniversity);

export type OrgInput = z.input<typeof orgSchema>;

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

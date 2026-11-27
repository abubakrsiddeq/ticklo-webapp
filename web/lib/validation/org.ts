import { z } from "zod";
import { optionalText, requiredText, urlOrEmpty } from "./common";
import { checkOtherUniversity, universityFields } from "./university";

// ORG-01
export const orgSchema = z
  .object({
    name: requiredText("Society name", 2, 120),
    ...universityFields,
    type: z.enum(["society", "department"]),
    about: optionalText("About", 2000),
    instagram: urlOrEmpty,
    facebook: urlOrEmpty,
    website: urlOrEmpty,
  })
  .superRefine(checkOtherUniversity);

export type OrgInput = z.infer<typeof orgSchema>;

export function socialLinksFrom(input: Pick<OrgInput, "instagram" | "facebook" | "website">) {
  const links: Record<string, string> = {};
  if (input.instagram) links.instagram = input.instagram;
  if (input.facebook) links.facebook = input.facebook;
  if (input.website) links.website = input.website;
  return links;
}

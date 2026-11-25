import { z } from "zod";
import { optionalText, requiredText, urlOrEmpty, uuidOrEmpty } from "./common";

// ORG-01
export const orgSchema = z.object({
  name: requiredText("Society name", 2, 120),
  university_id: uuidOrEmpty,
  type: z.enum(["society", "department"]),
  about: optionalText("About", 2000),
  instagram: urlOrEmpty,
  facebook: urlOrEmpty,
  website: urlOrEmpty,
});

export type OrgInput = z.infer<typeof orgSchema>;

export function socialLinksFrom(input: Pick<OrgInput, "instagram" | "facebook" | "website">) {
  const links: Record<string, string> = {};
  if (input.instagram) links.instagram = input.instagram;
  if (input.facebook) links.facebook = input.facebook;
  if (input.website) links.website = input.website;
  return links;
}

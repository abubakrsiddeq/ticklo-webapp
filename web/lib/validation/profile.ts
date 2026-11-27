import { z } from "zod";
import { phoneField, requiredText } from "./common";
import { checkOtherUniversity, universityFields } from "./university";

// AUTH-04: full name, phone, university (optional, from list or "other" – D-056), photo (optional)
export const profileSchema = z
  .object({
    full_name: requiredText("Full name", 2, 100),
    phone: phoneField,
    ...universityFields,
  })
  .superRefine(checkOtherUniversity);

// AUTH-06: name + phone collected at checkout when missing
export const buyerDetailsSchema = z.object({
  full_name: requiredText("Full name", 2, 100),
  phone: phoneField,
});

export type ProfileInput = z.infer<typeof profileSchema>;

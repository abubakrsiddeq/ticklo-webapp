import { z } from "zod";
import { phoneField, requiredText, uuidOrEmpty } from "./common";

// AUTH-04: full name, phone, university (optional, from list), photo (optional)
export const profileSchema = z.object({
  full_name: requiredText("Full name", 2, 100),
  phone: phoneField,
  university_id: uuidOrEmpty,
});

// AUTH-06: name + phone collected at checkout when missing
export const buyerDetailsSchema = z.object({
  full_name: requiredText("Full name", 2, 100),
  phone: phoneField,
});

export type ProfileInput = z.infer<typeof profileSchema>;

import { z } from "zod";
import { emailField, personName } from "./common";

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(200, "Wrong email or password"),
});

/** New passwords: 8–72 characters with at least one letter and one number. */
export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .refine((v) => v.trim().length === v.length, "Remove spaces from the start and end")
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), "Use at least one letter and one number");

export const signupSchema = z
  .object({
    full_name: personName(2, 100),
    email: emailField,
    password: passwordField,
  })
  .refine((v) => v.password.toLowerCase() !== v.email.toLowerCase(), { message: "Don't use your email as the password", path: ["password"] });

export const resetRequestSchema = z.object({ email: emailField });

export const newPasswordSchema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

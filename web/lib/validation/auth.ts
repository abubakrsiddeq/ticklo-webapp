import { z } from "zod";
import { emailField, requiredText } from "./common";

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password"),
});

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const signupSchema = z.object({
  full_name: requiredText("Full name", 2, 100),
  email: emailField,
  password: passwordField,
});

export const resetRequestSchema = z.object({ email: emailField });

export const newPasswordSchema = z
  .object({ password: passwordField, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

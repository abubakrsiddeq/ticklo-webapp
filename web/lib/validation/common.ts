import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { fromPKTInputValue } from "@/lib/format";

// Shared by client forms (react-hook-form) and server actions (same schema
// validated again on the server – NFR-05). Schemas keep input == output types
// (strings in, strings out); server code converts units afterwards.

export const uuidOrEmpty = z.union([z.literal(""), z.string().uuid("Choose an option from the list")]);

export const requiredText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export const emailField = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const phoneField = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, "Enter a valid mobile number, e.g. 0300 1234567");

export const pktDateTime = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => fromPKTInputValue(v) !== null, `${label} is required`);

export const optionalPktDateTime = z
  .string()
  .trim()
  .refine((v) => v === "" || fromPKTInputValue(v) !== null, "Invalid date/time");

export const urlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+/.test(v), "Enter a full link starting with https://");

/** Turn FormData into a plain object; `booleans` are checkbox names ("on" → true). */
export function formToObject(fd: FormData, booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  for (const b of booleans) {
    const v = fd.get(b);
    out[b] = v === "on" || v === "true" || v === "1";
  }
  return out;
}

/** zod issues → { field: firstMessage } for showing under inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

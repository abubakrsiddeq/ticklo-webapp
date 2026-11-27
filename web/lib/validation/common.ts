import { z } from "zod";
import { normalizePhone, PHONE_HINT } from "@/lib/phone";
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

// Email: name@domain.tld only (same pattern as zod and the database, D-073).
export const EMAIL_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9_'+.-]*[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;
export const isEmail = (v: string, max = 254) => v.length <= max && EMAIL_RE.test(v);

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .refine((v) => EMAIL_RE.test(v), "Enter a valid email address, e.g. name@gmail.com");

export const phoneField = z
  .string()
  .trim()
  .refine((v) => normalizePhone(v) !== null, PHONE_HINT);

/** "github.com/me" → "https://github.com/me" (a link typed without http). */
export function normalizeLink(v: string): string {
  const t = v.trim();
  return t && !/^[a-z][a-z0-9+.-]*:/i.test(t) ? `https://${t}` : t;
}

/** A web link: http(s), a real domain (letters after the last dot), no spaces or login part. */
export function isWebLink(v: string, max = 300): boolean {
  if (!v || v.length > max || /\s/.test(v)) return false;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname);
}

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
  .refine((v) => v === "" || isWebLink(v), "Enter a full link starting with https://");

// Control characters (except tab/newline) have no place in names or descriptions.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const hasControlChars = (v: string) => CONTROL_CHARS.test(v);

// A person's name: letters in any script (Urdu included), spaces and . ' - only.
const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/** Problem with a person's name, or null when it is fine (shared with the registration form builder). */
export function personNameProblem(raw: string, min = 2, max = 100): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < min) return `Enter the full name (at least ${min} letters)`;
  if (v.length > max) return `Name must be at most ${max} characters`;
  if (!PERSON_NAME.test(v)) return "Use letters only (no numbers or symbols)";
  return null;
}

/** A person's full name (signup, profile, buyer, society head). Extra spaces are collapsed. */
export const personName = (min = 2, max = 100) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .superRefine((v, ctx) => {
      const problem = personNameProblem(v, min, max);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    });

/** Problem with a team name, or null (letters or digits required, no links or < > { }). */
export function teamNameProblem(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < 2) return "Give your team a name (at least 2 characters)";
  if (v.length > 80) return "Team name must be at most 80 characters";
  if (!/[\p{L}\p{N}]/u.test(v)) return "Team name needs letters or numbers";
  if (CONTROL_CHARS.test(v) || /[<>{}]|https?:\/\/|www\./i.test(v)) return "Team name cannot contain links or < > { }";
  return null;
}

/** Text that must not carry control characters. */
export const cleanText = <T extends z.ZodString>(schema: T, label: string) =>
  schema.refine((v) => !CONTROL_CHARS.test(v), `${label} has characters that are not allowed`);

/**
 * A link to a profile or site. Adds https:// when it was left out, accepts only
 * http(s) links without a login part (user:pass@), and, when `hosts` is given,
 * only links on those sites (subdomains included, e.g. pk.linkedin.com).
 */
export function linkField(label: string, opts: { hosts?: string[]; required?: boolean; example?: string } = {}) {
  return z
    .string()
    .trim()
    .max(300, `${label} must be at most 300 characters`)
    .transform((v) => (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v))
    .superRefine((v, ctx) => {
      if (!v) {
        if (opts.required) ctx.addIssue({ code: "custom", message: `${label} is required` });
        return;
      }
      const bad = (message: string) => ctx.addIssue({ code: "custom", message });
      let url: URL;
      try {
        url = new URL(v);
      } catch {
        return bad(`Enter a full link, e.g. ${opts.example ?? "https://example.com"}`);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return bad("Only http:// or https:// links are allowed");
      if (url.username || url.password) return bad("Remove the login details from the link");
      const host = url.hostname.toLowerCase();
      if (!isWebLink(v)) return bad(`Enter a full link, e.g. ${opts.example ?? "https://example.com"}`);
      if (opts.hosts && !opts.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
        return bad(`Enter your ${label.replace(/ link$/i, "")} page link, e.g. ${opts.example}`);
      }
    });
}

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

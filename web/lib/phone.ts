// Mobile numbers are Pakistani only (D-073): stored as +92 followed by 10 digits,
// always a mobile (3XX XXXXXXX). Typed as 0300 1234567, +92 300 1234567, 92300…, 0092300….
export const PK_MOBILE = /^\+923\d{9}$/;
export const PHONE_HINT = "Enter a Pakistani mobile number, e.g. 0300 1234567 or +92 300 1234567";

export function normalizePhone(input: string): string | null {
  const raw = String(input ?? "").trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(raw)) return null;
  let digits: string | null = null;
  if (/^03\d{9}$/.test(raw)) digits = raw.slice(1);
  else if (/^\+923\d{9}$/.test(raw)) digits = raw.slice(3);
  else if (/^923\d{9}$/.test(raw)) digits = raw.slice(2);
  else if (/^00923\d{9}$/.test(raw)) digits = raw.slice(4);
  return digits ? `+92${digits}` : null;
}

/** Keep only what a phone number can contain while typing (digits, +, spaces, dashes). */
export function phoneInput(v: string): string {
  return v.replace(/[^\d+\s-]/g, "").slice(0, 16);
}

/** +923001234567 -> 0300 1234567 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+92(3\d{2})(\d{7})$/.exec(phone);
  return m ? `0${m[1]} ${m[2]}` : phone;
}

/** Digits for a wa.me link (0300… → 92300…). Empty when the number can't be used. */
export function whatsappNumber(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/[\s\-().+]/g, "");
  if (/^03\d{9}$/.test(digits)) return `92${digits.slice(1)}`;
  if (/^(00)?923\d{9}$/.test(digits)) return digits.replace(/^00/, "");
  if (/^[1-9]\d{7,14}$/.test(digits)) return digits;
  return "";
}

/** An optional mobile number from a form: null when empty, the +92… form when valid, false when invalid. */
export function optionalPhone(input: unknown): string | null | false {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  return normalizePhone(raw) ?? false;
}

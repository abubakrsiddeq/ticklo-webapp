// Pakistani mobile numbers are stored as +923XXXXXXXXX. Other international
// numbers are accepted as +<country><number>.

export function normalizePhone(input: string): string | null {
  const raw = input.replace(/[\s\-().]/g, "");
  if (/^03\d{9}$/.test(raw)) return `+92${raw.slice(1)}`;
  if (/^923\d{9}$/.test(raw)) return `+${raw}`;
  if (/^00923\d{9}$/.test(raw)) return `+${raw.slice(2)}`;
  if (/^\+923\d{9}$/.test(raw)) return raw;
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  return null;
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

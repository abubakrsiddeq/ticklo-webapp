import { formatTime } from "@/lib/format";

export interface ScanResponse {
  result: "ok" | "already_used" | "expired_code" | "wrong_event" | "invalid" | "not_found" | "cancelled" | "not_allowed";
  holder_name?: string;
  ticket_type?: string;
  requires_student_card?: boolean;
  checked_in_at?: string;
  serial?: string | null; // printed (paper) tickets – PRT-09
}

export interface ScanView {
  ok: boolean;
  title: string;
  subtitle?: string;
  name?: string;
  ticketType?: string;
  card?: boolean;
}

const withSerial = (r: ScanResponse) => (r.serial ? `${r.ticket_type ?? ""} · Printed ${r.serial}`.replace(/^ · /, "") : r.ticket_type);

/** SCN-04 wording. "expired_code" only happens for legacy rotating (T1) tokens. */
export function describeScan(r: ScanResponse): ScanView {
  switch (r.result) {
    case "ok":
      return { ok: true, title: "Entry OK", name: r.holder_name, ticketType: withSerial(r), card: r.requires_student_card };
    case "already_used":
      return {
        ok: false,
        title: `Already used${r.checked_in_at ? ` at ${formatTime(r.checked_in_at)}` : ""}`,
        name: r.holder_name,
        ticketType: withSerial(r),
        subtitle: r.serial ? "This paper ticket was scanned before – it may be a copy." : "This ticket was checked in before.",
      };
    case "expired_code":
      return { ok: false, title: "Not valid here", subtitle: "QR code expired – ask for the live ticket screen, not a screenshot." };
    case "wrong_event":
      return { ok: false, title: "Not valid here", subtitle: "This ticket is for a different event." };
    case "cancelled":
      return { ok: false, title: "Invalid", subtitle: r.serial ? `Paper ticket ${r.serial} was voided (lost or stolen).` : "This ticket is cancelled." };
    case "not_allowed":
      return { ok: false, title: "Not allowed", subtitle: "You are not a scanner for this event right now." };
    default:
      return { ok: false, title: "Invalid", subtitle: "Not a TickLO ticket, or the code is damaged." };
  }
}

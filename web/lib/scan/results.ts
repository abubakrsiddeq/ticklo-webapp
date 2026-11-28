import { formatTime } from "@/lib/format";

export interface ScanResponse {
  result: "ok" | "already_used" | "expired_code" | "wrong_event" | "invalid" | "not_found" | "cancelled" | "not_allowed" | "not_sold" | "wrong_session";
  holder_name?: string;
  ticket_type?: string;
  requires_student_card?: boolean;
  checked_in_at?: string;
  serial?: string | null; // printed (paper) tickets – PRT-09
  returned?: boolean; // printed ticket given back unsold (D-041)
  ticket_id?: string;
  gate_sold?: boolean; // this scan counted an unsold paper ticket as sold (D-042)
  sale_price_paisa?: number | null;
  session?: string; // festival session name (D-044)
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
      return { ok: true, title: r.session ? `OK – ${r.session}` : "Entry OK", name: r.holder_name, ticketType: withSerial(r), card: r.requires_student_card };
    case "wrong_session":
      return {
        ok: false,
        title: "Not for this session",
        name: r.holder_name,
        ticketType: withSerial(r),
        subtitle: `This ticket does not open ${r.session ?? "this session"}.`,
      };
    case "already_used":
      return {
        ok: false,
        title: `Already used${r.checked_in_at ? ` at ${formatTime(r.checked_in_at)}` : ""}`,
        name: r.holder_name,
        ticketType: withSerial(r),
        subtitle: r.session
          ? `Already checked in to ${r.session}.`
          : r.serial
            ? "This paper ticket was scanned before – it may be a copy."
            : "This ticket was checked in before.",
      };
    case "expired_code":
      return { ok: false, title: "Not valid here", subtitle: "QR code expired – ask for the live ticket screen, not a screenshot." };
    case "wrong_event":
      return { ok: false, title: "Not valid here", subtitle: "This ticket is for a different event." };
    case "cancelled":
      return {
        ok: false,
        title: "Invalid",
        subtitle: r.serial
          ? r.returned
            ? `Paper ticket ${r.serial} was returned unsold – it is not valid.`
            : `Paper ticket ${r.serial} was voided (lost or stolen).`
          : "This ticket is cancelled.",
      };
    case "not_sold":
      return { ok: false, title: "Not sold", subtitle: `Paper ticket ${r.serial ?? ""} was never sold. Send the guest to the ticket desk or seller.` };
    case "not_allowed":
      return { ok: false, title: "Not allowed", subtitle: r.session ? "You can't scan this session." : "You are not a gate volunteer for this event right now." };
    default:
      return { ok: false, title: "Invalid", subtitle: "Not a TickLO ticket, or the code is damaged." };
  }
}

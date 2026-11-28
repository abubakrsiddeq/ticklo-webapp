// Map database/Supabase errors to messages people can act on.
// SQL functions raise "TL:<CODE>" with a human sentence in DETAIL.

const FRIENDLY: Record<string, string> = {
  NOT_AUTHENTICATED: "Please log in to continue.",
  SUSPENDED: "Your account is suspended. Contact TickLO support.",
  FORBIDDEN: "You are not allowed to do that.",
  NOT_FOUND: "We could not find that.",
  PROFILE_INCOMPLETE: "Please add your full name and phone number first.",
  EVENT_NOT_ON_SALE: "Tickets for this event are not on sale.",
  EVENT_CANCELLED: "This event has been cancelled.",
  SALE_NOT_STARTED: "Ticket sale has not started yet.",
  SALE_CLOSED: "Ticket sale is closed.",
  SOLD_OUT: "Sorry, not enough tickets are left.",
  MAX_PER_ORDER: "You chose more tickets than allowed in one order.",
  INVALID_ITEMS: "Please choose your tickets again.",
  ORDER_EXPIRED: "Your 60 minute hold has ended. Please book again.",
  INVALID_STATE: "This action is not possible right now. Refresh the page and try again.",
  PROOF_REQUIRED: "Please fill in all payment details.",
  CARD_REQUIRED: "Please upload a photo of your student card.",
  INVALID_ACCOUNT: "Please choose one of the payment accounts shown.",
  REASON_REQUIRED: "Please give a reason.",
  SLUG_TAKEN: "That link is already taken. Try another name.",
  TOO_MANY_PENDING: "You already have societies waiting for approval.",
  ORG_NOT_APPROVED: "Your society must be approved by TickLO first.",
  EVENT_IN_PAST: "The event start time must be in the future.",
  NO_TICKET_TYPES: "Add at least one ticket type first.",
  NO_PAYMENT_ACCOUNT: "Select at least one payment account for paid tickets.",
  CAPACITY_EXCEEDED: "Ticket quantities cannot be more than the event capacity.",
  PRICE_LOCKED: "Price and student-card requirement cannot change after the first booking.",
  QUANTITY_TOO_LOW: "Quantity cannot go below the tickets already sold or on hold.",
  HAS_BOOKINGS: "This ticket type already has bookings and cannot be deleted.",
  ALREADY_MEMBER: "This person is already in your team.",
  INVITE_INVALID: "This invite link is no longer valid.",
  INVITE_EMAIL_MISMATCH: "This invite was sent to a different email address.",
  NOT_A_MEMBER: "This person is not in your team.",
  CANNOT_CHANGE_OWNER: "The owner cannot be changed or removed.",
  INVALID_ROLE: "Please choose a valid role.",
  INVALID_EMAIL: "Please enter a valid email address.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  INVALID_DESIGN: "The ticket design is missing the QR code or the TickLO logo.",
  SETTLED: "This seller's account is closed. Reopen it first.",
  INVALID_CODE: "This code is not valid for this event.",
  OWN_CODE: "You cannot use your own ambassador code.",
  CODE_TAKEN: "This code is already used for this event. Try another one.",
  APPLICATIONS_CLOSED: "This event is not taking ambassador applications.",
  ALREADY_APPLIED: "You have already applied for this event.",
  ALREADY_AMBASSADOR: "You are already an ambassador for this event.",
  ANSWERS_REQUIRED: "Please answer the organizer's questions.",
  ACCESS_LOCKED: "Tickets are already sold – you can give more access, not less.",
  ALREADY_REGISTERED: "You have already registered a team for this competition.",
  INVALID_UNIVERSITY: "Enter your university's full name and city.",
  INVALID_HEAD: "Check the society head's name, phone and email.",
  ATTENDEE_REQUIRED: "Fill in the details for every ticket.",
  MEMBER_TAKEN: "One of these people is already in another team for this competition.",
  INVALID_FORM: "The registration form is not valid.",
  FORM_LOCKED: "People have registered, so this change is not allowed.",
  NO_SESSIONS: "Add the sessions or the competition before sending the event for review.",
  ORG_SUSPENDED: "This society is suspended. Contact TickLO support.",
  SALES_PAUSED: "Ticket sales for this event are paused for now.",
  CONFIRM_MISMATCH: "Type the name exactly to confirm.",
};

interface ErrorLike {
  message?: string;
  details?: string | null;
  detail?: string | null;
  code?: string;
}

export function errorCode(error: unknown): string | null {
  const msg = (error as ErrorLike)?.message ?? "";
  const m = /TL:([A-Z_]+)/.exec(msg);
  return m ? m[1] : null;
}

/** A sentence safe to show to the user. Never leaks SQL or stack traces. */
export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const e = error as ErrorLike;
  const code = errorCode(e);
  if (code) {
    const detail = e.details ?? e.detail;
    return detail && detail.length < 300 ? detail : (FRIENDLY[code] ?? fallback);
  }
  if (e.code === "23505") return "That already exists.";
  if (e.code === "42501") return FRIENDLY.FORBIDDEN;
  if (e.message && /Failed to fetch|fetch failed|network/i.test(e.message)) {
    return "Network problem. Check your internet and try again.";
  }
  return fallback;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

export const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
export const fail = (error: unknown, fieldErrors?: Record<string, string>): ActionResult<never> => ({
  ok: false,
  error: friendlyError(error),
  fieldErrors,
});

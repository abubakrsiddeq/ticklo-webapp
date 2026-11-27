// Decision history (D-076): which audit-log actions count as accept / reject
// decisions, how they are labelled, and which reason goes with them.

export type DecisionKind = "societies" | "events" | "payments" | "teams" | "ambassadors" | "universities" | "disputes" | "users";
/** approved / rejected = a decision; step = what happened in between (registered, resubmitted). */
export type DecisionOutcome = "approved" | "rejected" | "step";

export interface DecisionAction {
  kind: DecisionKind;
  label: string;
  outcome: DecisionOutcome;
}

export const DECISION_KINDS: { key: DecisionKind; label: string; singular: string }[] = [
  { key: "societies", label: "Societies", singular: "Society" },
  { key: "events", label: "Events", singular: "Event" },
  { key: "payments", label: "Payments", singular: "Payment" },
  { key: "teams", label: "Team registrations", singular: "Team" },
  { key: "ambassadors", label: "Ambassadors", singular: "Ambassador" },
  { key: "universities", label: "Universities", singular: "University" },
  { key: "disputes", label: "Disputes", singular: "Dispute" },
  { key: "users", label: "Users", singular: "User" },
];

export const DECISION_ACTIONS: Record<string, DecisionAction> = {
  "org.register": { kind: "societies", label: "Registered", outcome: "step" },
  "org.resubmit": { kind: "societies", label: "Resubmitted", outcome: "step" },
  "org.approve": { kind: "societies", label: "Approved", outcome: "approved" },
  "org.reject": { kind: "societies", label: "Rejected", outcome: "rejected" },
  "event.submit": { kind: "events", label: "Sent for review", outcome: "step" },
  "event.approve": { kind: "events", label: "Approved", outcome: "approved" },
  "event.reject": { kind: "events", label: "Rejected", outcome: "rejected" },
  "event.cancel": { kind: "events", label: "Cancelled", outcome: "rejected" },
  "order.approve": { kind: "payments", label: "Approved", outcome: "approved" },
  "order.reject": { kind: "payments", label: "Rejected", outcome: "rejected" },
  "order.cancel_by_buyer": { kind: "payments", label: "Cancelled by buyer", outcome: "step" },
  "team.approve": { kind: "teams", label: "Approved", outcome: "approved" },
  "team.reject": { kind: "teams", label: "Rejected", outcome: "rejected" },
  "ambassador.approve": { kind: "ambassadors", label: "Approved", outcome: "approved" },
  "ambassador.reject": { kind: "ambassadors", label: "Rejected", outcome: "rejected" },
  "university.request": { kind: "universities", label: "Requested", outcome: "step" },
  "university.approve": { kind: "universities", label: "Approved", outcome: "approved" },
  "university.merge": { kind: "universities", label: "Merged", outcome: "rejected" },
  "university.delete": { kind: "universities", label: "Deleted", outcome: "rejected" },
  "dispute.resolve": { kind: "disputes", label: "Resolved", outcome: "approved" },
  "user.suspend": { kind: "users", label: "Suspended", outcome: "rejected" },
  "user.restore": { kind: "users", label: "Restored", outcome: "approved" },
};

export type ResultFilter = "all" | "approved" | "rejected";

/** The audit actions to show for a kind (or every kind) and result filter. */
export function decisionActions(kind: DecisionKind | null, result: ResultFilter): string[] {
  return Object.entries(DECISION_ACTIONS)
    .filter(([, a]) => (kind ? a.kind === kind : true) && (result === "all" ? true : a.outcome === result))
    .map(([action]) => action);
}

export const parseKind = (v: string | undefined): DecisionKind | null =>
  DECISION_KINDS.some((k) => k.key === v) ? (v as DecisionKind) : null;

export const parseResult = (v: string | undefined): ResultFilter => (v === "approved" || v === "rejected" ? v : "all");

type Details = Record<string, unknown> | null | undefined;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The reason written down with a decision, when there is one. */
export function decisionReason(details: Details): string | null {
  if (!details) return null;
  return str(details.note) ?? str(details.reason) ?? str(details.previous_note) ?? null;
}

/** Text of the reason line: a resubmission shows the reason it was rejected for. */
export function reasonLabel(action: string): string {
  return action === "org.resubmit" ? "Was rejected for" : action === "dispute.resolve" ? "Note" : "Reason";
}

/** Strip characters that would break a PostgREST `or=(...)` filter. */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[%*,()\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// D-077: what organizers see about their own society (no universities, disputes or users).
export const ORG_DECISION_KINDS: DecisionKind[] = ["societies", "events", "payments", "teams", "ambassadors"];

/** Audit actions for the organizer history; an event's history leaves out the society itself. */
export function orgDecisionActions(kind: DecisionKind | null, result: ResultFilter, forEvent = false): string[] {
  const kinds = ORG_DECISION_KINDS.filter((k) => !(forEvent && k === "societies"));
  const chosen = kind && kinds.includes(kind) ? [kind] : kinds;
  return chosen.flatMap((k) => decisionActions(k, result));
}

// D-078: wording for the student's own history.
export const STUDENT_LABELS: Record<string, string> = {
  "order.approve": "Payment approved",
  "order.reject": "Payment not approved",
  "order.cancel_by_buyer": "Booking cancelled",
  "dispute.resolve": "Report answered",
  "team.approve": "Team accepted",
  "team.reject": "Team not accepted",
  "ambassador.approve": "Application accepted",
  "ambassador.reject": "Application not accepted",
};

/** Text of the reason line on the student's history. */
export function studentReasonLabel(action: string): string {
  return action === "dispute.resolve" ? "TickLO's note" : "Reason";
}

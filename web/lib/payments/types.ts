/**
 * Payment providers.
 *
 * v1 has exactly one provider: "manual" – the student transfers money to the
 * society's own bank account or wallet, uploads a screenshot, and an organizer
 * approves it. Money never passes through TickLO.
 *
 * The order state machine lives in Postgres and does not depend on the
 * provider:
 *
 *   awaiting_payment ──(proof)──► under_review ──(approve)──► approved ──► tickets
 *        │ 60 min                    │ reject
 *        ▼                           ▼
 *     expired                     rejected ──(new proof)──► under_review
 *
 * An online gateway added later (cards, JazzCash/Easypaisa APIs) plugs in as a
 * second provider: it would create the order the same way (create_order) and,
 * instead of "screenshot + organizer approval", confirm payment from the
 * gateway's webhook by calling a service-role SQL function that marks the
 * order approved and issues tickets (same issue_tickets()).
 */
export type PaymentProviderId = "manual";

export interface ProofSubmission {
  userId: string;
  orderId: string;
  form: FormData;
}

export type ProofResult =
  | { ok: true; possibleDuplicate: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export interface PaymentProvider {
  id: PaymentProviderId;
  /** Student submits evidence of payment for an order. */
  submitProof(input: ProofSubmission): Promise<ProofResult>;
}

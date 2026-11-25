import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl, dashboardEventPath, dashboardPath, eventPath } from "@/lib/site";
import { formatDateTime, formatEventRange, formatPKR } from "@/lib/format";
import { sendEmail, sendEmails, type EmailMessage } from "@/lib/emails/send";
import { accountLabel } from "@/lib/payments/accounts";
import PaymentInstructionsEmail from "@/emails/payment-instructions";
import OrderConfirmedEmail from "@/emails/order-confirmed";
import PaymentRejectedEmail from "@/emails/payment-rejected";
import NewProofEmail from "@/emails/new-proof";
import EventCancelledEmail from "@/emails/event-cancelled";
import ReviewDecisionEmail from "@/emails/review-decision";
import TeamInviteEmail from "@/emails/team-invite";
import EventReminderEmail from "@/emails/event-reminder";

// High-level notifications. Each loads what it needs with the service role
// (after the caller has already done the permission check) and never throws.

async function loadOrder(orderId: string) {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      `id, ref_code, status, total_paisa, ticket_count, requires_student_card, hold_expires_at,
       buyer_name, buyer_email, reject_reason, event_id,
       events!inner ( id, name, slug, venue, starts_at, ends_at, org_id, organizations!inner ( name, slug ) )`,
    )
    .eq("id", orderId)
    .maybeSingle();
  return data;
}

const firstName = (name: string | null | undefined) => (name ?? "there").split(" ")[0] || "there";

/** EML-02 */
export async function notifyPaymentInstructions(orderId: string) {
  try {
    const order = await loadOrder(orderId);
    if (!order?.buyer_email || order.status !== "awaiting_payment") return;
    const { data: links } = await createAdminClient()
      .from("event_payment_accounts")
      .select("payment_accounts!inner ( kind, bank_name, account_title, account_number, iban, is_active )")
      .eq("event_id", order.event_id);
    const accounts = (links ?? [])
      .map((l) => l.payment_accounts)
      .filter((a) => a.is_active)
      .map((a) => ({ label: accountLabel(a), title: a.account_title, number: a.account_number, iban: a.iban }));
    await sendEmail({
      to: order.buyer_email,
      subject: `Pay ${formatPKR(order.total_paisa)} for ${order.events.name} – ${order.ref_code}`,
      template: "payment-instructions",
      related: { type: "order", id: order.id },
      react: PaymentInstructionsEmail({
        name: firstName(order.buyer_name),
        eventName: order.events.name,
        eventDate: formatEventRange(order.events.starts_at, order.events.ends_at),
        refCode: order.ref_code,
        amount: formatPKR(order.total_paisa),
        holdEndsAt: order.hold_expires_at ? formatDateTime(order.hold_expires_at) + " PKT" : "60 minutes from booking",
        accounts,
        checkoutUrl: absoluteUrl(`/checkout/${order.id}`),
        requiresCard: order.requires_student_card,
      }),
    });
  } catch (e) {
    console.error("notifyPaymentInstructions failed", e);
  }
}

/** EML-03 (also used for free tickets) */
export async function notifyOrderConfirmed(orderId: string) {
  try {
    const order = await loadOrder(orderId);
    if (!order?.buyer_email || order.status !== "approved") return;
    await sendEmail({
      to: order.buyer_email,
      subject: `Your tickets for ${order.events.name} are ready`,
      template: "order-confirmed",
      related: { type: "order", id: order.id },
      react: OrderConfirmedEmail({
        name: firstName(order.buyer_name),
        eventName: order.events.name,
        eventDate: formatEventRange(order.events.starts_at, order.events.ends_at),
        venue: order.events.venue,
        refCode: order.ref_code,
        ticketCount: order.ticket_count,
        ticketsUrl: absoluteUrl("/me/tickets"),
        requiresCard: order.requires_student_card,
      }),
    });
  } catch (e) {
    console.error("notifyOrderConfirmed failed", e);
  }
}

/** EML-06 */
export async function notifyPaymentRejected(orderId: string) {
  try {
    const order = await loadOrder(orderId);
    if (!order?.buyer_email || order.status !== "rejected") return;
    await sendEmail({
      to: order.buyer_email,
      subject: `Payment for ${order.events.name} was not approved`,
      template: "payment-rejected",
      related: { type: "order", id: order.id },
      react: PaymentRejectedEmail({
        name: firstName(order.buyer_name),
        eventName: order.events.name,
        refCode: order.ref_code,
        reason: order.reject_reason ?? "Not given",
        retryUrl: absoluteUrl(`/checkout/${order.id}`),
      }),
    });
  } catch (e) {
    console.error("notifyPaymentRejected failed", e);
  }
}

/** EML-08 – goes to the society owner (free Resend plan: 100 emails/day). */
export async function notifyNewProof(orderId: string, possibleDuplicate: boolean) {
  try {
    const order = await loadOrder(orderId);
    if (!order) return;
    const admin = createAdminClient();
    const { data: owner } = await admin
      .from("organization_members")
      .select("profiles!inner ( email, full_name )")
      .eq("org_id", order.events.org_id)
      .eq("role", "owner")
      .maybeSingle();
    const to = owner?.profiles.email;
    if (!to) return;
    await sendEmail({
      to,
      subject: `${possibleDuplicate ? "⚠ " : ""}New payment to review – ${order.ref_code}`,
      template: "new-proof",
      related: { type: "order", id: order.id },
      react: NewProofEmail({
        name: firstName(owner.profiles.full_name),
        eventName: order.events.name,
        refCode: order.ref_code,
        amount: formatPKR(order.total_paisa),
        buyerName: order.buyer_name,
        possibleDuplicate,
        reviewUrl: absoluteUrl(`${dashboardEventPath(order.events.organizations.slug, order.events.slug)}/payments`),
      }),
    });
  } catch (e) {
    console.error("notifyNewProof failed", e);
  }
}

/** EML-05 */
export async function notifyEventCancelled(
  eventId: string,
  recipients: { email: string; name: string }[],
  reason: string,
) {
  try {
    const { data: event } = await createAdminClient()
      .from("events")
      .select("id, name, starts_at, ends_at, organizations!inner ( id, name )")
      .eq("id", eventId)
      .maybeSingle();
    if (!event) return;
    const unique = new Map(recipients.filter((r) => r.email).map((r) => [r.email.toLowerCase(), r]));
    const messages: EmailMessage[] = [...unique.values()].map((r) => ({
      to: r.email,
      subject: `Cancelled: ${event.name}`,
      template: "event-cancelled",
      related: { type: "event", id: event.id },
      react: EventCancelledEmail({
        name: firstName(r.name),
        eventName: event.name,
        eventDate: formatEventRange(event.starts_at, event.ends_at),
        orgName: event.organizations.name,
        reason,
      }),
    }));
    await sendEmails(messages);
  } catch (e) {
    console.error("notifyEventCancelled failed", e);
  }
}

/** EML-07 */
export async function notifyReviewDecision(input: {
  kind: "society" | "event";
  ownerEmail: string | null;
  ownerName: string | null;
  subjectName: string;
  approved: boolean;
  note: string | null;
  orgSlug: string;
  eventSlug?: string;
}) {
  if (!input.ownerEmail) return;
  const url =
    input.kind === "event" && input.approved && input.eventSlug
      ? absoluteUrl(eventPath(input.orgSlug, input.eventSlug))
      : input.kind === "event" && input.eventSlug
        ? absoluteUrl(`${dashboardEventPath(input.orgSlug, input.eventSlug)}/edit`)
        : absoluteUrl(dashboardPath(input.orgSlug));
  await sendEmail({
    to: input.ownerEmail,
    subject:
      input.kind === "society"
        ? `${input.subjectName} ${input.approved ? "is approved on TickLO" : "was not approved"}`
        : `Event ${input.approved ? "approved" : "not approved"}: ${input.subjectName}`,
    template: "review-decision",
    related: { type: input.kind, id: input.subjectName },
    react: ReviewDecisionEmail({
      kind: input.kind,
      name: firstName(input.ownerName),
      subjectName: input.subjectName,
      approved: input.approved,
      note: input.note,
      url,
    }),
  });
}

/** EML-09 */
export async function notifyTeamInvite(input: {
  email: string;
  orgName: string;
  role: "member" | "scanner";
  inviterName: string;
  token: string;
}) {
  await sendEmail({
    to: input.email,
    subject: `${input.inviterName} invited you to ${input.orgName} on TickLO`,
    template: "team-invite",
    related: { type: "invite", id: input.token.slice(0, 8) },
    react: TeamInviteEmail({
      orgName: input.orgName,
      role: input.role,
      inviterName: input.inviterName,
      acceptUrl: absoluteUrl(`/invite/${input.token}`),
    }),
  });
}

/** EML-04 – called by the reminders cron endpoint. Returns emails sent. */
export async function sendDueEventReminders(): Promise<{ events: number; emails: number }> {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("events_due_for_reminder");
  if (error) throw error;
  let emails = 0;
  for (const { event_id } of due ?? []) {
    // Mark first so a crash halfway never sends the same reminder twice.
    const { data: claimed } = await admin
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", event_id)
      .is("reminder_sent_at", null)
      .select("id, name, venue, starts_at, ends_at")
      .maybeSingle();
    if (!claimed) continue;
    const { data: orders } = await admin
      .from("orders")
      .select("buyer_email, buyer_name, requires_student_card")
      .eq("event_id", event_id)
      .eq("status", "approved");
    const byEmail = new Map<string, { name: string; card: boolean }>();
    for (const o of orders ?? []) {
      if (!o.buyer_email) continue;
      const prev = byEmail.get(o.buyer_email.toLowerCase());
      byEmail.set(o.buyer_email.toLowerCase(), {
        name: o.buyer_name,
        card: (prev?.card ?? false) || o.requires_student_card,
      });
    }
    emails += await sendEmails(
      [...byEmail.entries()].map(([email, info]) => ({
        to: email,
        subject: `Tomorrow: ${claimed.name}`,
        template: "event-reminder",
        related: { type: "event", id: claimed.id },
        react: EventReminderEmail({
          name: firstName(info.name),
          eventName: claimed.name,
          eventDate: formatEventRange(claimed.starts_at, claimed.ends_at),
          venue: claimed.venue,
          ticketsUrl: absoluteUrl("/me/tickets"),
          requiresCard: info.card,
        }),
      })),
    );
  }
  return { events: due?.length ?? 0, emails };
}

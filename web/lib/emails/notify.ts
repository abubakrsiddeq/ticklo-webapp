import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl, dashboardEventPath, dashboardPath, eventPath } from "@/lib/site";
import { formatDateTime, formatEventRange, formatPKR } from "@/lib/format";
import { sendEmail, sendEmails, type EmailMessage } from "@/lib/emails/send";
import { accountLabel } from "@/lib/payments/accounts";
import { ticketQrPng } from "@/lib/qr";
import PaymentInstructionsEmail from "@/emails/payment-instructions";
import OrderConfirmedEmail from "@/emails/order-confirmed";
import PaymentRejectedEmail from "@/emails/payment-rejected";
import NewProofEmail from "@/emails/new-proof";
import EventCancelledEmail from "@/emails/event-cancelled";
import ReviewDecisionEmail from "@/emails/review-decision";
import TeamInviteEmail from "@/emails/team-invite";
import EventReminderEmail from "@/emails/event-reminder";
import TeamDecisionEmail from "@/emails/team-decision";

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

/** EML-03 (also used for free tickets) – carries every ticket's QR (D-037). */
export async function notifyOrderConfirmed(orderId: string) {
  try {
    const order = await loadOrder(orderId);
    if (!order?.buyer_email || order.status !== "approved") return;
    const { data: tickets } = await createAdminClient()
      .from("tickets")
      .select("id, code, ticket_types!inner ( name )")
      .eq("order_id", order.id)
      .order("created_at");
    const qrTickets: { code: string; type: string; cid: string | null }[] = [];
    const attachments: { filename: string; content: Buffer; contentType: string; contentId: string }[] = [];
    for (const t of tickets ?? []) {
      const png = await ticketQrPng(t.id, 480);
      const cid = `qr-${t.code.toLowerCase()}`;
      if (png) attachments.push({ filename: `ticklo-ticket-${t.code}.png`, content: png, contentType: "image/png", contentId: cid });
      qrTickets.push({ code: t.code, type: t.ticket_types.name, cid: png ? cid : null });
    }
    await sendEmail({
      attachments,
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
        ticketCount: qrTickets.length || order.ticket_count,
        ticketsUrl: absoluteUrl("/me/tickets"),
        requiresCard: order.requires_student_card,
        tickets: qrTickets,
      }),
    });
    await notifyTeamMembers(order.id, order.buyer_email, {
      eventName: order.events.name,
      eventDate: formatEventRange(order.events.starts_at, order.events.ends_at),
      venue: order.events.venue,
      refCode: order.ref_code,
    });
  } catch (e) {
    console.error("notifyOrderConfirmed failed", e);
  }
}

/**
 * D-064: team entries – every member with an email (other than the lead) gets
 * their own ticket QR, so the lead does not have to forward each one.
 */
async function notifyTeamMembers(
  orderId: string,
  leadEmail: string,
  ev: { eventName: string; eventDate: string; venue: string; refCode: string },
) {
  const admin = createAdminClient();
  const { data: reg } = await admin.from("team_registrations").select("members").eq("order_id", orderId).maybeSingle();
  const members = (Array.isArray(reg?.members) ? reg.members : []) as { name?: string; email?: string }[];
  if (!members.some((m) => m.email)) return;
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, code, team_member_index, ticket_types!inner ( name )")
    .eq("order_id", orderId)
    .not("team_member_index", "is", null);
  for (const t of tickets ?? []) {
    const m = members[t.team_member_index ?? -1];
    const to = m?.email?.trim().toLowerCase();
    if (!to || to === leadEmail.trim().toLowerCase()) continue;
    const png = await ticketQrPng(t.id, 480);
    const cid = `qr-${t.code.toLowerCase()}`;
    await sendEmail({
      attachments: png ? [{ filename: `ticklo-ticket-${t.code}.png`, content: png, contentType: "image/png", contentId: cid }] : [],
      to,
      subject: `Your ticket for ${ev.eventName}`,
      template: "order-confirmed",
      related: { type: "order", id: orderId },
      react: OrderConfirmedEmail({
        name: firstName(m.name ?? ""),
        eventName: ev.eventName,
        eventDate: ev.eventDate,
        venue: ev.venue,
        refCode: ev.refCode,
        ticketCount: 1,
        ticketsUrl: absoluteUrl("/"),
        requiresCard: false,
        tickets: [{ code: t.code, type: t.ticket_types.name, cid: png ? cid : null }],
      }),
    });
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

/** FES-11: tell the team lead the organizer accepted / declined their team */
export async function notifyTeamDecision(registrationId: string) {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("team_registrations")
      .select(
        `id, team_name, status, reject_reason, member_count, session_id,
         profiles!team_registrations_user_id_fkey ( full_name, email ),
         event_sessions!inner ( name, fee_mode ),
         events!inner ( name )`,
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (!data?.profiles?.email || (data.status !== "approved" && data.status !== "rejected")) return;
    const { data: fee } = await admin.from("ticket_types").select("price_paisa").eq("registration_session_id", data.session_id).maybeSingle();
    const price = fee?.price_paisa ?? 0;
    const total = data.event_sessions.fee_mode === "per_member" ? price * data.member_count : price;
    const approved = data.status === "approved";
    await sendEmail({
      to: data.profiles.email,
      subject: `${data.team_name}: ${approved ? "accepted" : "not accepted"} – ${data.event_sessions.name}`,
      template: "team-decision",
      related: { type: "team_registration", id: data.id },
      react: TeamDecisionEmail({
        name: firstName(data.profiles.full_name),
        teamName: data.team_name,
        competition: data.event_sessions.name,
        eventName: data.events.name,
        approved,
        reason: data.reject_reason,
        feeText: total ? formatPKR(total) : "Free",
        url: absoluteUrl("/me/tickets#teams"),
      }),
    });
  } catch (e) {
    console.error("notifyTeamDecision failed", e);
  }
}

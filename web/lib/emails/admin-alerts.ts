import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/site";
import { formatDate, formatDateTime, formatEventRange, formatPKR } from "@/lib/format";
import { sendEmails, type EmailMessage } from "@/lib/emails/send";
import {
  daysUntil,
  digestIsEmpty,
  digestSubject,
  isOverdue,
  startOfPktDay,
  waitingLabel,
} from "@/lib/admin-digest";
import AdminAlertEmail, { type AdminAlertProps } from "@/emails/admin-alert";
import AdminDigestEmail, { type DigestGroup, type DigestItem } from "@/emails/admin-digest";

// D-088: emails to TickLO admins. Instant ones only when an admin has to act;
// everything else waits for the 9:00 digest. Every function here never throws.

/** Every active TickLO admin with an email address. */
async function adminEmails(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("email")
    .eq("is_admin", true)
    .eq("is_suspended", false)
    .is("deleted_at", null)
    .not("email", "is", null);
  return [...new Set((data ?? []).map((p) => p.email!.toLowerCase()))];
}

async function sendToAdmins(input: {
  subject: string;
  template: string;
  related: { type: string; id: string };
  props: AdminAlertProps;
}) {
  const to = await adminEmails();
  if (!to.length) return;
  const messages: EmailMessage[] = to.map((email) => ({
    to: email,
    subject: input.subject,
    template: input.template,
    related: input.related,
    react: AdminAlertEmail(input.props),
  }));
  await sendEmails(messages);
}

/** True when this alert already went out for this record (e.g. a flagged account). */
async function alreadySent(template: string, relatedId: string) {
  const { count } = await createAdminClient()
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("template", template)
    .eq("related_id", relatedId)
    .in("status", ["sent", "logged"]);
  return (count ?? 0) > 0;
}

/** A new society registered, or a rejected one sent itself back for review. */
export async function notifyAdminsSocietyToReview(orgSlug: string, resubmitted: boolean) {
  try {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, slug, type, created_by, review_note, status, universities ( name, city )")
      .eq("slug", orgSlug)
      .maybeSingle();
    if (!org || org.status !== "pending") return;
    const [{ data: head }, { data: creator }] = await Promise.all([
      admin.from("organization_heads").select("name, phone, email").eq("org_id", org.id).maybeSingle(),
      admin.from("profiles").select("full_name, email").eq("id", org.created_by).maybeSingle(),
    ]);
    const uni = org.universities ? `${org.universities.name}, ${org.universities.city}` : "Not given";
    await sendToAdmins({
      subject: resubmitted ? `Society resubmitted: ${org.name}` : `New society to review: ${org.name}`,
      template: "admin-society-review",
      related: { type: "organization", id: org.id },
      props: {
        label: "Society review",
        title: resubmitted ? `${org.name} sent its details again` : `${org.name} wants to join TickLO`,
        intro: resubmitted
          ? "This society was not approved before and has resubmitted. It cannot sell tickets until it is approved."
          : "A new society registered. It cannot create events or sell tickets until it is approved.",
        rows: [
          ["Society", org.name],
          ["University", uni],
          ["Type", org.type],
          ["Registered by", creator ? `${creator.full_name ?? "No name"} (${creator.email ?? "no email"})` : "Unknown"],
          ["Society head", head ? [head.name, head.phone, head.email].filter(Boolean).join(" · ") : "Not given"],
        ],
        quote: resubmitted && org.review_note ? { label: "Not approved before because", text: org.review_note } : null,
        ctaLabel: "Review society",
        ctaUrl: absoluteUrl("/admin/approvals"),
      },
    });
  } catch (e) {
    console.error("notifyAdminsSocietyToReview failed", e);
  }
}

/** A society sent an event for approval. The subject says when it starts within 3 days. */
export async function notifyAdminsEventToReview(eventId: string) {
  try {
    const { data: ev } = await createAdminClient()
      .from("events")
      .select("id, name, status, starts_at, ends_at, venue, format, reviewed_at, review_note, organizations!inner ( name )")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev || ev.status !== "pending_review") return;
    const resubmitted = Boolean(ev.reviewed_at);
    const soon = daysUntil(ev.starts_at, new Date());
    const soonText = soon === null ? "" : soon === 1 ? "Starts within a day: " : `Starts in ${soon} days: `;
    await sendToAdmins({
      subject: `${soonText}${resubmitted ? "Event resubmitted" : "Event to review"}: ${ev.name} by ${ev.organizations.name}`,
      template: "admin-event-review",
      related: { type: "event", id: ev.id },
      props: {
        label: "Event review",
        title: `${ev.organizations.name} sent ${ev.name} for approval`,
        intro: resubmitted
          ? "This event was not approved before and has been changed and sent again. Tickets go on sale once it is approved."
          : "Tickets go on sale once it is approved.",
        rows: [
          ["Event", ev.name],
          ["Society", ev.organizations.name],
          ["When", formatEventRange(ev.starts_at, ev.ends_at)],
          ["Venue", ev.venue],
          ["Kind", ev.format],
        ],
        quote: resubmitted && ev.review_note ? { label: "Not approved before because", text: ev.review_note } : null,
        warning: soon !== null ? "The event is close. Please review it today." : null,
        ctaLabel: "Review event",
        ctaUrl: absoluteUrl("/admin/approvals"),
      },
    });
  } catch (e) {
    console.error("notifyAdminsEventToReview failed", e);
  }
}

/** The same transaction ID or screenshot was used in another order. */
export async function notifyAdminsDuplicateProof(orderId: string) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("id, ref_code, total_paisa, buyer_name, buyer_email, events!inner ( name, organizations!inner ( name ) )")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const { data: proof } = await admin
      .from("payment_proofs")
      .select("id, duplicate_reasons, duplicate_order_ids")
      .eq("order_id", orderId)
      .eq("is_possible_duplicate", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!proof) return;
    const others = proof.duplicate_order_ids?.length ?? 0;
    await sendToAdmins({
      subject: `Possible duplicate payment: ${order.ref_code} (${order.events.name})`,
      template: "admin-duplicate-proof",
      related: { type: "payment_proof", id: proof.id },
      props: {
        label: "Fraud check",
        title: "A payment proof matches another order",
        intro: `${order.buyer_name} uploaded a payment proof that was already used ${others === 1 ? "in another order" : `in ${others || "other"} orders`}. The society also sees a warning, but it may approve by mistake.`,
        rows: [
          ["Order", order.ref_code],
          ["Event", `${order.events.name} (${order.events.organizations.name})`],
          ["Amount", formatPKR(order.total_paisa)],
          ["Buyer", `${order.buyer_name} (${order.buyer_email ?? "no email"})`],
        ],
        warning: proof.duplicate_reasons?.length ? `Matched on: ${proof.duplicate_reasons.join(", ")}` : null,
        ctaLabel: "Check the order",
        ctaUrl: absoluteUrl(`/admin/orders/${order.id}`),
      },
    });
  } catch (e) {
    console.error("notifyAdminsDuplicateProof failed", e);
  }
}

/** A student says they paid but the order was not approved (ADM-04). */
export async function notifyAdminsDispute(orderId: string) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("id, ref_code, status, total_paisa, buyer_name, buyer_email, buyer_phone, events!inner ( name, organizations!inner ( name ) )")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const { data: dispute } = await admin
      .from("disputes")
      .select("id, message")
      .eq("order_id", orderId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!dispute) return;
    await sendToAdmins({
      subject: `New dispute: ${order.ref_code} (${order.events.name})`,
      template: "admin-dispute",
      related: { type: "dispute", id: dispute.id },
      props: {
        label: "Dispute",
        title: `${order.buyer_name} reported a problem with a payment`,
        intro: "Money is involved, so please reply quickly. Contact the society if needed; their details are on the order page.",
        rows: [
          ["Order", `${order.ref_code} (${order.status.replace(/_/g, " ")})`],
          ["Event", `${order.events.name} (${order.events.organizations.name})`],
          ["Amount", formatPKR(order.total_paisa)],
          ["Buyer", [order.buyer_name, order.buyer_phone, order.buyer_email].filter(Boolean).join(" · ")],
        ],
        quote: { label: "Their message", text: dispute.message },
        ctaLabel: "Open the dispute",
        ctaUrl: absoluteUrl(`/admin/orders/${order.id}`),
      },
    });
  } catch (e) {
    console.error("notifyAdminsDispute failed", e);
  }
}

const FLAG_AT = 3;

/** After a rejection: tell admins once when this buyer has 3 or more rejected payments. */
export async function notifyAdminsIfRepeatRejections(orderId: string) {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("user_id").eq("id", orderId).maybeSingle();
    const userId = order?.user_id;
    if (!userId) return;
    // Same rule as the Fraud page (admin_repeat_rejections): cancelled events do not count.
    const { data: rejected } = await admin
      .from("payment_proofs")
      .select("reject_reason, reviewed_at")
      .eq("user_id", userId)
      .eq("status", "rejected");
    const counted = (rejected ?? []).filter((r) => (r.reject_reason ?? "") !== "Event cancelled");
    if (counted.length < FLAG_AT) return;
    if (await alreadySent("admin-flagged-account", userId)) return;
    const { data: user } = await admin.from("profiles").select("full_name, email, phone, is_suspended").eq("id", userId).maybeSingle();
    if (!user || user.is_suspended) return;
    const last = counted.map((r) => r.reviewed_at).filter(Boolean).sort().pop();
    await sendToAdmins({
      subject: `Account flagged: ${counted.length} rejected payments (${user.full_name ?? user.email ?? "user"})`,
      template: "admin-flagged-account",
      related: { type: "user", id: userId },
      props: {
        label: "Fraud check",
        title: `${user.full_name ?? "A user"} has ${counted.length} rejected payments`,
        intro: "Societies rejected this person's payment proofs several times. It can be honest mistakes or fake screenshots. Check their orders and decide whether to suspend the account.",
        rows: [
          ["Name", user.full_name ?? "No name"],
          ["Contact", [user.email, user.phone].filter(Boolean).join(" · ") || "None"],
          ["Rejected payments", String(counted.length)],
          ["Last rejection", last ? `${formatDateTime(last)} PKT` : "Unknown"],
        ],
        ctaLabel: "Open the account",
        ctaUrl: absoluteUrl(`/admin/users/${userId}`),
      },
    });
  } catch (e) {
    console.error("notifyAdminsIfRepeatRejections failed", e);
  }
}

// ---------------------------------------------------------------------------
// Daily digest (9:00 PKT, Supabase cron → /api/cron/admin-digest)
// ---------------------------------------------------------------------------

export type DigestResult = { sent: number; skipped?: "already_sent_today" | "nothing_to_report" | "no_admins" };

export async function sendAdminDigest(now = new Date()): Promise<DigestResult> {
  const admin = createAdminClient();
  const today = startOfPktDay(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const dayAfterTomorrow = new Date(today.getTime() + 2 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

  // Once per Pakistan day, even if the cron calls twice.
  const { count: sentToday } = await admin
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("template", "admin-digest")
    .in("status", ["sent", "logged"])
    .gte("created_at", today.toISOString());
  if ((sentToday ?? 0) > 0) return { sent: 0, skipped: "already_sent_today" };

  const head = { count: "exact" as const, head: true };
  const [orgsRes, eventsRes, unisRes, disputesRes, dupRes, deletionRes, failedRes, soonRes, signups, orders, tickets] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, created_at, universities ( name )")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at"),
    admin
      .from("events")
      .select("id, name, starts_at, submitted_at, updated_at, organizations!inner ( name )")
      .eq("status", "pending_review")
      .order("submitted_at", { ascending: true, nullsFirst: true }),
    admin.from("universities").select("id, name, city, created_at").eq("status", "pending").order("created_at"),
    admin
      .from("disputes")
      .select("id, created_at, orders!inner ( ref_code, events!inner ( name ) )", { count: "exact" })
      .eq("status", "open")
      .order("created_at")
      .limit(5),
    admin
      .from("payment_proofs")
      .select("id, created_at, orders!inner ( ref_code, events!inner ( name ) )", { count: "exact" })
      .eq("is_possible_duplicate", true)
      .eq("status", "pending")
      .order("created_at")
      .limit(5),
    admin
      .from("profiles")
      .select("id, full_name, email, deletion_requested_at", { count: "exact" })
      .not("deletion_requested_at", "is", null)
      .is("deleted_at", null)
      .order("deletion_requested_at")
      .limit(5),
    admin
      .from("email_log")
      .select("id, to_email, template, error, created_at", { count: "exact" })
      .eq("status", "failed")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("events")
      .select("name, starts_at, venue, organizations!inner ( name, deleted_at )")
      .eq("status", "published")
      .gte("starts_at", today.toISOString())
      .lt("starts_at", dayAfterTomorrow.toISOString())
      .is("organizations.deleted_at", null)
      .order("starts_at")
      .limit(10),
    admin.from("profiles").select("id", head).gte("created_at", yesterday.toISOString()).lt("created_at", today.toISOString()),
    admin.from("orders").select("id", head).gte("created_at", yesterday.toISOString()).lt("created_at", today.toISOString()),
    admin.from("tickets").select("id", head).gte("created_at", yesterday.toISOString()).lt("created_at", today.toISOString()),
  ]);

  // A society waits since it registered, or since it last resubmitted.
  const orgs = orgsRes.data ?? [];
  const since = new Map<string, string>();
  if (orgs.length) {
    const { data: steps } = await admin
      .from("audit_log")
      .select("target_id, created_at")
      .eq("target_type", "organization")
      .in("action", ["org.register", "org.resubmit"])
      .in("target_id", orgs.map((o) => o.id))
      .order("created_at");
    for (const s of steps ?? []) if (s.target_id) since.set(s.target_id, s.created_at);
  }
  const item = (name: string, sub: string | null, from: string): DigestItem => ({
    name,
    sub,
    waiting: waitingLabel(from, now),
    overdue: isOverdue(from, now),
  });

  const waiting: DigestGroup[] = [];
  if (orgs.length) {
    waiting.push({
      title: "Societies",
      count: orgs.length,
      url: absoluteUrl("/admin/approvals"),
      items: orgs.map((o) => item(o.name, o.universities?.name ?? null, since.get(o.id) ?? o.created_at)),
    });
  }
  const events = eventsRes.data ?? [];
  if (events.length) {
    waiting.push({
      title: "Events",
      count: events.length,
      url: absoluteUrl("/admin/approvals"),
      items: events.map((e) => {
        const soon = daysUntil(e.starts_at, now);
        const sub = `${e.organizations.name} · ${soon === null ? `on ${formatDate(e.starts_at)}` : soon === 1 ? "starts within a day" : `starts in ${soon} days`}`;
        const it = item(e.name, sub, e.submitted_at ?? e.updated_at);
        return soon !== null ? { ...it, overdue: true } : it;
      }),
    });
  }
  const unis = unisRes.data ?? [];
  if (unis.length) {
    waiting.push({
      title: "Universities typed under Other",
      count: unis.length,
      url: absoluteUrl("/admin/universities"),
      items: unis.map((u) => item(u.name, u.city, u.created_at)),
    });
  }

  const attention: DigestGroup[] = [];
  if (disputesRes.count) {
    attention.push({
      title: "Open disputes",
      count: disputesRes.count,
      url: absoluteUrl("/admin/orders"),
      items: (disputesRes.data ?? []).map((d) => item(d.orders.ref_code, d.orders.events.name, d.created_at)),
    });
  }
  if (dupRes.count) {
    attention.push({
      title: "Possible duplicate payments not reviewed",
      count: dupRes.count,
      url: absoluteUrl("/admin/fraud"),
      items: (dupRes.data ?? []).map((p) => item(p.orders.ref_code, p.orders.events.name, p.created_at)),
    });
  }
  if (deletionRes.count) {
    attention.push({
      title: "Account deletion requests",
      count: deletionRes.count,
      url: absoluteUrl("/admin/users?filter=deletion"),
      items: (deletionRes.data ?? []).map((u) => item(u.full_name ?? "No name", u.email, u.deletion_requested_at!)),
    });
  }
  if (failedRes.count) {
    attention.push({
      title: "Emails that failed in the last 24 hours",
      count: failedRes.count,
      url: absoluteUrl("/admin/logs?tab=emails"),
      items: (failedRes.data ?? []).map((l) => ({ name: l.to_email, sub: `${l.template}${l.error ? ` · ${l.error.slice(0, 80)}` : ""}` })),
    });
  }

  const counts = {
    waiting: waiting.reduce((n, g) => n + g.count, 0),
    attention: attention.reduce((n, g) => n + g.count, 0),
  };
  if (digestIsEmpty(counts)) return { sent: 0, skipped: "nothing_to_report" };

  const to = await adminEmails();
  if (!to.length) return { sent: 0, skipped: "no_admins" };

  const eventsSoon: DigestItem[] = (soonRes.data ?? []).map((e) => ({
    name: e.name,
    sub: `${e.organizations.name} · ${formatDateTime(e.starts_at)} · ${e.venue}`,
  }));
  const props = {
    dateLabel: formatDate(now),
    waiting,
    attention,
    eventsSoon,
    yesterday: { signups: signups.count ?? 0, orders: orders.count ?? 0, tickets: tickets.count ?? 0 },
    adminUrl: absoluteUrl("/admin"),
  };
  const sent = await sendEmails(
    to.map((email) => ({
      to: email,
      subject: digestSubject(counts),
      template: "admin-digest",
      related: { type: "digest", id: new Date(today.getTime() + 5 * 3_600_000).toISOString().slice(0, 10) }, // PKT date
      react: AdminDigestEmail(props),
    })),
  );
  return { sent };
}

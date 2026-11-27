"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { signedUrl } from "@/lib/storage";
import { fieldErrors } from "@/lib/validation/common";
import { paymentAccountSchema, rejectSchema } from "@/lib/validation/payments";
import { inviteSchema } from "@/lib/validation/team";
import { notifyOrderConfirmed, notifyPaymentRejected, notifyTeamInvite } from "@/lib/emails/notify";
import { runWaitlist } from "@/lib/waitlist";

const uuid = z.string().uuid();

async function staff(orgSlug: string) {
  const a = await getOrgAccess(orgSlug);
  return a?.user && (a.role === "owner" || a.role === "member") ? a : null;
}
async function owner(orgSlug: string) {
  const a = await getOrgAccess(orgSlug);
  return a?.user && a.role === "owner" ? a : null;
}

// ---------------------------------------------------------------------------
// Payments review (PAY-06, PAY-07)
// ---------------------------------------------------------------------------
export async function approveOrder(orgSlug: string, orderId: string): Promise<ActionResult<{ already: boolean }>> {
  if (!(await staff(orgSlug)) || !uuid.safeParse(orderId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_order", { p_order_id: orderId });
  if (error) return fail(error);
  const res = data as { already_approved: boolean };
  if (!res.already_approved) await notifyOrderConfirmed(orderId); // EML-03
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, data: { already: res.already_approved }, message: res.already_approved ? "Already approved." : "Approved – tickets sent." };
}

export async function rejectOrder(orgSlug: string, orderId: string, input: unknown): Promise<ActionResult> {
  if (!(await staff(orgSlug)) || !uuid.safeParse(orderId).success) return { ok: false, error: "Not allowed." };
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please give a reason.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_order", { p_order_id: orderId, p_reason: parsed.data.reason });
  if (error) return fail(error);
  if (!(data as { already_rejected: boolean }).already_rejected) await notifyPaymentRejected(orderId); // EML-06
  await runWaitlist(); // D-071: the rejected booking's places may go to the waitlist
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: "Rejected – the student was emailed." };
}

/** Short-lived links to the private screenshot / student card (NFR-15). */
export async function proofFileUrls(orgSlug: string, proofId: string): Promise<ActionResult<{ screenshot: string | null; card: string | null }>> {
  if (!(await staff(orgSlug)) || !uuid.safeParse(proofId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  // RLS: only the event's organizers (or admins) can read this row.
  const { data: proof } = await supabase.from("payment_proofs").select("screenshot_path, student_card_path").eq("id", proofId).maybeSingle();
  if (!proof) return { ok: false, error: "Not found." };
  const [screenshot, card] = await Promise.all([
    signedUrl("payment-proofs", proof.screenshot_path, 600),
    signedUrl("student-cards", proof.student_card_path, 600),
  ]);
  return { ok: true, data: { screenshot, card } };
}

// ---------------------------------------------------------------------------
// Manual check-in (ORG-13)
// ---------------------------------------------------------------------------
export async function manualCheckIn(orgSlug: string, ticketId: string): Promise<ActionResult<{ result: string; at?: string }>> {
  if (!uuid.safeParse(ticketId).success) return { ok: false, error: "Not found." };
  const a = await getOrgAccess(orgSlug);
  if (!a?.user) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manual_check_in", { p_ticket_id: ticketId, p_device: "attendee list" });
  if (error) return fail(error);
  const r = data as { result: string; checked_in_at?: string };
  revalidatePath(`/org/${orgSlug}`, "layout");
  const messages: Record<string, string> = {
    ok: "Checked in.",
    already_used: "Already checked in.",
    cancelled: "This ticket is cancelled.",
    not_allowed: "You can't check in tickets for this event right now.",
    not_found: "Ticket not found.",
  };
  return r.result === "ok"
    ? { ok: true, data: { result: r.result, at: r.checked_in_at }, message: messages.ok }
    : { ok: false, error: messages[r.result] ?? "Could not check in." };
}

// ---------------------------------------------------------------------------
// Scanners (ORG-10)
// ---------------------------------------------------------------------------
export async function assignScanner(orgSlug: string, eventId: string, userId: string): Promise<ActionResult> {
  if (!(await staff(orgSlug)) || !uuid.safeParse(eventId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_scanner", { p_event_id: eventId, p_user_id: userId });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: "Scanner assigned." };
}

export async function unassignScanner(orgSlug: string, eventId: string, userId: string): Promise<ActionResult> {
  if (!(await staff(orgSlug)) || !uuid.safeParse(eventId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_scanner", { p_event_id: eventId, p_user_id: userId });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: "Scanner removed." };
}

// ---------------------------------------------------------------------------
// Team (ORG-03, EML-09) – owner only
// ---------------------------------------------------------------------------
export async function inviteMember(orgSlug: string, input: unknown): Promise<ActionResult> {
  const a = await owner(orgSlug);
  if (!a) return { ok: false, error: "Only the society owner can invite people." };
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  if (!(await rateLimit(`invite:org:${a.org.id}`, 30, 3600))) return { ok: false, error: "Too many invites. Try again later." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_to_org", { p_org_id: a.org.id, p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return fail(error);
  await notifyTeamInvite({
    email: parsed.data.email,
    orgName: a.org.name,
    role: parsed.data.role,
    inviterName: a.user!.profile.full_name ?? "A society organizer",
    token: (data as { token: string }).token,
  });
  revalidatePath(`/org/${orgSlug}/team`);
  return { ok: true, message: `Invite sent to ${parsed.data.email}.` };
}

export async function revokeInvite(orgSlug: string, inviteId: string): Promise<ActionResult> {
  if (!(await owner(orgSlug)) || !uuid.safeParse(inviteId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite_id: inviteId });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}/team`);
  return { ok: true, message: "Invite revoked." };
}

export async function changeMemberRole(orgSlug: string, userId: string, role: string): Promise<ActionResult> {
  const a = await owner(orgSlug);
  if (!a || !uuid.safeParse(userId).success || (role !== "member" && role !== "scanner")) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_role", { p_org_id: a.org.id, p_user_id: userId, p_role: role });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}/team`);
  return { ok: true, message: "Role updated." };
}

export async function removeMember(orgSlug: string, userId: string): Promise<ActionResult> {
  const a = await owner(orgSlug);
  if (!a || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_org_id: a.org.id, p_user_id: userId });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}/team`);
  return { ok: true, message: "Removed from the team." };
}

// ---------------------------------------------------------------------------
// Payment accounts (ORG-02) – owner only
// ---------------------------------------------------------------------------
export async function savePaymentAccount(orgSlug: string, accountId: string | null, input: unknown): Promise<ActionResult> {
  const a = await owner(orgSlug);
  if (!a) return { ok: false, error: "Only the society owner can change payment accounts." };
  const parsed = paymentAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const row = {
    kind: d.kind,
    bank_name: d.kind === "bank" ? d.bank_name : null,
    account_title: d.account_title,
    account_number: d.account_number.replace(/\s+/g, d.kind === "bank" ? " " : ""),
    iban: d.kind === "bank" && d.iban ? d.iban.replace(/\s/g, "") : null,
  };
  const supabase = await createClient();
  if (accountId) {
    if (!uuid.safeParse(accountId).success) return { ok: false, error: "Not found." };
    const { error } = await supabase.from("payment_accounts").update(row).eq("id", accountId).eq("org_id", a.org.id);
    if (error) return fail(error);
  } else {
    const { error } = await supabase.from("payment_accounts").insert({ ...row, org_id: a.org.id });
    if (error) return fail(error);
  }
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: "Payment account saved." };
}

export async function setPaymentAccountActive(orgSlug: string, accountId: string, active: boolean): Promise<ActionResult> {
  const a = await owner(orgSlug);
  if (!a || !uuid.safeParse(accountId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.from("payment_accounts").update({ is_active: active }).eq("id", accountId).eq("org_id", a.org.id);
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: active ? "Account shown again." : "Account hidden from students." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, type ActionResult } from "@/lib/errors";
import { absoluteUrl } from "@/lib/site";
import { normalizePhone } from "@/lib/phone";
import { emailField, fieldErrors } from "@/lib/validation/common";
import {
  notifyEventCancelled,
  notifyOrderConfirmed,
  notifyPaymentInstructions,
  notifyPaymentRejected,
  notifySocietyStatus,
  notifyTeamDecision,
} from "@/lib/emails/notify";
import { runWaitlist } from "@/lib/waitlist";

// D-084: everything an admin can do beyond reviews – societies, events, orders,
// accounts and site settings. Every database function checks is_admin() again
// and writes the audit log; these actions add emails and Supabase Auth calls.

const uuid = z.string().uuid();
const reason = (min = 3) => z.string().trim().min(min, "Give a reason").max(1000, "Keep it under 1000 characters");

async function admin() {
  const u = await getCurrentUser();
  return u && u.profile.is_admin && !u.profile.is_suspended ? u : null;
}

const notAdmin: ActionResult<never> = { ok: false, error: "Admins only." };

type Cancelled = { event_id: string; recipients: { email: string; name: string }[] }[];

async function emailCancelled(cancelled: Cancelled | undefined, why: string) {
  for (const c of cancelled ?? []) await notifyEventCancelled(c.event_id, c.recipients ?? [], why);
}

function refreshAdmin() {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Societies
// ---------------------------------------------------------------------------
const suspendSchema = z.object({ reason: reason(), cancelEvents: z.boolean() });

export async function suspendOrganization(orgId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success) return notAdmin;
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give a reason for suspending.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_suspend_organization", {
    p_org_id: orgId,
    p_reason: parsed.data.reason,
    p_cancel_events: parsed.data.cancelEvents,
  });
  if (error) return fail(error);
  const r = data as { org_name: string; org_slug: string; owner: { email?: string; name?: string }; cancelled: Cancelled };
  await emailCancelled(r.cancelled, parsed.data.reason);
  await notifySocietyStatus({
    change: "suspended",
    owner: r.owner,
    societyName: r.org_name,
    orgSlug: r.org_slug,
    reason: parsed.data.reason,
    cancelledEvents: r.cancelled?.length ?? 0,
  });
  refreshAdmin();
  const n = r.cancelled?.length ?? 0;
  return { ok: true, message: `Society suspended${n ? ` and ${n} event${n === 1 ? "" : "s"} cancelled` : ""}. The owner was emailed.` };
}

export async function restoreOrganization(orgId: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success) return notAdmin;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_restore_organization", { p_org_id: orgId });
  if (error) return fail(error);
  const r = data as { org_name: string; org_slug: string; restored_from: string; owner: { email?: string; name?: string } };
  await notifySocietyStatus({ change: "restored", owner: r.owner, societyName: r.org_name, orgSlug: r.org_slug });
  refreshAdmin();
  return { ok: true, message: r.restored_from === "deleted" ? "Society brought back." : "Suspension lifted." };
}

const deleteOrgSchema = z.object({ reason: reason(), confirmName: z.string().trim().min(1, "Type the society's name") });

/** Hidden public URL path of a logo in the "logos" bucket, or null. */
function logoPath(url: string | null | undefined): string | null {
  const m = url ? /\/storage\/v1\/object\/public\/logos\/(.+)$/.exec(url) : null;
  return m ? decodeURIComponent(m[1]) : null;
}

export async function deleteOrganization(orgId: string, input: unknown): Promise<ActionResult<{ mode: string }>> {
  if (!(await admin()) || !uuid.safeParse(orgId).success) return notAdmin;
  const parsed = deleteOrgSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_organization", {
    p_org_id: orgId,
    p_reason: parsed.data.reason,
    p_confirm_name: parsed.data.confirmName,
  });
  if (error) return fail(error, /name/i.test(error.details ?? "") ? { confirmName: "Does not match" } : undefined);
  const r = data as { mode: "permanent" | "hidden"; org_name: string; owner: { email?: string; name?: string }; cancelled: Cancelled; logo_url?: string; proof_path?: string };
  await emailCancelled(r.cancelled, parsed.data.reason);
  await notifySocietyStatus({
    change: "deleted",
    owner: r.owner,
    societyName: r.org_name,
    orgSlug: "",
    reason: parsed.data.reason,
    cancelledEvents: r.cancelled?.length ?? 0,
  });
  if (r.mode === "permanent") {
    // Best effort: the society's files are no longer needed.
    try {
      const storage = createAdminClient().storage;
      if (r.proof_path) await storage.from("org-proofs").remove([r.proof_path]);
      const logo = logoPath(r.logo_url);
      if (logo) await storage.from("logos").remove([logo]);
    } catch (e) {
      console.error("society file cleanup failed", e);
    }
  }
  refreshAdmin();
  return {
    ok: true,
    data: { mode: r.mode },
    message: r.mode === "permanent" ? "Society deleted for good." : "Society deleted. Its orders and tickets are kept, and you can bring it back from the Deleted list.",
  };
}

const editOrgSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "At least 2 characters")
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Small letters, numbers and dashes only, e.g. lums-music-society"),
  universityId: z.union([z.literal(""), z.string().uuid()]),
  type: z.enum(["society", "department"]),
});

export async function updateOrganization(orgId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success) return notAdmin;
  const parsed = editOrgSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_organization", {
    p_org_id: orgId,
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_university_id: (parsed.data.universityId || null) as string,
    p_type: parsed.data.type,
  });
  if (error) return fail(error, error.message.includes("SLUG_TAKEN") ? { slug: "Already taken" } : undefined);
  refreshAdmin();
  return { ok: true, message: "Society saved." };
}

export async function setPaymentAccountActive(accountId: string, active: boolean): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(accountId).success) return notAdmin;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_payment_account_active", { p_account_id: accountId, p_active: active });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: active ? "Payment account turned on." : "Payment account turned off. Students no longer see it." };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export async function setEventSalesPaused(eventId: string, paused: boolean, why?: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(eventId).success) return notAdmin;
  if (paused && (why ?? "").trim().length < 3) return { ok: false, error: "Give a reason for pausing sales.", fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_event_sales_paused", { p_event_id: eventId, p_paused: paused, p_reason: (why ?? "").trim() || undefined });
  if (error) return fail(error);
  refreshAdmin();
  return { ok: true, message: paused ? "Ticket sales paused." : "Ticket sales are on again." };
}

export async function unpublishEvent(eventId: string, why: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(eventId).success) return notAdmin;
  if (why.trim().length < 3) return { ok: false, error: "Give a reason (the organizers see it).", fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unpublish_event", { p_event_id: eventId, p_reason: why.trim() });
  if (error) return fail(error);
  refreshAdmin();
  return { ok: true, message: "Event unpublished. It is a draft again." };
}

export async function deleteEvent(eventId: string, why: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(eventId).success) return notAdmin;
  if (why.trim().length < 3) return { ok: false, error: "Give a reason for deleting.", fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_event", { p_event_id: eventId, p_reason: why.trim() });
  if (error) return fail(error);
  refreshAdmin();
  return { ok: true, message: "Event deleted." };
}

// ---------------------------------------------------------------------------
// Orders and tickets
// ---------------------------------------------------------------------------
export async function adminApproveOrder(orderId: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orderId).success) return notAdmin;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_order", { p_order_id: orderId });
  if (error) return fail(error);
  const res = data as { already_approved: boolean };
  if (!res.already_approved) await notifyOrderConfirmed(orderId);
  revalidatePath("/admin", "layout");
  return { ok: true, message: res.already_approved ? "Already approved." : "Approved. Tickets were emailed." };
}

export async function adminRejectOrder(orderId: string, why: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orderId).success) return notAdmin;
  if (why.trim().length < 3) return { ok: false, error: "Give a reason (sent to the student).", fieldErrors: { reason: "Give a reason" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_order", { p_order_id: orderId, p_reason: why.trim().slice(0, 500) });
  if (error) return fail(error);
  if (!(data as { already_rejected: boolean }).already_rejected) await notifyPaymentRejected(orderId);
  await runWaitlist();
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Rejected. The student was emailed." };
}

export async function resendTickets(orderId: string): Promise<ActionResult> {
  const me = await admin();
  if (!me || !uuid.safeParse(orderId).success) return notAdmin;
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("status, buyer_email").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "approved") return { ok: false, error: "Only approved orders have tickets to send." };
  if (!order.buyer_email) return { ok: false, error: "This order has no email address. Add one first." };
  await notifyOrderConfirmed(orderId);
  await supabase.rpc("admin_log", { p_action: "order.resend_tickets", p_target_type: "order", p_target_id: orderId, p_details: { to: order.buyer_email } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Tickets sent again to ${order.buyer_email}.` };
}

export async function cancelTicket(ticketId: string, why: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(ticketId).success) return notAdmin;
  if (why.trim().length < 3) return { ok: false, error: "Give a reason for cancelling the ticket." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_ticket", { p_ticket_id: ticketId, p_reason: why.trim() });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Ticket cancelled. Its QR code no longer works." };
}

const buyerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.union([z.literal(""), emailField]),
  phone: z.string().trim().refine((v) => v === "" || normalizePhone(v) !== null, "Enter a Pakistani mobile number, e.g. 0300 1234567"),
});

export async function updateOrderBuyer(orderId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orderId).success) return notAdmin;
  const parsed = buyerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_order_buyer", {
    p_order_id: orderId,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone ? (normalizePhone(parsed.data.phone) ?? "") : "",
  });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Buyer details saved." };
}

export async function markOrderRefunded(orderId: string, note: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orderId).success) return notAdmin;
  if (note.trim().length < 3) return { ok: false, error: "Write how the money was returned (e.g. JazzCash TID)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_mark_order_refunded", { p_order_id: orderId, p_note: note.trim() });
  if (error) return fail(error);
  await runWaitlist(); // its places are free again
  const n = (data as { tickets_cancelled: number }).tickets_cancelled;
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Marked refunded${n ? `, ${n} ticket${n === 1 ? "" : "s"} cancelled` : ""}.` };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required").max(100),
  phone: z.string().trim().refine((v) => v === "" || normalizePhone(v) !== null, "Enter a Pakistani mobile number, e.g. 0300 1234567"),
  universityId: z.union([z.literal(""), z.string().uuid()]),
  email: emailField,
});

export async function updateUserProfile(userId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(userId).success) return notAdmin;
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: current } = await supabase.from("profiles").select("email, deleted_at").eq("id", userId).maybeSingle();
  if (!current) return { ok: false, error: "User not found." };
  if (current.deleted_at) return { ok: false, error: "This account is deleted." };
  const { error } = await supabase.rpc("admin_update_profile", {
    p_user_id: userId,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone ? (normalizePhone(parsed.data.phone) ?? "") : "",
    p_university_id: (parsed.data.universityId || null) as string,
  });
  if (error) return fail(error);
  let emailNote = "";
  if (parsed.data.email !== (current.email ?? "").toLowerCase()) {
    // Login email lives in Supabase Auth; a trigger copies it to the profile.
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, { email: parsed.data.email, email_confirm: true });
    if (authError) {
      const taken = /already|exists|registered/i.test(authError.message);
      return {
        ok: false,
        error: taken ? "Another account already uses this email." : "Name and phone saved, but the email could not be changed.",
        fieldErrors: { email: taken ? "Already used" : "Not changed" },
      };
    }
    await supabase.rpc("admin_log", {
      p_action: "user.email_change",
      p_target_type: "user",
      p_target_id: userId,
      p_details: { from: current.email, to: parsed.data.email },
    });
    emailNote = " The new email works for login right away.";
  }
  revalidatePath("/admin/users", "layout");
  return { ok: true, message: `Profile saved.${emailNote}` };
}

export async function signOutUserEverywhere(userId: string): Promise<ActionResult> {
  const me = await admin();
  if (!me || !uuid.safeParse(userId).success) return notAdmin;
  if (userId === me.id) return { ok: false, error: "Use Log out for your own account." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_sign_out_user", { p_user_id: userId });
  if (error) return fail(error);
  const n = Number(data ?? 0);
  return { ok: true, message: n ? `Signed out of ${n} device${n === 1 ? "" : "s"}. It takes effect within an hour at most.` : "They were not logged in anywhere." };
}

export async function sendPasswordReset(userId: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(userId).success) return notAdmin;
  const supabase = await createClient();
  const { data: user } = await supabase.from("profiles").select("email, deleted_at").eq("id", userId).maybeSingle();
  if (!user?.email || user.deleted_at) return { ok: false, error: "This account has no email address." };
  // Service client: nothing is stored in the admin's own browser session.
  const { error } = await createAdminClient().auth.resetPasswordForEmail(user.email, { redirectTo: absoluteUrl("/auth/confirm?next=/reset-password/update") });
  if (error) return { ok: false, error: "The reset email could not be sent. Try again in a minute." };
  await supabase.rpc("admin_log", { p_action: "user.password_reset_sent", p_target_type: "user", p_target_id: userId, p_details: { to: user.email } });
  return { ok: true, message: `Password reset link sent to ${user.email}.` };
}

const deleteUserSchema = z.object({ reason: reason(), confirm: z.string().trim() });

export async function deleteUserAccount(userId: string, input: unknown): Promise<ActionResult<{ mode: string }>> {
  const me = await admin();
  if (!me || !uuid.safeParse(userId).success) return notAdmin;
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.confirm.toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm.", fieldErrors: { confirm: "Type DELETE" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_user", { p_user_id: userId, p_reason: parsed.data.reason });
  if (error) return fail(error);
  const r = data as { mode: "permanent" | "details_removed" };
  if (r.mode === "details_removed") {
    // Also block the login in Supabase Auth (the database already set banned_until).
    try {
      await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    } catch (e) {
      console.error("auth ban after delete failed", e);
    }
  }
  revalidatePath("/admin", "layout");
  return {
    ok: true,
    data: { mode: r.mode },
    message: r.mode === "permanent" ? "Account deleted for good." : "Account deleted. Their orders and tickets are kept as \"Deleted user\".",
  };
}

// ---------------------------------------------------------------------------
// Emails and site settings
// ---------------------------------------------------------------------------
/** Send a failed email again (the kinds that can be rebuilt from the order or team). */
export async function resendLoggedEmail(logId: number): Promise<ActionResult> {
  if (!(await admin()) || !Number.isSafeInteger(logId)) return notAdmin;
  const supabase = await createClient();
  const { data: log } = await supabase.from("email_log").select("template, related_type, related_id").eq("id", logId).maybeSingle();
  if (!log?.related_id || !uuid.safeParse(log.related_id).success) return { ok: false, error: "This email cannot be sent again from here." };
  const id = log.related_id;
  if (log.template === "order-confirmed") await notifyOrderConfirmed(id);
  else if (log.template === "payment-instructions") await notifyPaymentInstructions(id);
  else if (log.template === "payment-rejected") await notifyPaymentRejected(id);
  else if (log.template === "team-decision") await notifyTeamDecision(id);
  else return { ok: false, error: "This email cannot be sent again from here." };
  await supabase.rpc("admin_log", { p_action: "email.resend", p_target_type: "email", p_target_id: String(logId), p_details: { template: log.template } });
  revalidatePath("/admin/logs");
  return { ok: true, message: "Sent again. Check the email list for the result." };
}

const settingsSchema = z.object({
  announcement: z.string().trim().max(300, "Keep it under 300 characters"),
  tone: z.enum(["info", "warning"]),
  active: z.boolean(),
});

export async function saveSiteSettings(input: unknown): Promise<ActionResult> {
  if (!(await admin())) return notAdmin;
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.active && !parsed.data.announcement) return { ok: false, error: "Write the announcement first.", fieldErrors: { announcement: "Required to show the banner" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_site_settings", {
    p_announcement: parsed.data.announcement,
    p_tone: parsed.data.tone,
    p_active: parsed.data.active,
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, message: parsed.data.active ? "Banner is live on every page." : "Banner saved and hidden." };
}

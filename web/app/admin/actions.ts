"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, type ActionResult } from "@/lib/errors";
import { notifyEventCancelled, notifyReviewDecision } from "@/lib/emails/notify";
import { fieldErrors } from "@/lib/validation/common";

const uuid = z.string().uuid();

async function admin() {
  const u = await getCurrentUser();
  return u && u.profile.is_admin && !u.profile.is_suspended ? u : null;
}

const noteSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(1000) }).refine((v) => v.approve || v.note.length >= 3, {
  message: "Give a reason for rejecting",
  path: ["note"],
});

/** ADM-01 + EML-07 */
export async function reviewOrganization(orgId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success) return { ok: false, error: "Admins only." };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give a reason for rejecting.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_organization", { p_org_id: orgId, p_approve: parsed.data.approve, p_note: parsed.data.note || null });
  if (error) return fail(error);
  const r = data as { org_name: string; org_slug: string; owner_email: string | null; owner_name: string | null; note: string | null };
  await notifyReviewDecision({
    kind: "society",
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    subjectName: r.org_name,
    approved: parsed.data.approve,
    note: r.note,
    orgSlug: r.org_slug,
  });
  revalidatePath("/admin", "layout");
  return { ok: true, message: parsed.data.approve ? "Society approved." : "Society rejected." };
}

/** ADM-02 + EML-07 */
export async function reviewEvent(eventId: string, input: unknown): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(eventId).success) return { ok: false, error: "Admins only." };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give a reason for rejecting.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_event", { p_event_id: eventId, p_approve: parsed.data.approve, p_note: parsed.data.note || null });
  if (error) return fail(error);
  const r = data as { event_name: string; event_slug: string; org_slug: string; owner_email: string | null; owner_name: string | null; note: string | null };
  await notifyReviewDecision({
    kind: "event",
    ownerEmail: r.owner_email,
    ownerName: r.owner_name,
    subjectName: r.event_name,
    approved: parsed.data.approve,
    note: r.note,
    orgSlug: r.org_slug,
    eventSlug: r.event_slug,
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  revalidatePath("/events");
  return { ok: true, message: parsed.data.approve ? "Event published." : "Event rejected." };
}

/** ADM-05 / ADM-06 / AUTH-09: suspend or restore. Also bans/unbans the login in Supabase Auth. */
export async function setUserSuspended(userId: string, suspend: boolean, reason?: string): Promise<ActionResult> {
  const me = await admin();
  if (!me || !uuid.safeParse(userId).success) return { ok: false, error: "Admins only." };
  if (userId === me.id) return { ok: false, error: "You cannot suspend yourself." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_suspended", { p_user_id: userId, p_suspended: suspend, p_reason: reason ?? null });
  if (error) return fail(error);
  try {
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: suspend ? "876000h" : "none" });
    if (banError) throw banError;
    await supabase.rpc("admin_log", { p_action: suspend ? "auth.ban" : "auth.unban", p_target_type: "user", p_target_id: userId, p_details: {} });
  } catch (e) {
    console.error("auth ban update failed", e);
    return { ok: true, message: "Profile updated, but the login ban could not be changed – the app still blocks the account." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: suspend ? "Account suspended." : "Account restored." };
}

const universitySchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(150),
  short_name: z.string().trim().max(40),
  city: z.string().trim().min(2, "City is required").max(80),
  email_domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .refine((v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Enter a domain like lums.edu.pk"),
});

/** ADM-07 */
export async function saveUniversity(id: string | null, input: unknown): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Admins only." };
  const parsed = universitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_university", {
    p_id: id && uuid.safeParse(id).success ? id : null,
    p_name: parsed.data.name,
    p_short_name: parsed.data.short_name,
    p_city: parsed.data.city,
    p_email_domain: parsed.data.email_domain,
  });
  if (error) return fail(error);
  revalidatePath("/admin/universities");
  return { ok: true, message: "University saved." };
}

export async function deleteUniversity(id: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(id).success) return { ok: false, error: "Admins only." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_university", { p_id: id });
  if (error) return fail(error);
  revalidatePath("/admin/universities");
  return { ok: true, message: "University deleted." };
}

/** ADM-04 */
export async function resolveDispute(id: string, note: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(id).success) return { ok: false, error: "Admins only." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_resolve_dispute", { p_dispute_id: id, p_note: note.slice(0, 1000) });
  if (error) return fail(error);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Dispute resolved." };
}

/** Admins can cancel a published event (e.g. fraud). Same flow as organizers (EML-05). */
export async function adminCancelEvent(eventId: string, reason: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(eventId).success) return { ok: false, error: "Admins only." };
  if (reason.trim().length < 5) return { ok: false, error: "Give a reason (sent to attendees)." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_event", { p_event_id: eventId, p_reason: reason.trim() });
  if (error) return fail(error);
  const r = data as { recipients: { email: string; name: string }[] };
  await notifyEventCancelled(eventId, r.recipients ?? [], reason.trim());
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Event cancelled and attendees emailed." };
}

const orgRole = z.enum(["owner", "member", "scanner"]);

/** D-037: make someone a TickLO admin or take admin access away. */
export async function setPlatformAdmin(userId: string, makeAdmin: boolean): Promise<ActionResult> {
  const me = await admin();
  if (!me || !uuid.safeParse(userId).success) return { ok: false, error: "Admins only." };
  if (userId === me.id) return { ok: false, error: "You cannot change your own admin access." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_platform_admin", { p_user_id: userId, p_is_admin: makeAdmin });
  if (error) return fail(error);
  revalidatePath("/admin/users", "layout");
  return { ok: true, message: makeAdmin ? "Now a TickLO admin." : "Admin access removed." };
}

/** D-037: set (or add) a user's role in any society. "owner" moves the old owner to member. */
export async function setOrgRole(orgId: string, userId: string, role: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Admins only." };
  const parsed = orgRole.safeParse(role);
  if (!parsed.success) return { ok: false, error: "Please choose a valid role." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_org_role", { p_org_id: orgId, p_user_id: userId, p_role: parsed.data });
  if (error) return fail(error);
  revalidatePath("/admin/users", "layout");
  revalidatePath("/org", "layout");
  return { ok: true, message: parsed.data === "owner" ? "Owner changed." : "Role updated." };
}

/** D-037: remove a user from a society (not the owner). */
export async function removeOrgMember(orgId: string, userId: string): Promise<ActionResult> {
  if (!(await admin()) || !uuid.safeParse(orgId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Admins only." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_org_member", { p_org_id: orgId, p_user_id: userId });
  if (error) return fail(error);
  revalidatePath("/admin/users", "layout");
  revalidatePath("/org", "layout");
  return { ok: true, message: "Removed from the society." };
}

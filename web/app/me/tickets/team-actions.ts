"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";
import { cookies } from "next/headers";
import { normalizeCode, refCookieName } from "@/lib/referrals";
import { normalizePhone } from "@/lib/phone";

/** FES-11: an accepted team (or one whose unpaid order expired) pays now. D-064: with a promo / ambassador code. */
export async function payTeam(registrationId: string, eventId: string, code: string | null = null): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(registrationId).success || !z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  const typed = normalizeCode(code);
  if (typed && typed.length > 16) return { ok: false, error: "This code is not valid for this event." };
  const remembered = normalizeCode((await cookies()).get(refCookieName(eventId))?.value);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_team_registration", {
    p_registration_id: registrationId,
    p_code: typed,
    p_ref: remembered && remembered.length <= 16 ? remembered : null,
  });
  if (error) return fail(error);
  const order = data as { order_id: string; status: string; existing: boolean };
  if (!order.existing) {
    if (order.status === "approved") await notifyOrderConfirmed(order.order_id);
    else await notifyPaymentInstructions(order.order_id);
  }
  redirect(order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : order.status === "awaiting_payment" ? `/checkout/${order.order_id}` : `/checkout/${order.order_id}/status`);
}

const memberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(120)]).optional(),
  roll_no: z.string().trim().max(40).optional(),
  university: z.string().trim().max(120).optional(),
});

/** D-064: the lead changes the team until the competition starts. */
export async function updateTeam(registrationId: string, teamName: string, members: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(registrationId).success) return { ok: false, error: "Not allowed." };
  const parsed = z.array(memberSchema).min(1).max(20).safeParse(members);
  if (!parsed.success) return { ok: false, error: "Every member needs a name, and emails must be valid." };
  const badPhone = parsed.data.find((m) => m.phone && !normalizePhone(m.phone));
  if (badPhone) return { ok: false, error: `Check the mobile number of ${badPhone.name}.` };
  const clean = parsed.data.map((m) => ({ ...m, phone: m.phone ? normalizePhone(m.phone)! : undefined, email: m.email || undefined }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_team_members", { p_registration_id: registrationId, p_team_name: teamName.slice(0, 80), p_members: clean });
  if (error) return fail(error);
  revalidatePath("/me/tickets");
  return ok(undefined, "Saved.");
}

export async function withdrawTeam(registrationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(registrationId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_team_registration", { p_registration_id: registrationId });
  if (error) return fail(error);
  revalidatePath("/me/tickets");
  return ok(undefined, "Registration withdrawn.");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { runWaitlist } from "@/lib/waitlist";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fail, type ActionResult } from "@/lib/errors";
import { disputeSchema } from "@/lib/validation/payments";
import { notifyAdminsDispute } from "@/lib/emails/admin-alerts";

/** PAY-04/PAY-05/PAY-08: student uploads payment proof (+ student card). */
export async function submitPaymentProof(orderId: string, form: FormData): Promise<ActionResult<{ possibleDuplicate: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (user.profile.is_suspended) return { ok: false, error: "Your account is suspended." };
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Order not found." };
  if (!(await rateLimit(`proof:user:${user.id}`, 10, 3600)) || !(await rateLimit(`proof:ip:${await clientIp()}`, 30, 3600))) {
    return { ok: false, error: "Too many uploads. Please wait a while and try again." };
  }

  const result = await getPaymentProvider().submitProof({ userId: user.id, orderId, form });
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath(`/checkout/${orderId}`);
  revalidatePath("/me/tickets");
  return { ok: true, data: { possibleDuplicate: result.possibleDuplicate } };
}

/** D-064: the buyer cancels an unpaid booking (no payment sent) to book something else. */
export async function cancelBooking(orderId: string, backTo: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Order not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { p_order_id: orderId });
  if (error) return fail(error);
  await runWaitlist(); // D-071: a place may have opened
  revalidatePath("/me/tickets");
  redirect(backTo.startsWith("/e/") ? backTo : "/me/tickets");
}

/** ADM-04: "paise bheje magar approve nahi hua" – student opens a dispute for TickLO admins. */
export async function openDispute(orderId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Order not found." };
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please write a short message." };
  if (!(await rateLimit(`dispute:user:${user.id}`, 5, 86400))) return { ok: false, error: "Too many reports today." };
  const supabase = await createClient();
  const { error } = await supabase.from("disputes").insert({ order_id: orderId, user_id: user.id, message: parsed.data.message });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You already reported this order. TickLO will get back to you." };
    return fail(error);
  }
  after(() => notifyAdminsDispute(orderId)); // D-088
  revalidatePath(`/checkout/${orderId}/status`);
  return { ok: true, message: "Thanks – TickLO will look into it and contact the organizer." };
}

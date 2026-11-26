"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";

/** FES-11: an accepted team (or one whose unpaid order expired) pays now. */
export async function payTeam(registrationId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(registrationId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_team_registration", { p_registration_id: registrationId });
  if (error) return fail(error);
  const order = data as { order_id: string; status: string; existing: boolean };
  if (!order.existing) {
    if (order.status === "approved") await notifyOrderConfirmed(order.order_id);
    else await notifyPaymentInstructions(order.order_id);
  }
  redirect(order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : order.status === "awaiting_payment" ? `/checkout/${order.order_id}` : `/checkout/${order.order_id}/status`);
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

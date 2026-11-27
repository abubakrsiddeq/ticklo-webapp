"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";
import { cookies } from "next/headers";
import { after } from "next/server";
import { normalizeCode, refCookieName } from "@/lib/referrals";
import { parseRegMembers, regAnswersSchema, teamNameError } from "@/lib/validation/team";
import { runWaitlist } from "@/lib/waitlist";

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
    // D-074: emails after the response
    after(() => (order.status === "approved" ? notifyOrderConfirmed(order.order_id) : notifyPaymentInstructions(order.order_id)));
  }
  redirect(order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : order.status === "awaiting_payment" ? `/checkout/${order.order_id}` : `/checkout/${order.order_id}/status`);
}

/** D-064 / D-068: the lead changes the team (members and the team's answers) until the competition starts. */
export async function updateTeam(registrationId: string, teamName: string, members: unknown, answers: unknown = null): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(registrationId).success) return { ok: false, error: "Not allowed." };
  const name = String(teamName ?? "").trim().replace(/\s+/g, " ");
  const teamProblem = teamNameError(name);
  if (teamProblem) return { ok: false, error: teamProblem };
  const parsed = parseRegMembers(members);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const teamAnswers = answers === null ? null : regAnswersSchema.safeParse(answers);
  if (teamAnswers && !teamAnswers.success) return { ok: false, error: "Please check your answers." };
  const values = [...parsed.members.flatMap((m) => Object.values(m.answers ?? {})), ...Object.values(teamAnswers?.data ?? {})];
  if (!values.every((v) => typeof v !== "string" || !/^[0-9a-f-]{36}\//.test(v) || v.startsWith(`${user.id}/`))) {
    return { ok: false, error: "Please upload the files again." };
  }
  const clean = parsed.members;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_team_members", {
    p_registration_id: registrationId,
    p_team_name: name,
    p_members: clean,
    p_answers: teamAnswers?.data ?? null,
  });
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
  await runWaitlist(); // D-071: a place may have opened
  revalidatePath("/me/tickets");
  return ok(undefined, "Registration withdrawn.");
}

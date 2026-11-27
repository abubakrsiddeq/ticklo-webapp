"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { normalizeCode, refCookieName } from "@/lib/referrals";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";
import { buyerDetailsSchema } from "@/lib/validation/profile";
import { readUpload, uploadPrivate } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { parseRegMembers, regAnswersSchema, teamNameError } from "@/lib/validation/team";

/** Every file answer must be one this person uploaded (their own folder). */
function ownFiles(userId: string, values: unknown[]): boolean {
  return values.every((v) => typeof v !== "string" || !/^[0-9a-f-]{36}\//.test(v) || v.startsWith(`${userId}/`));
}

type RegisterTeamInput = {
  eventId: string;
  sessionId: string;
  teamName: string;
  members: unknown[];
  answers: Record<string, unknown>;
  code: string | null;
  /** D-064: the lead's own name and phone when the account has none yet */
  leaderProfile?: { full_name: string; phone: string } | null;
};

/** FES-10: register a team for a competition (pays at once, or waits for shortlisting). */
export async function registerTeam(input: RegisterTeamInput): Promise<ActionResult> {
  let next: string;
  try {
    const res = await registerTeamOrFail(input);
    if (!res.ok) return res;
    next = res.data!;
  } catch (e) {
    // D-074: never the full-page error screen; the registration may or may not have been saved
    console.error("registerTeam failed", e);
    return { ok: false, error: "We could not confirm your registration. Open My tickets to check, then try again if it is not there." };
  }
  redirect(next);
}

/** The registration itself; returns where to go next. */
async function registerTeamOrFail(input: RegisterTeamInput): Promise<ActionResult<string>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in to register." };
  if (!z.string().uuid().safeParse(input.eventId).success || !z.string().uuid().safeParse(input.sessionId).success) return { ok: false, error: "Competition not found." };
  const teamName = String(input.teamName ?? "").trim().replace(/\s+/g, " ");
  const teamProblem = teamNameError(teamName);
  if (teamProblem) return { ok: false, error: teamProblem };
  const parsed = parseRegMembers(input.members);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const members = parsed.members;
  const teamAnswers = regAnswersSchema.safeParse(input.answers ?? {});
  if (!teamAnswers.success) return { ok: false, error: "Please check your answers." };
  if (!ownFiles(user.id, [...members.flatMap((m) => Object.values(m.answers ?? {})), ...Object.values(teamAnswers.data)])) {
    return { ok: false, error: "Please upload the files again." };
  }
  const typed = normalizeCode(input.code);
  const remembered = normalizeCode((await cookies()).get(refCookieName(input.eventId))?.value);
  const supabase = await createClient();
  if (input.leaderProfile) {
    const lp = buyerDetailsSchema.safeParse(input.leaderProfile);
    if (!lp.success) return { ok: false, error: "Please add your full name and mobile number." };
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: lp.data.full_name, phone: normalizePhone(lp.data.phone) })
      .eq("id", user.id);
    if (profileError) return fail(profileError);
  }
  const { data, error } = await supabase.rpc("register_team", {
    p_session_id: input.sessionId,
    p_team_name: teamName,
    p_members: members,
    p_answers: teamAnswers.data,
    p_code: typed && typed.length <= 16 ? typed : null,
    p_ref: remembered && remembered.length <= 16 ? remembered : null,
  });
  if (error) return fail(error);
  const res = data as { registration_id: string; status: string; order: { order_id: string; status: string; existing: boolean } | null };
  const order = res.order;
  if (!order) return { ok: true, data: `/me/tickets?team=applied#teams` };
  if (!order.existing) {
    // emails (with QR codes) go out after the response, so a slow mail server never holds up the page
    after(() => (order.status === "approved" ? notifyOrderConfirmed(order.order_id) : notifyPaymentInstructions(order.order_id)));
  }
  return { ok: true, data: order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : `/checkout/${order.order_id}` };
}

/** D-068: a file for a registration form field (CV, student card…), stored privately under the user's folder. */
export async function uploadRegistrationFile(form: FormData): Promise<ActionResult<{ path: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit(`regfile:${user.id}`, 30, 3600))) return { ok: false, error: "Too many uploads. Please wait a while." };
  const file = await readUpload(form.get("file"), { label: "File", required: true, allowPdf: true });
  if (file.error || !file.file) return { ok: false, error: file.error ?? "Choose a file." };
  try {
    return { ok: true, data: { path: await uploadPrivate("registration-files", user.id, file.file) } };
  } catch (e) {
    return fail(e);
  }
}

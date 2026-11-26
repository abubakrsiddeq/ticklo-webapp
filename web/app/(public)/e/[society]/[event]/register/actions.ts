"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { normalizeCode, refCookieName } from "@/lib/referrals";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";
import type { TeamMember } from "@/lib/sessions";

const memberSchema = z.object({
  name: z.string().trim().min(2, "Name").max(80),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  roll_no: z.string().trim().max(40).optional(),
  university: z.string().trim().max(120).optional(),
});

/** FES-10: register a team for a competition (pays at once, or waits for shortlisting). */
export async function registerTeam(input: {
  eventId: string;
  sessionId: string;
  teamName: string;
  members: TeamMember[];
  answers: Record<string, string>;
  code: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in to register." };
  if (!z.string().uuid().safeParse(input.eventId).success || !z.string().uuid().safeParse(input.sessionId).success) return { ok: false, error: "Competition not found." };
  const parsed = z.array(memberSchema).min(1).max(20).safeParse(input.members);
  if (!parsed.success) return { ok: false, error: "Every team member needs a name." };
  const members = parsed.data.map((m) => ({ ...m, phone: m.phone ? (normalizePhone(m.phone) ?? m.phone) : undefined }));
  const typed = normalizeCode(input.code);
  const remembered = normalizeCode((await cookies()).get(refCookieName(input.eventId))?.value);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_team", {
    p_session_id: input.sessionId,
    p_team_name: input.teamName,
    p_members: members,
    p_answers: input.answers,
    p_code: typed && typed.length <= 16 ? typed : null,
    p_ref: remembered && remembered.length <= 16 ? remembered : null,
  });
  if (error) return fail(error);
  const res = data as { registration_id: string; status: string; order: { order_id: string; status: string; existing: boolean } | null };
  if (!res.order) redirect(`/me/tickets?team=applied#teams`);
  if (!res.order.existing) {
    if (res.order.status === "approved") await notifyOrderConfirmed(res.order.order_id);
    else await notifyPaymentInstructions(res.order.order_id);
  }
  redirect(res.order.status === "approved" ? `/checkout/${res.order.order_id}/status?new=1` : `/checkout/${res.order.order_id}`);
}

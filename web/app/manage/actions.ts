"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { notifyTeamDecision } from "@/lib/emails/notify";

// Session managers and organizers (D-044). Postgres checks can_manage_session.
const uuid = z.string().uuid();

export async function decideTeam(sessionId: string, registrationId: string, approve: boolean, reason: string | null): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !uuid.safeParse(registrationId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_team_registration", { p_registration_id: registrationId, p_approve: approve, p_reason: reason });
  if (error) return fail(error);
  if ((data as { changed?: boolean } | null)?.changed) await notifyTeamDecision(registrationId);
  revalidatePath(`/manage/${sessionId}`);
  return ok(undefined, approve ? "Team accepted – they have been emailed to pay." : "Team declined – they have been emailed.");
}

export async function saveResults(sessionId: string, results: { label: string; name: string; registration_id: string | null }[], publish: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !uuid.safeParse(sessionId).success) return { ok: false, error: "Not allowed." };
  const clean = results
    .filter((r) => r.name.trim())
    .slice(0, 10)
    .map((r) => ({ label: r.label.trim().slice(0, 40), name: r.name.trim().slice(0, 120), ...(r.registration_id && uuid.safeParse(r.registration_id).success ? { registration_id: r.registration_id } : {}) }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_session_results", { p_session_id: sessionId, p_results: clean, p_publish: publish });
  if (error) return fail(error);
  revalidatePath(`/manage/${sessionId}`);
  revalidatePath("/e", "layout");
  return ok(undefined, publish ? "Results published on the event page." : "Results saved (not public yet).");
}

export async function checkInForSession(sessionId: string, ticketId: string): Promise<ActionResult<{ result: string }>> {
  const user = await getCurrentUser();
  if (!user || !uuid.safeParse(sessionId).success || !uuid.safeParse(ticketId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manual_session_check_in", { p_ticket_id: ticketId, p_session_id: sessionId, p_device: "session page" });
  if (error) return fail(error);
  const res = data as { result: string };
  revalidatePath(`/manage/${sessionId}`);
  if (res.result === "ok") return ok(res, "Checked in.");
  if (res.result === "already_used") return { ok: false, error: "Already checked in." };
  if (res.result === "not_allowed") return { ok: false, error: "Check-in is open from when the event is live until 6 hours after it ends." };
  return { ok: false, error: "This ticket can't be checked in here." };
}

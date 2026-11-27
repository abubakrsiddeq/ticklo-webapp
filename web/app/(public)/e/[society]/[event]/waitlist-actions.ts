"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";

/** D-071: join the waitlist of a full ticket type or competition. */
export async function joinWaitlist(ticketTypeId: string | null, sessionId: string | null): Promise<ActionResult<{ position: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in to join the waitlist." };
  const id = z.string().uuid();
  if ((ticketTypeId && !id.safeParse(ticketTypeId).success) || (sessionId && !id.safeParse(sessionId).success)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_waitlist", { p_ticket_type_id: ticketTypeId, p_session_id: sessionId });
  if (error) return fail(error);
  revalidatePath("/me/tickets");
  const position = (data as { position: number }).position;
  return ok({ position }, `You are #${position} on the waitlist. We will email you when a place opens.`);
}

export async function leaveWaitlist(entryId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !z.string().uuid().safeParse(entryId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_entry_id: entryId });
  if (error) return fail(error);
  revalidatePath("/me/tickets");
  return ok(undefined, "You left the waitlist.");
}

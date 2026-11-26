"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";

/** AMB-11: a student applies to be an ambassador for an event. */
export async function applyAmbassador(eventId: string, message: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in to apply." };
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_ambassador", { p_event_id: eventId, p_message: message.slice(0, 500) || null });
  if (error) return fail(error);
  revalidatePath("/e", "layout");
  return ok(undefined, "Application sent. You will see it here once the organizer decides.");
}

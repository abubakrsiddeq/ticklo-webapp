"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";

export async function acceptInvite(token: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_org_invite", { p_token: token });
  if (error) return fail(error);
  const res = data as { org_slug: string; role: string };
  redirect(res.role === "scanner" ? "/scan?joined=1" : `/org/${res.org_slug}?joined=1`);
}

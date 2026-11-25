"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { absoluteUrl, safeNext } from "@/lib/site";
import { fieldErrors } from "@/lib/validation/common";
import { loginSchema, newPasswordSchema, resetRequestSchema, signupSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/errors";

const tooMany: ActionResult<never> = { ok: false, error: "Too many attempts. Please wait a few minutes and try again." };

/** AUTH-01 login, AUTH-07 return to the page they came from, AUTH-09 suspended users blocked */
export async function loginAction(input: unknown, next: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const ip = await clientIp();
  if (!(await rateLimit(`login:ip:${ip}`, 20, 600)) || !(await rateLimit(`login:email:${parsed.data.email}`, 8, 600))) {
    return tooMany;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const msg = /confirm/i.test(error?.message ?? "")
      ? "Please confirm your email first – check your inbox for the link."
      : "Wrong email or password.";
    return { ok: false, error: msg };
  }
  const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", data.user.id).maybeSingle();
  if (profile?.is_suspended) {
    await supabase.auth.signOut();
    return { ok: false, error: "Your account is suspended. Contact TickLO support." };
  }
  redirect(safeNext(next, "/"));
}

/** AUTH-01 signup with any email (AUTH-05); account active after the confirm link */
export async function signupAction(input: unknown, next: string): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const ip = await clientIp();
  if (!(await rateLimit(`signup:ip:${ip}`, 10, 3600))) return tooMany;

  const supabase = await createClient();
  const dest = safeNext(next, "/");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: absoluteUrl(`/auth/confirm?next=${encodeURIComponent(dest)}`),
    },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return { ok: false, error: "An account with this email already exists. Try logging in." };
    }
    if (/password/i.test(error.message)) return { ok: false, error: error.message };
    return { ok: false, error: "Could not create your account. Please try again." };
  }
  if (data.session) redirect(dest); // email confirmation turned off
  return { ok: true, data: { needsConfirmation: true } };
}

/** AUTH-03: "Password bhool gaye" → reset link by email */
export async function requestResetAction(input: unknown): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const ip = await clientIp();
  if (!(await rateLimit(`reset:ip:${ip}`, 5, 3600)) || !(await rateLimit(`reset:email:${parsed.data.email}`, 3, 3600))) {
    return tooMany;
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absoluteUrl("/auth/confirm?next=/reset-password/update"),
  });
  // Same answer whether or not the email exists (no account enumeration)
  return { ok: true, message: "If an account exists for this email, a reset link is on its way." };
}

export async function updatePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your reset link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: error.message.includes("different") ? error.message : "Could not update the password." };
  redirect("/me/tickets?password=updated");
}

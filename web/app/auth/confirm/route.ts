import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";
import { publicEnv } from "@/lib/env";

// Email links (signup confirmation AUTH-01, password reset AUTH-03).
// Works with the token_hash templates in supabase/templates (any device) and
// falls back to ?code= (PKCE, same browser) for the default Supabase templates.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), type === "recovery" ? "/reset-password/update" : "/");
  const base = publicEnv.siteUrl || url.origin;
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) return NextResponse.redirect(`${base}/login?error=link&next=${encodeURIComponent(next)}`);
  const dest = type === "recovery" ? "/reset-password/update" : next;
  return NextResponse.redirect(`${base}${dest}${type === "signup" || type === "email" ? (dest.includes("?") ? "&" : "?") + "welcome=1" : ""}`);
}

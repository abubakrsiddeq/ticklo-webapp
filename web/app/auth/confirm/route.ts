import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";
import { publicEnv } from "@/lib/env";

const RESET_PATH = "/reset-password/update";

const withWelcome = (path: string) => `${path}${path.includes("?") ? "&" : "?"}welcome=1`;

// Email links (signup confirmation AUTH-01, password reset AUTH-03) – D-052.
// 1. ?token_hash= (TickLO templates in supabase/templates): this GET does NOT use the
//    one-time token. Mail scanners (Outlook Safe Links, university gateways…) open
//    links before the person does and would burn it, so we show /confirm-email with a
//    button; the token is only used when a person presses it (POST).
// 2. ?code= (default Supabase templates, PKCE): Supabase already confirmed the email
//    before sending us here. The code only turns into a session in the browser that
//    signed up, so on another phone/browser we say "confirmed – please log in"
//    instead of "expired".
// 3. ?error_code= (Supabase could not verify: link too old or already used).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), type === "recovery" ? RESET_PATH : "/");
  const isReset = type === "recovery" || next === RESET_PATH;
  const base = publicEnv.siteUrl || url.origin;
  const loginNext = `next=${encodeURIComponent(isReset ? "/" : next)}`;

  if (tokenHash && type) {
    const q = new URLSearchParams({ token_hash: tokenHash, type, next });
    return NextResponse.redirect(`${base}/confirm-email?${q}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${base}${isReset ? RESET_PATH : withWelcome(next)}`);
    return NextResponse.redirect(isReset ? `${base}/reset-password?error=device` : `${base}/login?confirmed=1&${loginNext}`);
  }

  return NextResponse.redirect(isReset ? `${base}/reset-password?error=expired` : `${base}/login?error=link&${loginNext}`);
}

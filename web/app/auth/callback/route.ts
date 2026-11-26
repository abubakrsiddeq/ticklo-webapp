import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";
import { publicEnv } from "@/lib/env";
import { sellerLandingPath } from "@/lib/seller-landing";

// OAuth (Google, AUTH-02) and PKCE email links land here with ?code=...
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/");
  const base = publicEnv.siteUrl || url.origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await supabase.from("profiles").select("is_suspended").eq("id", data.user.id).maybeSingle();
      if (profile?.is_suspended) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${base}/login?error=suspended`);
      }
      // Sellers with an event today/tomorrow go straight to the Sell screen (D-042)
      const sell = next === "/" ? await sellerLandingPath(supabase).catch(() => null) : null;
      return NextResponse.redirect(`${base}${sell ?? next}`);
    }
  }
  return NextResponse.redirect(`${base}/login?error=link&next=${encodeURIComponent(next)}`);
}

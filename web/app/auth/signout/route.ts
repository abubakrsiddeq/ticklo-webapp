import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

async function signOut(request: NextRequest, reason?: string | null) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base = publicEnv.siteUrl || request.nextUrl.origin;
  const target = reason === "suspended" ? "/login?error=suspended" : "/";
  return NextResponse.redirect(`${base}${target}`, { status: 303 });
}

export async function POST(request: NextRequest) {
  return signOut(request);
}

// Used when a suspended user is detected (AUTH-09)
export async function GET(request: NextRequest) {
  return signOut(request, request.nextUrl.searchParams.get("reason"));
}

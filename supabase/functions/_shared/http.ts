// Shared helpers for TickLO Edge Functions (Deno).
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.119.2";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  return null;
}

export function env(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing environment variable ${name}`);
}

let adminClient: SupabaseClient | null = null;

/** Service-role client. Lives only inside the Edge Function runtime. */
export function admin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** The signed-in user from the `Authorization: Bearer <jwt>` header, or null. */
export async function getUser(req: Request): Promise<User | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

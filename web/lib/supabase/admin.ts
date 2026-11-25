import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/database.types";

let adminClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client: BYPASSES Row Level Security. Server only (NFR-04).
 * Use it only after checking permissions in code, for things RLS cannot do
 * (uploads to private buckets, signed URLs, service-only functions, emails).
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (!serverEnv.serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (see web/.env.example).");
  }
  if (!adminClient) {
    adminClient = createSupabaseClient<Database>(requirePublicEnv().supabaseUrl, serverEnv.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

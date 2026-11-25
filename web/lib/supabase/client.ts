"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

let browserClient: SupabaseClient<Database> | null = null;

/** Browser Supabase client (anon key + the user's session cookie). */
export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

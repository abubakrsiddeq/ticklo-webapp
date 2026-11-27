import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OTHER_UNIVERSITY } from "@/lib/validation/university";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * D-057: turn the picker value into a university id. "other" files (or reuses)
 * a pending university that TickLO admins review; it only shows publicly once approved.
 */
export async function resolveUniversityId(
  supabase: Supabase,
  v: { university_id: string; new_university_name?: string; new_university_city?: string },
): Promise<{ id: string | null; error?: unknown }> {
  if (v.university_id !== OTHER_UNIVERSITY) return { id: v.university_id || null };
  const { data, error } = await supabase.rpc("request_university", {
    p_name: v.new_university_name ?? "",
    p_city: v.new_university_city ?? "",
  });
  if (error) return { id: null, error };
  return { id: data };
}

import { Info, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

/** D-084: the banner an admin writes in Admin → Settings, shown above every page's header. */
export async function SiteAnnouncement() {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("announcement, announcement_tone, announcement_active").eq("id", 1).maybeSingle();
  if (!data?.announcement_active || !data.announcement) return null;
  const warning = data.announcement_tone === "warning";
  const Icon = warning ? TriangleAlert : Info;
  return (
    <div
      role="status"
      className={cn(
        "no-print px-4 py-2 text-center text-sm font-medium",
        warning ? "bg-warning-soft text-warning" : "bg-navy text-white",
      )}
    >
      <span className="inline-flex max-w-6xl items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{data.announcement}</span>
      </span>
    </div>
  );
}

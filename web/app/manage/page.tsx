import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { kindEmoji } from "@/lib/sessions";

// FES-12: sessions I manage (competition heads, workshop leads)
export default async function ManageHomePage() {
  await requireUser("/manage");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_managed_sessions");
  const list = data ?? [];
  return (
    <div className="grid gap-4">
      <h1 className="text-3xl font-bold text-navy">My sessions</h1>
      {list.length ? (
        <ul className="grid gap-3">
          {list.map((s) => (
            <li key={s.session_id}>
              <Link href={`/manage/${s.session_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] hover:bg-secondary/50">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">
                    {kindEmoji(s.kind)} {s.session_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {s.event_name} · {s.org_name} · {formatShortDateTime(s.starts_at)}
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={ClipboardList} title="No sessions" description="When an organizer makes you the manager of a workshop or competition, it shows up here." />
      )}
    </div>
  );
}

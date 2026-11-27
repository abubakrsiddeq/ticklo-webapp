import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { MyHistoryList } from "@/components/history/my-history-list";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My history", robots: { index: false } };

const PAGE_SIZE = 50;

// D-078: every approval and rejection about the student's own payments, reports, teams and applications
export default async function MyHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("/me/history");
  const sp = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_decision_history", { p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid gap-5">
      <div>
        <Link href="/me/tickets" className="text-sm text-muted-foreground hover:underline">
          ← My tickets
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">My history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every decision about your payments, team registrations, ambassador applications and reports, with who decided, when and why.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Your history could not be loaded. Please refresh the page.</p>
      ) : rows.length ? (
        <MyHistoryList rows={rows} />
      ) : (
        <EmptyState
          icon={History}
          title="Nothing here yet"
          description="When an organizer approves or rejects your payment or registration, it shows up here."
          action={
            <Button asChild variant="brand">
              <Link href="/events">Find events</Link>
            </Button>
          }
        />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Pages">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/me/history?page=${page - 1}`}>Newer</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={`/me/history?page=${page + 1}`}>Older</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

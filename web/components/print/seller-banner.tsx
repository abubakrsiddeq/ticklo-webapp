import { Suspense } from "react";
import Link from "next/link";
import { ScanLine, Ticket } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * "You are a seller for … – open the scanner" (D-042). Shown on the home page and
 * My tickets to people who sell printed tickets (not to organizers – they have the
 * dashboard). Streams in, never holds the page back.
 */
export function SellerBanner({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <SellerBannerContent className={className} />
    </Suspense>
  );
}

async function SellerBannerContent({ className }: { className?: string }) {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data: events } = await supabase.rpc("my_sell_events");
  const mine = (events ?? []).filter((e) => e.access === "seller");
  if (!mine.length) return null;
  const stocks = await Promise.all(mine.slice(0, 3).map((e) => supabase.rpc("my_print_stock", { p_event_id: e.event_id })));
  return (
    <div className={cn("grid gap-3", className)}>
      {mine.slice(0, 3).map((e, i) => {
        const left = (stocks[i].data ?? []).filter((s) => s.sale_status === "in_stock" && s.status === "valid").length;
        return (
          <Link
            key={e.event_id}
            href={`/sell/${e.event_id}`}
            className="flex items-center justify-between gap-3 rounded-2xl bg-navy p-4 text-white shadow-card ring-1 ring-navy/10 transition-colors hover:bg-navy-soft"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-navy">
                <Ticket className="size-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">You sell tickets for {e.event_name}</p>
                <p className="text-sm text-slate-300">{left ? `${left} ${left === 1 ? "ticket" : "tickets"} left to sell` : "All your tickets are sold"}</p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-navy">
              <ScanLine className="size-4" aria-hidden /> Open scanner
            </span>
          </Link>
        );
      })}
    </div>
  );
}

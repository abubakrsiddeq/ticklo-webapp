import { Suspense } from "react";
import Link from "next/link";
import { Megaphone, Ticket } from "lucide-react";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * "You sell tickets for … – Sell tickets" (D-042, D-086). Shown on the home page and
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
  const stocks = await Promise.all(
    mine.slice(0, 3).map((e) => (e.has_printed ? supabase.rpc("my_print_stock", { p_event_id: e.event_id }) : Promise.resolve({ data: [] as { sale_status: string | null; status: string }[] }))),
  );
  return (
    <div className={cn("grid gap-3", className)}>
      {mine.slice(0, 3).map((e, i) => {
        const left = (stocks[i].data ?? []).filter((s) => s.sale_status === "in_stock" && s.status === "valid").length;
        // D-043: ambassadors without paper tickets go to their link & rank
        const promote = !e.has_printed;
        return (
          <Link
            key={e.event_id}
            href={promote ? `/sell/${e.event_id}/promote` : `/sell/${e.event_id}`}
            className="flex items-center justify-between gap-3 rounded-2xl bg-navy p-4 text-white shadow-card ring-1 ring-navy/10 transition-colors hover:bg-navy-soft"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-navy">
                {promote ? <Megaphone className="size-6" aria-hidden /> : <Ticket className="size-6" aria-hidden />}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{promote ? `You are an ambassador for ${e.event_name}` : `You sell tickets for ${e.event_name}`}</p>
                <p className="text-sm text-slate-300">
                  {promote
                    ? `Your code: ${e.ref_code ?? ""} – share your link`
                    : left
                      ? `${left} ${left === 1 ? "ticket" : "tickets"} left to sell`
                      : "All your tickets are sold"}
                </p>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-navy">
              {promote ? <Megaphone className="size-4" aria-hidden /> : <Ticket className="size-4" aria-hidden />} {promote ? "My link" : "Sell tickets"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Megaphone, ShieldX, Ticket } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Sell printed tickets", robots: { index: false } };

// SAL-03: events where the user can sell printed tickets
export default async function SellHomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireUser("/sell");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_sell_events");
  const list = data ?? [];
  const href = (e: (typeof list)[number]) => (e.has_printed ? `/sell/${e.event_id}` : `/sell/${e.event_id}/promote`);
  if (list.length === 1 && !sp.list) redirect(href(list[0]));
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      {list.length ? (
        <>
          <h1 className="mb-4 font-heading text-2xl font-bold">Choose an event</h1>
          <ul className="grid gap-3">
            {list.map((e) => (
              <li key={e.event_id}>
                <Link href={href(e)} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 text-navy hover:bg-slate-100">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.event_name}</p>
                    <p className="text-sm text-slate-600">
                      {e.org_name} · {formatDate(e.starts_at)}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold text-brand-strong">
                    {e.has_printed ? <Ticket className="size-5" aria-hidden /> : <Megaphone className="size-5" aria-hidden />}
                    {e.has_printed ? "Sell" : "Promote"} <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldX className="size-14 text-slate-300" aria-hidden />
          <h1 className="font-heading text-2xl font-bold">No tickets to sell</h1>
          <p className="text-slate-300">Ask the organizer to add you as a seller or ambassador for their event (event → Ambassadors).</p>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, ScanLine, ShieldX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventRange } from "@/lib/format";

export const metadata: Metadata = { title: "Scanner", robots: { index: false } };

// SCN-01: only users who currently have scanner access; pick an event
export default async function ScanHomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireUser("/scan");
  const supabase = await createClient();
  const { data: events } = await supabase.rpc("my_scan_events");
  const list = events ?? [];
  if (list.length === 1 && !sp.joined && !sp.list) redirect(`/scan/${list[0].event_id}`);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      {sp.joined ? <p className="mb-4 rounded-lg bg-white/10 p-3 text-sm">Welcome to the team! You&apos;ll see events here once an organizer assigns you.</p> : null}
      {list.length ? (
        <>
          <h1 className="mb-4 font-heading text-2xl font-bold">Choose an event</h1>
          <ul className="grid gap-3">
            {list.map((e) => (
              <li key={e.event_id}>
                <Link href={`/scan/${e.event_id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 text-navy hover:bg-slate-100">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.event_name}</p>
                    <p className="text-sm text-slate-600">{e.org_name}</p>
                    <p className="text-sm text-slate-600">{formatEventRange(e.starts_at, e.ends_at)}</p>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold text-brand-strong">
                    <ScanLine className="size-5" aria-hidden /> Scan <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldX className="size-14 text-slate-300" aria-hidden />
          <h1 className="font-heading text-2xl font-bold">No events to scan</h1>
          <p className="text-slate-300">
            You don&apos;t have scanner access right now. Ask the event organizer to assign you. Access ends 6 hours after an event.
          </p>
        </div>
      )}
    </div>
  );
}

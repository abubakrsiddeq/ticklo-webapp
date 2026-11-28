import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone, ShieldX } from "lucide-react";
import { ModeCard } from "@/components/event-day/mode-card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventRange } from "@/lib/format";

export const metadata: Metadata = { title: "Event day", robots: { index: false } };

interface DayEvent {
  id: string;
  name: string;
  org: string;
  startsAt: string;
  endsAt: string | null;
  gate: boolean;
  sessionsOnly: boolean;
  desk: boolean;
  promote: boolean;
}

/**
 * D-086: the one place for event-day work. Each event shows the jobs this person can
 * do there: "At the gate" (let people in) and "At the desk" (sell paper tickets).
 * With exactly one job in total it opens that screen straight away.
 */
export default async function EventDayPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireUser("/event-day");
  const supabase = await createClient();
  const [{ data: scan }, { data: sell }] = await Promise.all([supabase.rpc("my_scan_events"), supabase.rpc("my_sell_events")]);

  const byId = new Map<string, DayEvent>();
  for (const e of scan ?? []) {
    byId.set(e.event_id, { id: e.event_id, name: e.event_name, org: e.org_name, startsAt: e.starts_at, endsAt: e.ends_at, gate: true, sessionsOnly: e.sessions_only, desk: false, promote: false });
  }
  for (const e of sell ?? []) {
    const row = byId.get(e.event_id) ?? { id: e.event_id, name: e.event_name, org: e.org_name, startsAt: e.starts_at, endsAt: null, gate: false, sessionsOnly: false, desk: false, promote: false };
    row.desk = row.desk || e.has_printed;
    row.promote = row.promote || Boolean(e.ref_code);
    byId.set(e.event_id, row);
  }
  const list = [...byId.values()].filter((e) => e.gate || e.desk || e.promote).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Exactly one job → open it (the old /scan and /sell behaviour). ?list=1 always shows the page.
  const jobs = list.flatMap((e) => [
    ...(e.gate ? [`/scan/${e.id}`] : []),
    ...(e.desk ? [`/sell/${e.id}`] : []),
    ...(!e.gate && !e.desk && e.promote ? [`/sell/${e.id}/promote`] : []),
  ]);
  if (jobs.length === 1 && !sp.list && !sp.joined) redirect(jobs[0]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      {sp.joined ? (
        <p className="mb-4 rounded-lg bg-white/10 p-3 text-sm">Welcome to the team! Your events show here once an organizer adds you to one.</p>
      ) : null}
      {list.length ? (
        <>
          <h1 className="font-heading text-3xl font-bold">Where are you working?</h1>
          <p className="mb-5 text-sm text-slate-300">Pick your job. Each one opens its own screen with its own colour.</p>
          <div className="grid gap-8">
            {list.map((e) => (
              <section key={e.id} className="grid gap-3" aria-label={e.name}>
                <div>
                  <h2 className="truncate text-lg font-semibold">{e.name}</h2>
                  <p className="text-sm text-slate-300">
                    {e.org} · {formatEventRange(e.startsAt, e.endsAt ?? e.startsAt)}
                  </p>
                </div>
                {e.gate ? (
                  <ModeCard
                    eventId={e.id}
                    mode="gate"
                    href={`/scan/${e.id}`}
                    job={e.sessionsOnly ? "Let people into your sessions. Scan each person's ticket." : undefined}
                  />
                ) : null}
                {e.desk ? <ModeCard eventId={e.id} mode="desk" href={`/sell/${e.id}`} /> : null}
                {e.promote ? (
                  <Link href={`/sell/${e.id}/promote`} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15">
                    <Megaphone className="size-4 text-brand-light" aria-hidden /> Ambassador: my link &amp; rank
                  </Link>
                ) : null}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldX className="size-14 text-slate-300" aria-hidden />
          <h1 className="font-heading text-2xl font-bold">Nothing for event day yet</h1>
          <p className="text-slate-300">
            Ask the organizer to add you: as a gate volunteer (to let people in) or as a seller (to sell paper tickets). Gate access ends 6 hours after an event.
          </p>
        </div>
      )}
    </div>
  );
}

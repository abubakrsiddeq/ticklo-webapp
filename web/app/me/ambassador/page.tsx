import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Megaphone, Trophy, University } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPKR } from "@/lib/format";
import { rewardDue } from "@/lib/referrals";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "My ambassador page" };

/** AMB-13/AMB-14: every event I was an ambassador for, my totals, and (if I am one) my TickLO campus ambassador code. */
export default async function MyAmbassadorPage() {
  const user = await requireUser("/me/ambassador");
  const supabase = await createClient();
  const [{ data: events }, { data: campusRows }, { data: societies }] = await Promise.all([
    supabase.rpc("my_ambassador_events"),
    supabase.rpc("campus_ambassador_stats", { p_user_id: user.id }),
    supabase.rpc("my_campus_societies"),
  ]);
  const list = events ?? [];
  const campus = campusRows?.[0] ?? null;
  const now = serverNow();
  const totals = list.reduce(
    (t, e) => ({
      tickets: t.tickets + Number(e.credited_tickets),
      reward: t.reward + Number(e.reward_paisa),
      paid: t.paid + Number(e.paid_paisa),
      wins: t.wins + (Number(e.rank) === 1 && Number(e.credited_tickets) > 0 && new Date(e.ends_at).getTime() < now ? 1 : 0),
    }),
    { tickets: 0, reward: 0, paid: 0, wins: 0 },
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-3xl font-bold text-navy">My ambassador page</h1>
        <p className="text-muted-foreground">Your links, ranks and rewards for every event.</p>
      </div>

      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
            <div className="text-sm text-muted-foreground">Events</div>
            <div className="font-heading text-2xl font-bold text-navy">{list.length}</div>
          </div>
          <div className="rounded-2xl bg-brand-soft p-4 shadow-card ring-1 ring-navy/[0.06]">
            <div className="text-sm text-muted-foreground">Tickets you brought</div>
            <div className="font-heading text-2xl font-bold text-navy">{totals.tickets}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
            <div className="text-sm text-muted-foreground">Rewards earned</div>
            <div className="font-heading text-2xl font-bold text-navy">{formatPKR(totals.reward)}</div>
            <div className="text-xs text-muted-foreground">{formatPKR(rewardDue(totals.reward, totals.paid))} still to get</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
            <div className="text-sm text-muted-foreground">Top seller</div>
            <div className="flex items-center gap-2 font-heading text-2xl font-bold text-navy">
              {totals.wins} <Trophy className="size-5 text-brand-strong" aria-hidden />
            </div>
            <div className="text-xs text-muted-foreground">events where you were #1</div>
          </div>
        </div>
      ) : null}

      {list.length ? (
        <ul className="grid gap-3">
          {list.map((e) => {
            const over = new Date(e.ends_at).getTime() < now;
            return (
              <li key={e.event_id}>
                <Link
                  href={`/sell/${e.event_id}/promote`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] transition-colors hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                      <span className="truncate">{e.event_name}</span>
                      {e.event_status === "cancelled" ? <StatusBadge status="cancelled" /> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {e.org_name} · {formatDate(e.starts_at)} · code <span className="font-mono">{e.ref_code}</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      {Number(e.credited_tickets) > 0 ? `#${e.rank} of ${e.ambassadors}` : "No tickets yet"} · {e.credited_tickets} tickets
                      {Number(e.pending_tickets) ? ` (+${e.pending_tickets} in review)` : ""}
                      {Number(e.reward_paisa) ? ` · ${formatPKR(Number(e.reward_paisa))} earned` : ""}
                      {over ? " · ended" : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : !campus ? (
        <EmptyState
          icon={Megaphone}
          title="Not an ambassador yet"
          description="When a society makes you an ambassador (or accepts your application on an event page), your link, rank and rewards show up here."
        />
      ) : null}

      {campus ? (
        <section className="grid gap-3 rounded-3xl bg-navy p-5 text-white shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-navy">
              <University className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold">TickLO campus ambassador</h2>
              <p className="text-sm text-slate-300">
                Societies type your code when they register on TickLO.{campus.university ? ` Campus: ${campus.university}.` : ""}
                {!campus.active ? " Your code is turned off right now." : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 text-navy">
            <span className="flex-1 font-mono text-2xl font-bold tracking-wider">{campus.code}</span>
            <CopyButton value={campus.code} label="Campus ambassador code" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/10 p-3">
              <p className="font-heading text-xl font-bold">{campus.societies}</p>
              <p className="text-xs text-slate-300">societies</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="font-heading text-xl font-bold">{campus.published_events}</p>
              <p className="text-xs text-slate-300">events live</p>
            </div>
            <div className="rounded-xl bg-white/10 p-3">
              <p className="font-heading text-xl font-bold">{campus.paid_tickets}</p>
              <p className="text-xs text-slate-300">paid tickets</p>
            </div>
          </div>
          {societies?.length ? (
            <ul className="grid gap-1 text-sm">
              {societies.map((o) => (
                <li key={o.org_slug} className="flex justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="truncate">{o.org_name}</span>
                  <span className="text-slate-300">
                    {o.status} · {o.events} events
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

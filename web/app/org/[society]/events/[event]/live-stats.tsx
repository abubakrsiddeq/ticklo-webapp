"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Banknote, Hourglass, Ticket, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { formatPKR } from "@/lib/format";

export interface EventStats {
  capacity: number;
  checked_in: number;
  total_tickets: number;
  pending_review: number;
  awaiting_payment: number;
  approved_orders: number;
  collected_paisa: number;
  printed_tickets?: number;
  by_type: { ticket_type_id: string; name: string; price_paisa: number; quantity: number; sold: number; held: number; printed?: number; checked_in: number }[];
}

function Stat({ icon: Icon, label, value, sub, href }: { icon: typeof Ticket; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="flex h-full flex-col gap-1 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <span className="font-heading text-2xl font-bold text-navy tabular-nums">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

/** ORG-08: live numbers – check-ins update without a page refresh (Supabase Realtime + polling fallback). */
export function LiveStats({ eventId, initial, paymentsHref }: { eventId: string; initial: EventStats; paymentsHref: string }) {
  const [stats, setStats] = useState(initial);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase.rpc("event_stats", { p_event_id: eventId });
        if (data) setStats(data as unknown as EventStats);
      }, 300);
    };
    const channel = supabase
      .channel(`event-stats-${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins", filter: `event_id=eq.${eventId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `event_id=eq.${eventId}` }, refresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(refresh, 20000);
    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const capPct = stats.capacity ? Math.round((stats.total_tickets / stats.capacity) * 100) : 0;
  const inPct = stats.total_tickets ? Math.round((stats.checked_in / stats.total_tickets) * 100) : 0;

  return (
    <section className="grid gap-4" aria-label="Live event numbers">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`size-2 rounded-full ${live ? "bg-brand animate-pulse" : "bg-slate-300"}`} aria-hidden />
        {live ? "Live" : "Updating every 20 s"}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Hourglass} label="Review baqi" value={String(stats.pending_review)} sub={`${stats.awaiting_payment} awaiting payment`} href={paymentsHref} />
        <Stat
          icon={Ticket}
          label="Tickets sold"
          value={String(stats.total_tickets)}
          sub={`${capPct}% of ${stats.capacity} capacity${stats.printed_tickets ? ` · ${stats.printed_tickets} printed` : ""}`}
        />
        <Stat icon={Banknote} label="Collected" value={formatPKR(stats.collected_paisa)} sub={`${stats.approved_orders} approved online orders${stats.printed_tickets ? " (cash for printed tickets not included)" : ""}`} />
        <Stat icon={Users} label="Checked in" value={`${stats.checked_in}/${stats.total_tickets}`} sub={`${inPct}% arrived`} />
      </div>
      <div className="grid gap-2 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
        <div className="flex justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium text-navy">
            <Activity className="size-4" aria-hidden /> Capacity used
          </span>
          <span className="tabular-nums">{capPct}%</span>
        </div>
        <Progress value={capPct} aria-label="Capacity used" />
      </div>
      {stats.by_type.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ticket type</th>
                <th className="px-4 py-2 text-right font-medium">Sold</th>
                <th className="px-4 py-2 text-right font-medium">On hold</th>
                <th className="px-4 py-2 text-right font-medium">Printed</th>
                <th className="px-4 py-2 text-right font-medium">Left</th>
                <th className="px-4 py-2 text-right font-medium">Checked in</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.by_type.map((t) => (
                <tr key={t.ticket_type_id}>
                  <td className="px-4 py-2">
                    {t.name} <span className="text-muted-foreground">· {formatPKR(t.price_paisa, { freeLabel: "Free" })}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.sold}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.held}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.printed ?? 0}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.max(0, t.quantity - t.sold - t.held - (t.printed ?? 0))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.checked_in}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Ticket } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Poster } from "@/components/poster";
import { InstallHint } from "@/components/install-hint";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { effectiveStatus } from "@/lib/queries/orders";
import { formatEventRange, formatPKR } from "@/lib/format";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "My tickets", robots: { index: false } };

// TKT-01: upcoming and past tickets, with event, date, ticket type, status
export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser("/me/tickets");
  const supabase = await createClient();
  const [{ data: tickets }, { data: orders }] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        `id, code, status, checked_in_at, holder_name, created_at,
         ticket_types!inner ( name ),
         events!inner ( id, name, slug, starts_at, ends_at, venue, status, poster_url, organizations!inner ( slug, name ) )`,
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("id, ref_code, status, total_paisa, hold_expires_at, created_at, events!inner ( name, ends_at )")
      .eq("user_id", user.id)
      .in("status", ["awaiting_payment", "under_review", "rejected"])
      .order("created_at", { ascending: false }),
  ]);

  const now = serverNow();
  const pending = (orders ?? []).filter(
    (o) => new Date(o.events.ends_at).getTime() > now && effectiveStatus(o, now) !== "expired",
  );

  type T = NonNullable<typeof tickets>[number];
  const byEvent = new Map<string, { event: T["events"]; tickets: T[] }>();
  for (const t of tickets ?? []) {
    const g = byEvent.get(t.events.id) ?? { event: t.events, tickets: [] };
    g.tickets.push(t);
    byEvent.set(t.events.id, g);
  }
  const groups = [...byEvent.values()];
  const upcoming = groups
    .filter((g) => new Date(g.event.ends_at).getTime() >= now)
    .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
  const past = groups
    .filter((g) => new Date(g.event.ends_at).getTime() < now)
    .sort((a, b) => b.event.starts_at.localeCompare(a.event.starts_at));

  const Group = ({ g, dim }: { g: (typeof groups)[number]; dim?: boolean }) => (
    <section className={`overflow-hidden rounded-xl border bg-white ${dim ? "opacity-80" : ""}`}>
      <div className="flex gap-3 p-3">
        <Poster src={g.event.poster_url} name={g.event.name} className="size-20 shrink-0 rounded-lg" sizes="80px" />
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-semibold text-navy">{g.event.name}</h2>
          <p className="text-sm text-muted-foreground">{g.event.organizations.name}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-700">
            <CalendarDays className="size-4 shrink-0" aria-hidden /> {formatEventRange(g.event.starts_at, g.event.ends_at)}
          </p>
          <p className="flex items-center gap-1 text-sm text-slate-700">
            <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{g.event.venue}</span>
          </p>
        </div>
      </div>
      <ul className="divide-y border-t">
        {g.tickets.map((t, i) => (
          <li key={t.id}>
            <Link href={`/me/tickets/${t.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60">
              <span className="flex items-center gap-2">
                <Ticket className="size-4 text-brand-strong" aria-hidden />
                <span className="font-medium">{t.ticket_types.name}</span>
                <span className="text-sm text-muted-foreground">#{i + 1} · {t.code}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={g.event.status === "cancelled" ? "cancelled" : t.status} />
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-navy">My tickets</h1>
      {upcoming.length ? <InstallHint /> : null}
      {sp.password === "updated" ? (
        <Alert>
          <AlertDescription>Your password was updated.</AlertDescription>
        </Alert>
      ) : null}

      {pending.length ? (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold text-navy">Bookings in progress</h2>
          {pending.map((o) => {
            const st = effectiveStatus(o, now);
            return (
              <Link
                key={o.id}
                href={st === "awaiting_payment" ? `/checkout/${o.id}` : `/checkout/${o.id}/status`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4 hover:bg-secondary/60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-navy">{o.events.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {o.ref_code} · {formatPKR(o.total_paisa, { freeLabel: "Free" })}
                  </p>
                </div>
                <StatusBadge status={st} />
              </Link>
            );
          })}
        </section>
      ) : null}

      {upcoming.length ? (
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold text-navy">Upcoming</h2>
          {upcoming.map((g) => (
            <Group key={g.event.id} g={g} />
          ))}
        </div>
      ) : !pending.length ? (
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="When you book an event, your tickets will appear here."
          action={
            <Button asChild variant="brand">
              <Link href="/events">Find events</Link>
            </Button>
          }
        />
      ) : null}

      {past.length ? (
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold text-navy">Past</h2>
          {past.map((g) => (
            <Group key={g.event.id} g={g} dim />
          ))}
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, Pill } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { EventAdminActions, countOf } from "../event-admin-actions";

export const metadata: Metadata = { title: "Events" };

const FILTERS = [
  { key: "upcoming", label: "Upcoming (published)" },
  { key: "paused", label: "Sales paused" },
  { key: "pending_review", label: "Waiting for approval" },
  { key: "draft", label: "Drafts" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

// D-084: every event of every society, with the admin's controls
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/admin/events");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 100);
  const filter: Filter = FILTERS.some((f) => f.key === sp.show) ? (sp.show as Filter) : "upcoming";
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("events")
    .select(
      "id, name, slug, status, starts_at, ends_at, sales_paused_at, sales_paused_reason, organizations!inner ( id, name, slug, status, deleted_at ), orders(count), tickets(count), print_batches(count), team_registrations(count)",
    )
    .limit(100);
  if (q) query = query.ilike("name", `%${q}%`);
  if (filter === "upcoming") query = query.eq("status", "published").gt("ends_at", nowIso).order("starts_at");
  else if (filter === "paused") query = query.not("sales_paused_at", "is", null).eq("status", "published").gt("ends_at", nowIso).order("starts_at");
  else if (filter === "past") query = query.eq("status", "published").lte("ends_at", nowIso).order("starts_at", { ascending: false });
  else if (filter === "all") query = query.order("starts_at", { ascending: false });
  else query = query.eq("status", filter).order("starts_at", { ascending: false });
  const { data: events } = await query;

  return (
    <div className="grid gap-4">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Event name" className="pl-9" />
        </label>
        <select name="show" defaultValue={filter} className="h-11 rounded-lg border border-input bg-white px-3 text-sm" aria-label="Show">
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      <div className="grid gap-2">
        {(events ?? []).map((e) => {
          const org = e.organizations;
          const orgLive = !org.deleted_at;
          const bookings = countOf(e.orders);
          const hasBookings = bookings + countOf(e.tickets) + countOf(e.print_batches) + countOf(e.team_registrations) > 0;
          return (
            <div key={e.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-navy">
                  {e.status === "published" && org.status === "approved" && orgLive ? (
                    <Link href={`/e/${org.slug}/${e.slug}`} className="hover:underline">
                      {e.name}
                    </Link>
                  ) : (
                    e.name
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  <Link href={`/admin/societies/${org.id}`} className="underline">
                    {org.name}
                  </Link>{" "}
                  · {formatShortDateTime(e.starts_at)} · {bookings} order{bookings === 1 ? "" : "s"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <StatusBadge status={e.status} />
                  {e.sales_paused_at ? <Pill tone="warning">Sales paused{e.sales_paused_reason ? `: ${e.sales_paused_reason}` : ""}</Pill> : null}
                  {org.deleted_at ? <Pill tone="danger">Society deleted</Pill> : org.status === "suspended" ? <Pill tone="danger">Society suspended</Pill> : null}
                </div>
              </div>
              <EventAdminActions event={{ ...e, hasBookings }} orgSlug={org.slug} orgLive={orgLive} />
            </div>
          );
        })}
      </div>
      {!events?.length ? <p className="text-sm text-muted-foreground">No events found.</p> : null}
      {events?.length === 100 ? <p className="text-xs text-muted-foreground">Showing 100. Search to narrow down.</p> : null}
    </div>
  );
}

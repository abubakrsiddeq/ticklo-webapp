import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, Pill } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Societies" };

const FILTERS = [
  { key: "", label: "All (not deleted)" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "suspended", label: "Suspended" },
  { key: "rejected", label: "Rejected" },
  { key: "deleted", label: "Deleted" },
] as const;

// D-084: every society, with search and status filter
export default async function AdminSocietiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/admin/societies");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 100);
  const filter = FILTERS.some((f) => f.key === sp.status) ? (sp.status as string) : "";
  const supabase = await createClient();

  let query = supabase
    .from("organizations")
    .select(
      "id, name, slug, status, type, created_at, deleted_at, suspended_reason, universities ( short_name, name ), organization_members ( role, profiles ( full_name, email ) ), events ( id )",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.or(`name.ilike.%${q}%,slug.ilike.%${q.toLowerCase()}%`);
  if (filter === "deleted") query = query.not("deleted_at", "is", null);
  else {
    query = query.is("deleted_at", null);
    if (filter) query = query.eq("status", filter as "approved" | "pending" | "suspended" | "rejected");
  }
  const { data: orgs } = await query;

  return (
    <div className="grid gap-4">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search societies</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Society name or link" className="pl-9" />
        </label>
        <select name="status" defaultValue={filter} className="h-11 rounded-lg border border-input bg-white px-3 text-sm" aria-label="Status">
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Society</th>
              <th className="px-3 py-2 font-medium">University</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Events</th>
              <th className="px-3 py-2 font-medium">Registered</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(orgs ?? []).map((o) => {
              // The generated types see the one-owner index as one-to-one; it is really a list.
              type Member = { role: string; profiles: { full_name: string | null; email: string | null } | null };
              const members = ([] as Member[]).concat((o.organization_members ?? []) as Member | Member[]);
              const owner = members.find((m) => m.role === "owner")?.profiles;
              return (
                <tr key={o.id}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/societies/${o.id}`} className="font-medium text-navy hover:underline">
                      {o.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      /{o.slug}
                      {o.type === "department" ? " · department" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{o.universities?.short_name ?? o.universities?.name ?? "–"}</td>
                  <td className="px-3 py-2">
                    {owner?.full_name ?? "–"}
                    <div className="text-xs text-muted-foreground">{owner?.email ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{o.events?.length ?? 0}</td>
                  <td className="px-3 py-2">{formatShortDateTime(o.created_at)}</td>
                  <td className="px-3 py-2">
                    {o.deleted_at ? <Pill tone="danger">Deleted</Pill> : <StatusBadge status={o.status} />}
                    {o.status === "suspended" && o.suspended_reason ? <div className="max-w-56 truncate text-xs text-muted-foreground">{o.suspended_reason}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!orgs?.length ? <p className="text-sm text-muted-foreground">No societies found.</p> : null}
      {orgs?.length === 100 ? <p className="text-xs text-muted-foreground">Showing the newest 100. Search to find others.</p> : null}
    </div>
  );
}

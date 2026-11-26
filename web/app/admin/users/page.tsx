import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, Pill } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { SuspendButton } from "../suspend-button";

export const metadata: Metadata = { title: "Users" };

// ADM-06: search, suspend / restore. D-037: open a user to change their roles
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireAdmin("/admin/users");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 100);
  const filter = sp.filter;
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, is_admin, is_suspended, suspended_reason, deletion_requested_at, created_at, organization_members(role, organizations(name))")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) {
    if (q.includes("@")) query = query.ilike("email", `%${q.toLowerCase()}%`);
    else if (/^[+\d\s-]{6,}$/.test(q)) query = query.ilike("phone", `%${(normalizePhone(q) ?? q).replace(/\D/g, "").slice(-10)}%`);
    else query = query.ilike("full_name", `%${q}%`);
  }
  if (filter === "suspended") query = query.eq("is_suspended", true);
  if (filter === "deletion") query = query.not("deletion_requested_at", "is", null);
  const { data: users } = await query;

  return (
    <div className="grid gap-4">
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Email, phone or name" className="pl-9" />
        </label>
        <select name="filter" defaultValue={filter ?? ""} className="h-11 rounded-lg border border-input bg-white px-3 text-sm" aria-label="Filter">
          <option value="">All users</option>
          <option value="suspended">Suspended</option>
          <option value="deletion">Deletion requested</option>
        </select>
        <Button type="submit">Search</Button>
      </form>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-navy hover:underline">
                    {u.full_name ?? "–"}
                  </Link>{" "}
                  {u.is_admin ? <Pill tone="info">Admin</Pill> : null}
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-3 py-2">{formatPhone(u.phone)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.organization_members?.length
                    ? u.organization_members.map((m) => `${m.organizations?.name ?? "Society"}: ${m.role}`).join(", ")
                    : "Student"}
                </td>
                <td className="px-3 py-2">{formatShortDateTime(u.created_at)}</td>
                <td className="px-3 py-2">
                  {u.is_suspended ? <StatusBadge status="suspended" /> : <StatusBadge status="valid" label="Active" />}
                  {u.suspended_reason ? <div className="text-xs text-muted-foreground">{u.suspended_reason}</div> : null}
                  {u.deletion_requested_at ? <div className="text-xs text-warning">Deletion requested</div> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/users/${u.id}`}>Roles</Link>
                    </Button>
                    {u.id !== me.id ? <SuspendButton userId={u.id} suspended={u.is_suspended} name={u.full_name ?? u.email ?? "user"} /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!users?.length ? <p className="text-sm text-muted-foreground">No users found.</p> : null}
    </div>
  );
}

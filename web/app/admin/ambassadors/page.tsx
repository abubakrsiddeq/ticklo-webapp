import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { CampusAmbassadorForm, CampusToggle } from "./campus-form";

export const metadata: Metadata = { title: "Campus ambassadors" };

// AMB-14: TickLO's own campus ambassadors – who brought which societies, and what those societies did
export default async function AdminAmbassadorsPage() {
  await requireAdmin("/admin/ambassadors");
  const supabase = await createClient();
  const [{ data: rows }, { data: unis }, { data: list }] = await Promise.all([
    supabase.rpc("campus_ambassador_stats", { p_user_id: null }),
    supabase.from("universities").select("id, name").order("name"),
    supabase.from("campus_ambassadors").select("user_id, university_id"),
  ]);
  const uniOf = new Map((list ?? []).map((r) => [r.user_id, r.university_id]));
  const all = rows ?? [];
  const totals = all.reduce(
    (t, r) => ({ societies: t.societies + Number(r.societies), approved: t.approved + Number(r.approved_societies), tickets: t.tickets + Number(r.paid_tickets) }),
    { societies: 0, approved: 0, tickets: 0 },
  );
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a campus ambassador</CardTitle>
          <CardDescription>
            They need a TickLO account. Societies type the code when they register (or later in Society profile, within 30 days) – you see here what each
            ambassador brought.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampusAmbassadorForm universities={unis ?? []} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
          <div className="text-sm text-muted-foreground">Societies brought</div>
          <div className="font-heading text-2xl font-bold text-navy">{totals.societies}</div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
          <div className="text-sm text-muted-foreground">Approved</div>
          <div className="font-heading text-2xl font-bold text-navy">{totals.approved}</div>
        </div>
        <div className="rounded-2xl bg-brand-soft p-4 shadow-card ring-1 ring-navy/[0.06]">
          <div className="text-sm text-muted-foreground">Paid tickets sold by them</div>
          <div className="font-heading text-2xl font-bold text-navy">{totals.tickets}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campus ambassadors ({all.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {all.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Ambassador</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Campus</th>
                    <th className="py-2 pr-3 text-right font-medium">Societies</th>
                    <th className="py-2 pr-3 text-right font-medium">Approved</th>
                    <th className="py-2 pr-3 text-right font-medium">Events live</th>
                    <th className="py-2 pr-3 text-right font-medium">Paid tickets</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {all.map((r) => (
                    <tr key={r.user_id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-navy">{r.full_name || r.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.email} · since {formatDate(r.created_at)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {r.code} {!r.active ? <Pill tone="neutral">Off</Pill> : null}
                      </td>
                      <td className="py-2 pr-3">{r.university ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.societies}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.approved_societies}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.published_events}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.paid_tickets}</td>
                      <td className="py-2 text-right">
                        <CampusToggle userId={r.user_id} code={r.code} universityId={uniOf.get(r.user_id) ?? null} active={r.active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No campus ambassadors yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

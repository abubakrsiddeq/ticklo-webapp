import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { SuspendButton } from "../suspend-button";

export const metadata: Metadata = { title: "Fraud" };

// ADM-05: "Possible duplicate" flags and accounts rejected again and again; suspend if needed
export default async function FraudPage() {
  await requireAdmin("/admin/fraud");
  const supabase = await createClient();
  const [{ data: flags }, { data: repeat }] = await Promise.all([
    supabase
      .from("payment_proofs")
      .select(
        `id, created_at, status, transaction_id, duplicate_reasons, duplicate_order_ids, user_id,
         orders!inner ( id, ref_code, total_paisa, status, buyer_name, events!inner ( name, organizations!inner ( name ) ) )`,
      )
      .eq("is_possible_duplicate", true)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("admin_repeat_rejections", { p_min: 3 }),
  ]);
  const userIds = [...new Set((flags ?? []).map((f) => f.user_id))];
  const { data: users } = userIds.length ? await supabase.from("profiles").select("id, email, is_suspended").in("id", userIds) : { data: [] };
  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold text-navy">
          <AlertTriangle className="size-5 text-red-600" aria-hidden /> Possible duplicates ({flags?.length ?? 0})
        </h2>
        {flags?.length ? (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">Why</th>
                  <th className="px-3 py-2 font-medium">Buyer</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {flags.map((f) => {
                  const u = userMap.get(f.user_id);
                  return (
                    <tr key={f.id}>
                      <td className="px-3 py-2">
                        <Link href={`/admin/orders/${f.orders.id}`} className="font-mono font-semibold text-brand-strong underline">
                          {f.orders.ref_code}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatShortDateTime(f.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">
                        {f.orders.events.name}
                        <div className="text-xs text-muted-foreground">{f.orders.events.organizations.name}</div>
                      </td>
                      <td className="px-3 py-2">
                        {f.duplicate_reasons.map((r) => (r === "transaction_id" ? "same TID" : "same screenshot")).join(", ")}
                        <div className="font-mono text-xs text-muted-foreground">{f.transaction_id}</div>
                      </td>
                      <td className="px-3 py-2">
                        {f.orders.buyer_name}
                        <div className="text-xs text-muted-foreground">{u?.email}</div>
                        {u ? (
                          <div className="mt-1">
                            <SuspendButton userId={u.id} suspended={u.is_suspended} name={f.orders.buyer_name} />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={f.orders.status} />
                        <div className="text-xs text-muted-foreground">{formatPKR(f.orders.total_paisa)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No duplicate flags.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-navy">Accounts rejected 3+ times</h2>
        {repeat?.length ? (
          <ul className="divide-y rounded-xl border bg-white">
            {repeat.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-navy">
                    {r.full_name ?? "–"} {r.is_suspended ? <StatusBadge status="suspended" /> : null}
                  </p>
                  <p className="text-muted-foreground">
                    {r.email} · {r.phone ?? "no phone"} · {r.rejected_count} rejections · last {r.last_rejected_at ? formatShortDateTime(r.last_rejected_at) : "–"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/orders?q=${encodeURIComponent(r.email ?? "")}`} className="inline-flex h-11 items-center px-3 text-sm text-brand-strong underline">
                    Orders
                  </Link>
                  <SuspendButton userId={r.user_id} suspended={r.is_suspended} name={r.full_name ?? r.email ?? "user"} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No accounts with repeated rejections.</p>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { ResolveDispute } from "../resolve-dispute";

export const metadata: Metadata = { title: "Orders & disputes" };

// ADM-03: find orders by order ID / reference, email or phone. ADM-04: disputes.
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/admin/orders");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const supabase = await createClient();

  let results: { id: string; ref_code: string; status: string; buyer_name: string; buyer_email: string | null; buyer_phone: string | null; total_paisa: number; created_at: string; events: { name: string } }[] = [];
  if (q) {
    let query = supabase
      .from("orders")
      .select("id, ref_code, status, buyer_name, buyer_email, buyer_phone, total_paisa, created_at, events!inner ( name )")
      .order("created_at", { ascending: false })
      .limit(50);
    const clean = q.replace(/[%,()]/g, "");
    if (/^[0-9a-f-]{36}$/i.test(clean)) query = query.eq("id", clean);
    else if (/^tl-?\d+$/i.test(clean)) query = query.ilike("ref_code", `%${clean.replace(/^tl-?/i, "")}%`);
    else if (clean.includes("@")) query = query.ilike("buyer_email", `%${clean.toLowerCase()}%`);
    else if (/^[+\d\s-]{6,}$/.test(clean)) {
      const phone = normalizePhone(clean) ?? clean.replace(/\D/g, "");
      query = query.ilike("buyer_phone", `%${phone.replace(/^\+/, "").slice(-10)}%`);
    } else query = query.ilike("buyer_name", `%${clean}%`);
    const { data } = await query;
    results = data ?? [];
  }

  const { data: disputes } = await supabase
    .from("disputes")
    .select("id, message, status, created_at, orders!inner ( id, ref_code, status, buyer_name, total_paisa, events!inner ( name ) )")
    .eq("status", "open")
    .order("created_at");

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <form className="flex gap-2" role="search">
          <label className="relative flex-1">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="TL-123456, order ID, email, phone or name" className="pl-9" />
          </label>
          <Button type="submit">Search</Button>
        </form>
        {q ? (
          results.length ? (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Buyer</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2">
                        <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-brand-strong underline">
                          {o.ref_code}
                        </Link>
                        <div className="text-xs text-muted-foreground">{formatShortDateTime(o.created_at)}</div>
                      </td>
                      <td className="px-3 py-2">{o.events.name}</td>
                      <td className="px-3 py-2">
                        {o.buyer_name}
                        <div className="text-xs text-muted-foreground">
                          {o.buyer_email} · {o.buyer_phone}
                        </div>
                      </td>
                      <td className="px-3 py-2">{formatPKR(o.total_paisa, { freeLabel: "Free" })}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No orders found for “{q}”.</p>
          )
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-navy">Open disputes ({disputes?.length ?? 0})</h2>
        {disputes?.length ? (
          <ul className="grid gap-3">
            {disputes.map((d) => (
              <li key={d.id} className="grid gap-2 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/orders/${d.orders.id}`} className="font-mono font-semibold text-brand-strong underline">
                    {d.orders.ref_code}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatShortDateTime(d.created_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {d.orders.events.name} · {d.orders.buyer_name} · {formatPKR(d.orders.total_paisa)} · order <StatusBadge status={d.orders.status} />
                </p>
                <p className="whitespace-pre-line rounded-lg bg-secondary p-3 text-sm">{d.message}</p>
                <ResolveDispute id={d.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open disputes.</p>
        )}
      </section>
    </div>
  );
}

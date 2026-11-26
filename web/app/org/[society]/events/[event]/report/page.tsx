import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { requireOrgEvent } from "@/lib/auth";
import { getEventReport } from "@/lib/queries/report";
import { getPrintSales } from "@/lib/queries/print-sales";
import { getAmbassadorPage } from "@/lib/queries/ambassadors";
import { discountLabel, rewardDue } from "@/lib/referrals";
import { createClient } from "@/lib/supabase/server";
import { kindEmoji } from "@/lib/sessions";
import { methodLabel } from "@/lib/print/sales";
import { formatDateTime, formatPKR, formatShortDateTime } from "@/lib/format";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Event report" };

// ORG-12: approved orders, total collected, per payment account; PDF (print) or CSV
export default async function ReportPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/report`);
  const supabase = await createClient();
  const [r, ps, amb, { data: sessionStats }] = await Promise.all([
    getEventReport(event.id),
    getPrintSales(event.id),
    getAmbassadorPage(event.id),
    supabase.rpc("session_stats", { p_event_id: event.id }),
  ]);
  const paper = ps.summary.totals;

  return (
    <div className="grid gap-6">
      <div className="no-print flex flex-wrap gap-2">
        <PrintButton />
        <Button asChild variant="outline">
          <a href={`/org/${org.slug}/events/${event.slug}/report/export`} download>
            <Download /> Download CSV
          </a>
        </Button>
      </div>

      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">{event.name} – sales report</h1>
        <p>{org.name} · generated {formatDateTime(new Date(serverNow()))} PKT</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="text-sm text-muted-foreground">Collected{paper.printed ? " (online + paper received)" : ""}</div>
          <div className="font-heading text-2xl font-bold text-navy">{formatPKR(r.total + paper.cash)}</div>
          {paper.printed ? (
            <div className="text-xs text-muted-foreground">
              Online {formatPKR(r.total)} · Paper {formatPKR(paper.cash)}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="text-sm text-muted-foreground">Approved orders</div>
          <div className="font-heading text-2xl font-bold text-navy">{r.orders.length}</div>
        </div>
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="text-sm text-muted-foreground">Tickets sold</div>
          <div className="font-heading text-2xl font-bold text-navy">{r.tickets + paper.sold}</div>
          {paper.printed ? (
            <div className="text-xs text-muted-foreground">
              {r.tickets} online · {paper.sold} paper{paper.comp ? ` · ${paper.comp} free passes` : ""}
            </div>
          ) : null}
        </div>
      </div>

      <section>
        <h3 className="mb-2 font-semibold text-navy">By payment account</h3>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.byAccount.map((a) => (
                <tr key={a.name}>
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{a.orders}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPKR(a.amount)}</td>
                </tr>
              ))}
              {!r.byAccount.length ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No approved orders yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-navy">By ticket type</h3>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ticket type</th>
                <th className="px-4 py-2 text-right font-medium">Tickets</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.byType.map((t) => (
                <tr key={t.name}>
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.tickets}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPKR(t.amount)}</td>
                </tr>
              ))}
              {r.discount ? (
                <tr>
                  <td className="px-4 py-2 text-muted-foreground">Discounts (promo &amp; ambassador codes)</td>
                  <td />
                  <td className="px-4 py-2 text-right tabular-nums text-destructive">−{formatPKR(r.discount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {sessionStats?.length ? (
        <section className="grid gap-2">
          <h3 className="font-semibold text-navy">Sessions</h3>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 text-right font-medium">Tickets / teams</th>
                  <th className="px-3 py-2 text-right font-medium">Seats</th>
                  <th className="px-3 py-2 text-right font-medium">Checked in</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sessionStats.map((x) => (
                  <tr key={x.session_id}>
                    <td className="px-3 py-2">
                      {kindEmoji(x.kind)} {x.name} <span className="text-xs text-muted-foreground">· {formatShortDateTime(x.starts_at)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.kind === "competition" ? `${x.teams_paid} teams` : x.tickets}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.capacity ? `${x.taken}/${x.capacity}` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.checked_in}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {amb.rows.length || amb.promos.length ? (
        <section className="grid gap-2">
          <h3 className="font-semibold text-navy">Ambassadors &amp; promo codes</h3>
          {amb.rows.length ? (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-secondary/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Ambassador</th>
                    <th className="px-3 py-2 text-right font-medium">Tickets</th>
                    <th className="px-3 py-2 text-right font-medium">Money brought</th>
                    <th className="px-3 py-2 text-right font-medium">Reward</th>
                    <th className="px-3 py-2 text-right font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {amb.rows.map((a) => (
                    <tr key={a.seller_id}>
                      <td className="px-3 py-2 tabular-nums">{a.rank}</td>
                      <td className="px-3 py-2">
                        {a.name} <span className="font-mono text-xs text-muted-foreground">{a.ref_code}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.credited_tickets}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPKR(a.credited_revenue_paisa)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPKR(a.reward_paisa)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPKR(rewardDue(a.reward_paisa, a.paid_paisa))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {amb.promos.length ? (
            <p className="text-sm text-muted-foreground">
              {amb.promos
                .filter((p) => p.approved)
                .map((p) => `${p.code} (${discountLabel(p.discount_type, p.discount_value)}): ${p.approved} orders, ${formatPKR(p.discount_paisa)} off`)
                .join(" · ") || "No paid orders used a promo code yet."}
            </p>
          ) : null}
        </section>
      ) : null}

      {ps.summary.totals.printed ? (
        <section className="grid gap-2">
          <h3 className="font-semibold text-navy">Printed (paper) tickets</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Sold", `${ps.summary.totals.sold} of ${ps.summary.totals.printed}`],
              ["Sales value", formatPKR(ps.summary.totals.expected)],
              ["Money received", formatPKR(ps.summary.totals.cash)],
              ["Still with sellers", formatPKR(ps.summary.totals.outstanding)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <div className="text-sm text-muted-foreground">{k}</div>
                <div className="font-heading text-xl font-bold text-navy">{v}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Seller</th>
                  <th className="px-3 py-2 text-right font-medium">Given</th>
                  <th className="px-3 py-2 text-right font-medium">Returned</th>
                  <th className="px-3 py-2 text-right font-medium">Free</th>
                  <th className="px-3 py-2 text-right font-medium">Sold</th>
                  <th className="px-3 py-2 text-right font-medium">Should hand over</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ps.summary.sellers.map((s) => (
                  <tr key={s.id ?? "org"}>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.given}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.returned}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.comp}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.sold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPKR(s.expected)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPKR(s.cash)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${s.difference < 0 ? "text-destructive" : ""}`}>{formatPKR(s.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            By payment: {ps.summary.totals.byMethod.map((m) => `${methodLabel(m.method === "unknown" ? null : m.method)} ${m.count} (${formatPKR(m.amount)})`).join(" · ") || "–"}
            {ps.summary.totals.printingCost ? ` · Printing cost ${formatPKR(ps.summary.totals.printingCost)}` : ""}
          </p>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 font-semibold text-navy">Approved orders</h3>
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Buyer</th>
                <th className="px-3 py-2 font-medium">Tickets</th>
                <th className="px-3 py-2 font-medium">Paid to</th>
                <th className="px-3 py-2 font-medium">TID</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2 font-mono">
                    {o.ref_code}
                    <div className="font-sans text-xs text-muted-foreground">{o.approved_at ? formatShortDateTime(o.approved_at) : ""}</div>
                  </td>
                  <td className="px-3 py-2">{o.buyer_name}</td>
                  <td className="px-3 py-2">{o.order_items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}</td>
                  <td className="px-3 py-2">{o.accountName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{o.transactionId ?? "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPKR(o.total_paisa, { freeLabel: "Free" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

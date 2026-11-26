import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { requireOrgEvent } from "@/lib/auth";
import { getEventReport } from "@/lib/queries/report";
import { formatDateTime, formatPKR, formatShortDateTime } from "@/lib/format";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Event report" };

// ORG-12: approved orders, total collected, per payment account; PDF (print) or CSV
export default async function ReportPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/report`);
  const r = await getEventReport(event.id);

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
          <div className="text-sm text-muted-foreground">Collected</div>
          <div className="font-heading text-2xl font-bold text-navy">{formatPKR(r.total)}</div>
        </div>
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="text-sm text-muted-foreground">Approved orders</div>
          <div className="font-heading text-2xl font-bold text-navy">{r.orders.length}</div>
        </div>
        <div className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="text-sm text-muted-foreground">Tickets</div>
          <div className="font-heading text-2xl font-bold text-navy">{r.tickets}</div>
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
            </tbody>
          </table>
        </div>
      </section>

      {r.printed.length ? (
        <section>
          <h3 className="mb-1 font-semibold text-navy">Printed (paper) tickets</h3>
          <p className="mb-2 text-sm text-muted-foreground">Sold for cash by your team – not included in “Collected”. Face value = printed (not voided) × price.</p>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Ticket type</th>
                  <th className="px-4 py-2 text-right font-medium">Printed</th>
                  <th className="px-4 py-2 text-right font-medium">Used at gate</th>
                  <th className="px-4 py-2 text-right font-medium">Voided</th>
                  <th className="px-4 py-2 text-right font-medium">Face value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.printed.map((p) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.printed}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.used}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.voided}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatPKR(p.faceValue, { freeLabel: "Free" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

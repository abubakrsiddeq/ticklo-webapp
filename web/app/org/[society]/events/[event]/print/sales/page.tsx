import type { Metadata } from "next";
import { AlertTriangle, Download, Lock, MessageCircle, Printer, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPrintSales } from "@/lib/queries/print-sales";
import { methodLabel, sellerWhatsAppLink } from "@/lib/print/sales";
import QRCode from "qrcode";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { PrintSubnav } from "@/components/print/print-subnav";
import { CashDialog, DeleteCashButton, DeleteSellerButton, RangeActionForm, SellerDialog, SettleButton } from "@/components/print/sales/sales-forms";

export const metadata: Metadata = { title: "Printed ticket sales" };

const rs = (p: number) => formatPKR(p);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className={`rounded-2xl p-4 shadow-card ring-1 ring-navy/[0.06] ${tone === "warn" ? "bg-warning-soft" : tone === "good" ? "bg-brand-soft" : "bg-white"}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-heading text-2xl font-bold text-navy tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "bad" | "good" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? "font-semibold text-navy" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === "bad" ? "font-semibold text-destructive" : tone === "good" ? "font-semibold text-brand-strong" : ""}`}>{value}</span>
    </div>
  );
}

/** D-041: who has which printed tickets, what was sold, and the money (hisaab). */
export default async function PrintSalesPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/print/sales`);
  const supabase = await createClient();
  const [{ summary, cash, hasBatches }, { data: team }, { data: prefixRow }] = await Promise.all([
    getPrintSales(event.id),
    supabase.rpc("org_team", { p_org_id: org.id }),
    supabase.from("print_batches").select("prefix").eq("event_id", event.id).order("created_at").limit(1).maybeSingle(),
  ]);
  const base = `/org/${org.slug}/events/${event.slug}/print`;
  const t = summary.totals;
  const sellerNames = new Map(summary.sellers.map((s) => [s.id, s.name]));
  const editable = event.status !== "cancelled";
  const sellUrl = absoluteUrl(`/sell/${event.id}`);
  const sellQr = await QRCode.toDataURL(sellUrl, { margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const net = t.cash - t.printingCost;

  return (
    <div className="grid gap-6">
      <PrintSubnav base={base} eventId={event.id} active="sales" />

      {!hasBatches ? (
        <EmptyState icon={Printer} title="No printed tickets yet" description="Create a batch of printed tickets first, then track sellers, sales and cash here." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Sold" value={String(t.sold)} sub={`of ${t.printed} printed · ${t.soldAtGate} found at the gate`} />
            <Tile label="Sales value" value={rs(t.expected)} sub="sold × price" />
            <Tile label="Money received" value={rs(t.cash)} tone="good" sub={t.byMethod.length ? t.byMethod.map((m) => methodLabel(m.method)).join(", ") : undefined} />
            <Tile label="Still with sellers" value={rs(t.outstanding)} tone={t.outstanding ? "warn" : undefined} sub={t.difference > 0 ? `${rs(t.difference)} more received than sold` : undefined} />
            <Tile label="Free passes" value={String(t.comp)} />
            <Tile label="In stock (unsold)" value={String(t.inStock)} sub="still hold a place" />
            <Tile label="Returned / voided" value={`${t.returned} / ${t.voided}`} sub="places given back" />
            <Tile label="Printing cost" value={rs(t.printingCost)} sub={`Net after printing: ${rs(net)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            {editable ? (
              <Card>
                <CardHeader>
                  <CardTitle>Update tickets</CardTitle>
                  <CardDescription>Use serial numbers from the tickets, e.g. {prefixRow?.prefix ?? "QWL"}-0001 to {prefixRow?.prefix ?? "QWL"}-0025.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RangeActionForm
                    orgSlug={org.slug}
                    eventId={event.id}
                    examplePrefix={prefixRow?.prefix ?? "QWL"}
                    sellers={summary.sellers.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name, settled: Boolean(s.settledAt) }))}
                  />
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="size-5" aria-hidden /> Sell on the phone
                </CardTitle>
                <CardDescription>
                  Sellers in your team open this link, scan a ticket&apos;s QR and tap Cash / JazzCash / EasyPaisa – the sale shows up here at once. Tickets
                  scanned at the gate without a sale are counted as sold automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary px-3 py-2.5 text-sm">{sellUrl}</code>
                  <CopyButton value={sellUrl} label="Sell link" />
                </div>
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sellQr} alt="QR code that opens the Sell screen" className="size-28 rounded-lg ring-1 ring-navy/10" />
                  <p className="text-sm text-muted-foreground">
                    At the desk: sellers point their phone camera at this code to open the Sell screen. Or send each seller the link on WhatsApp (button on
                    their card).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-heading text-lg font-bold text-navy">Sellers</h3>
                <p className="text-sm text-muted-foreground">Same people as on the Ambassadors tab – their online link sales and rank are there.</p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <a href={`${base}/sales/export`} download>
                    <Download /> CSV
                  </a>
                </Button>
                {editable ? <SellerDialog orgSlug={org.slug} eventId={event.id} trigger="add" team={(team ?? []).map((m) => ({ user_id: m.user_id, name: m.full_name || m.email }))} /> : null}
              </div>
            </div>
            {summary.sellers.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {summary.sellers.map((s) => {
                  const settled = Boolean(s.settledAt);
                  return (
                    <article key={s.id ?? "org"} className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-semibold text-navy">
                            {s.name} {settled ? <Pill tone="neutral"><Lock className="mr-1 inline size-3" aria-hidden />Closed</Pill> : null}
                            {s.userId ? <Pill tone="info">Sells on phone</Pill> : null}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{s.ranges || "No tickets right now"}</p>
                          {s.phone ? <p className="text-xs text-muted-foreground">{s.phone}</p> : null}
                        </div>
                        {s.id && editable ? (
                          <div className="flex shrink-0">
                            <SellerDialog orgSlug={org.slug} eventId={event.id} trigger="edit" team={(team ?? []).map((m) => ({ user_id: m.user_id, name: m.full_name || m.email }))} seller={{ id: s.id, name: s.name, phone: s.phone, userId: s.userId }} />
                            {!s.given && !s.cash ? <DeleteSellerButton orgSlug={org.slug} sellerId={s.id} name={s.name} /> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid gap-1 rounded-xl bg-secondary/50 p-3">
                        <Line label="Given" value={String(s.given)} />
                        <Line label="Returned" value={String(s.returned)} />
                        {s.voided ? <Line label="Voided (lost)" value={String(s.voided)} /> : null}
                        <Line label="Free passes" value={String(s.comp)} />
                        <Line label="Still in stock" value={String(s.inStock)} />
                        <Line label={`Sold${s.soldAtGate ? ` (${s.soldAtGate} found at gate)` : ""}`} value={String(s.sold)} strong />
                        <Line label="  └ came in / not yet" value={`${s.used} / ${s.noShow}`} />
                        <div className="my-1 border-t border-navy/10" />
                        <Line label="Should hand over" value={rs(s.expected)} strong />
                        <Line label="Received" value={rs(s.cash)} />
                        <Line label="Difference" value={`${s.difference > 0 ? "+" : ""}${rs(s.difference)}`} strong tone={s.difference < 0 ? "bad" : s.difference > 0 ? "good" : undefined} />
                        {s.byMethod.length ? (
                          <p className="pt-1 text-xs text-muted-foreground">{s.byMethod.map((m) => `${methodLabel(m.method === "unknown" ? null : m.method)} ${m.count}`).join(" · ")}</p>
                        ) : null}
                      </div>
                      {s.changedAfterSettle ? (
                        <p className="flex items-center gap-1 text-xs text-warning">
                          <AlertTriangle className="size-3.5" aria-hidden /> Tickets were scanned after this account was closed – reopen and check it.
                        </p>
                      ) : null}
                      {editable ? (
                        <div className="flex flex-wrap gap-2">
                          {s.id && s.userId ? (
                            <Button asChild size="sm" variant="outline" className="border-[#25D366] text-[#128C4B]">
                              <a href={sellerWhatsAppLink({ name: s.name, phone: s.phone, eventName: event.name, sellUrl })} target="_blank" rel="noopener noreferrer">
                                <MessageCircle /> Send link on WhatsApp
                              </a>
                            </Button>
                          ) : null}
                          <CashDialog orgSlug={org.slug} eventId={event.id} sellerId={s.id} sellerName={s.name} disabled={settled} />
                          {s.id ? <SettleButton orgSlug={org.slug} sellerId={s.id} settled={settled} owes={s.difference < 0 ? rs(-s.difference) : null} /> : null}
                        </div>
                      ) : null}
                      {settled ? <p className="text-xs text-muted-foreground">Closed {formatShortDateTime(s.settledAt!)}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">No sellers yet. Add the people who sell your paper tickets, then give them serial ranges.</p>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="grid gap-2">
              <h3 className="font-heading text-lg font-bold text-navy">By ticket type</h3>
              <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="bg-secondary/60 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Printed</th>
                      <th className="px-3 py-2 text-right font-medium">Sold</th>
                      <th className="px-3 py-2 text-right font-medium">Free</th>
                      <th className="px-3 py-2 text-right font-medium">Unsold</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {summary.byType.map((x) => (
                      <tr key={x.name}>
                        <td className="px-3 py-2">
                          {x.name} <span className="text-muted-foreground">· {formatPKR(x.price, { freeLabel: "Free" })}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.printed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.sold}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.comp}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{x.inStock}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rs(x.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-2">
              <h3 className="font-heading text-lg font-bold text-navy">Money received</h3>
              <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="bg-secondary/60 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">From</th>
                      <th className="px-3 py-2 font-medium">How</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cash.map((e) => {
                      const locked = summary.sellers.find((s) => s.id === e.seller_id)?.settledAt;
                      return (
                        <tr key={e.id}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatShortDateTime(e.created_at)}</td>
                          <td className="px-3 py-2">
                            {sellerNames.get(e.seller_id) ?? "Organizer"}
                            {e.note ? <div className="text-xs text-muted-foreground">{e.note}</div> : null}
                          </td>
                          <td className="px-3 py-2">{methodLabel(e.method)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${Number(e.amount_paisa) < 0 ? "text-destructive" : ""}`}>{rs(Number(e.amount_paisa))}</td>
                          <td className="px-1 py-2">{editable && !locked ? <DeleteCashButton orgSlug={org.slug} entryId={e.id} /> : null}</td>
                        </tr>
                      );
                    })}
                    {!cash.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          No money recorded yet. Use “Money received” on a seller.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

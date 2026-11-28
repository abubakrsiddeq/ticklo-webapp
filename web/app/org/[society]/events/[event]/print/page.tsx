import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Printer, QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { getPrintOverview, getPrintSessions } from "@/lib/queries/print";
import { SCOPE_GROUPS, printValues, scopeEmoji, scopeWhen, ticketScope, type PrintScopeKind } from "@/lib/print/values";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { serverNow } from "@/lib/time";
import { PrintSubnav } from "@/components/print/print-subnav";

export const metadata: Metadata = { title: "Printed tickets" };

/** PRT-10: printed (paper) tickets of an event. */
export default async function PrintedTicketsPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/print`);
  const [{ batches, types: rawTypes }, { sessions, access }] = await Promise.all([getPrintOverview(event.id), getPrintSessions(event.id)]);
  const festival = event.format === "festival";
  // D-083: each ticket with what it prints (Qawwali Night · Wed, 2 Dec · 8:00 PM)
  const types = rawTypes.map((t) => {
    const scope = ticketScope(event.format, access.get(t.id), sessions);
    const values = printValues(event, org, t, scope);
    return { ...t, scope: scope.kind as PrintScopeKind, headline: values.event_name ?? t.name, emoji: scopeEmoji(scope), when: scopeWhen(values) };
  });
  const typeById = new Map(types.map((t) => [t.id, t]));
  const base = `/org/${org.slug}/events/${event.slug}/print`;
  const ended = new Date(event.ends_at).getTime() <= serverNow();
  const canCreate = event.status === "published" && !ended;
  const reason =
    event.status === "cancelled"
      ? "This event is cancelled."
      : event.status !== "published"
        ? "Printed tickets can be made once TickLO has approved the event."
        : ended
          ? "This event has ended."
          : null;

  return (
    <div className="grid gap-6">
      <PrintSubnav base={base} eventId={event.id} active="batches" />
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Printer className="size-5" aria-hidden /> Sell paper tickets at the gate
            </CardTitle>
            <CardDescription>
              Every paper ticket gets its own QR code and number. Print the PDF, sell for cash, and scan them at the gate like online tickets. A photocopied ticket
              only gets in once.
            </CardDescription>
          </div>
          {canCreate ? (
            <Button asChild variant="brand" className="shrink-0">
              <Link href={`${base}/new`}>
                <Plus /> New printed tickets
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {reason ? <p className="rounded-xl bg-secondary p-3 text-sm text-navy">{reason}</p> : null}
          <ol className="grid gap-3 text-sm sm:grid-cols-3">
            <li className="flex gap-3 rounded-xl bg-secondary/60 p-3">
              <Printer className="size-5 shrink-0 text-brand-strong" aria-hidden />
              <span>
                <b className="text-navy">Create.</b> Pick the ticket{festival ? " (e.g. Qawwali Night or a festival pass)" : ""}, choose a design, check the words and
                say how many.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl bg-secondary/60 p-3">
              <QrCode className="size-5 shrink-0 text-brand-strong" aria-hidden />
              <span>
                <b className="text-navy">Print.</b> Download the PDF (A4, A3 or one per page for a printing press) and print it at actual size.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl bg-secondary/60 p-3">
              <ScanLine className="size-5 shrink-0 text-brand-strong" aria-hidden />
              <span>
                <b className="text-navy">Sell &amp; scan.</b> Give tickets to sellers and see the cash on Sales &amp; cash. Volunteers scan them at /scan. A lost
                ticket can be cancelled (voided).
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {types.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ticket</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Printed</th>
                <th className="px-4 py-2 text-right font-medium">Can still print or sell</th>
              </tr>
            </thead>
            {(festival ? SCOPE_GROUPS.map((g) => ({ ...g, items: types.filter((t) => g.scopes.includes(t.scope)) })) : [{ key: "all", title: "", hint: "", items: types }])
              .filter((g) => g.items.length)
              .map((g) => (
                <tbody key={g.key} className="divide-y border-t first:border-t-0">
                  {g.title ? (
                    <tr className="bg-secondary/30">
                      <th colSpan={5} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-semibold text-navy">
                        {g.title}
                      </th>
                    </tr>
                  ) : null}
                  {g.items.map((t) => {
                    const printed = batches.filter((b) => b.ticket_type_id === t.id).reduce((s, b) => s + b.counts.valid + b.counts.used, 0);
                    return (
                      <tr key={t.id}>
                        <td className="px-4 py-2">
                          <span className="flex items-start gap-2">
                            <span aria-hidden>{t.emoji}</span>
                            <span className="grid">
                              <span className="font-medium text-navy">{t.headline}</span>
                              {t.headline !== t.name ? <span className="text-xs text-navy">{t.name}</span> : null}
                              {festival ? <span className="text-xs text-muted-foreground">{t.when}</span> : null}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatPKR(t.price_paisa, { freeLabel: "Free" })}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{t.quantity}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{printed}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums text-navy">{t.remaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
          </table>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            &quot;Can still print or sell&quot; is the total minus tickets sold online, waiting for payment, or printed. A cancelled (voided) paper ticket gives its
            place back.
          </p>
        </div>
      ) : null}

      <section className="grid gap-3">
        <h3 className="font-heading text-lg font-bold text-navy">Batches</h3>
        {batches.length ? (
          <ul className="grid gap-3">
            {batches.map((b) => {
              const headline = typeById.get(b.ticket_type_id)?.headline ?? b.ticket_types.name;
              const title = b.label || headline;
              return (
              <li key={b.id}>
                <Link
                  href={`${base}/${b.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-navy">
                      {title} <span className="font-mono text-sm text-muted-foreground">{b.firstLabel} – {b.lastLabel}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {title !== headline ? `${headline} · ` : ""}
                      {b.quantity} × {b.ticket_types.name} · {formatPKR(b.ticket_types.price_paisa, { freeLabel: "Free" })} · created {formatShortDateTime(b.created_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill tone="info">{b.counts.sold} sold / free</Pill>
                      <Pill tone="success">{b.counts.valid} not used</Pill>
                      <Pill tone="neutral">{b.counts.used} used</Pill>
                      {b.counts.voided ? <Pill tone="danger">{b.counts.voided} voided</Pill> : null}
                      <Pill tone={b.download_count ? "info" : "warning"}>{b.download_count ? `PDF downloaded ${b.download_count}×` : "PDF not downloaded"}</Pill>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Printer} title="No printed tickets yet" description={canCreate ? "Create your first batch to sell tickets on the spot." : (reason ?? "")} />
        )}
      </section>
    </div>
  );
}

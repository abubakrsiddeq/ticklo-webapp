import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgEvent } from "@/lib/auth";
import { getPrintBatch, getTypeScope } from "@/lib/queries/print";
import { printValues } from "@/lib/print/values";
import { parseDesign } from "@/lib/print/design";
import { formatPKR, formatShortDateTime, formatTime, paisaToRupeesInput } from "@/lib/format";
import { DownloadPdf } from "@/components/print/download-pdf";
import { DesignThumb } from "@/components/print/design-thumb";
import { TicketFonts } from "@/components/print/ticket-fonts";
import { BatchTickets, VoidRangeForm } from "@/components/print/batch-tickets";
import { BatchOptionsForm } from "@/components/print/sales/batch-options";
import { PrintSubnav } from "@/components/print/print-subnav";
import { methodLabel } from "@/lib/print/sales";

export const metadata: Metadata = { title: "Printed ticket batch" };

export default async function PrintBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string; batchId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { society, event: eventSlug, batchId } = await params;
  const { new: isNew } = await searchParams;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/print/${batchId}`);
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const detail = await getPrintBatch(event.id, batchId);
  if (!detail) notFound();
  const { batch, tickets } = detail;
  const design = parseDesign(batch.design);
  const values = printValues(event, org, batch.ticket_types, await getTypeScope(event, batch.ticket_types.id));
  const base = `/org/${org.slug}/events/${event.slug}/print`;
  const first = tickets[0]?.serial ?? "";
  const last = tickets[tickets.length - 1]?.serial ?? "";
  const printable = tickets.filter((t) => t.status !== "cancelled").length;
  const editable = event.status !== "cancelled";
  const title = batch.label || `${batch.ticket_types.name} batch`;

  return (
    <div className="grid gap-6">
      <TicketFonts />
      <PrintSubnav base={base} eventId={event.id} active="batches" />
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All batches
      </Link>

      {isNew ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-brand-soft p-4 text-brand-strong">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <b>{batch.quantity} tickets created</b> ({first} – {last}). Download the PDF below and print it at actual size. Each ticket can be scanned once.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-xl font-bold text-navy">{title}</h3>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">
            {first} – {last}
          </span>{" "}
          · {batch.quantity} × {batch.ticket_types.name} · {formatPKR(batch.ticket_types.price_paisa, { freeLabel: "Free" })} · created {formatShortDateTime(batch.created_at)}
          {batch.download_count ? ` · PDF downloaded ${batch.download_count}× (last ${formatShortDateTime(batch.last_downloaded_at!)})` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Download for printing</CardTitle>
            <CardDescription>High-resolution PDF with sharp QR codes. Each download is logged.</CardDescription>
          </CardHeader>
          <CardContent>
            {design ? (
              <DownloadPdf
                orgSlug={org.slug}
                batchId={batch.id}
                design={design}
                values={values}
                title={`${event.name} · ${batch.ticket_types.name}`}
                fileName={`ticklo-${event.slug}-${first}-${last}`.toLowerCase()}
                printable={printable}
              />
            ) : (
              <p className="text-sm text-destructive">This batch&apos;s design could not be read.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="grid gap-1">
              <CardTitle>Design</CardTitle>
              <CardDescription>Ticket {first} shown.</CardDescription>
            </div>
            {editable && design ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/${batch.id}/design`}>
                  <Pencil /> Edit design
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {design ? <DesignThumb design={design} values={{ ...values, serial: first, code: tickets[0]?.code }} width={560} alt={`Ticket ${first}`} className="shadow-card" /> : null}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3">
        <h3 className="font-heading text-lg font-bold text-navy">Tickets</h3>
        <BatchTickets
          orgSlug={org.slug}
          canEdit={editable}
          rows={tickets.map((t) => ({
            id: t.id,
            serial: t.serial,
            serialNo: t.serial_no ?? 0,
            status: t.status,
            buyer: t.buyer,
            phone: t.holder_phone,
            checkedIn: t.checked_in_at ? formatTime(t.checked_in_at) : null,
            checkedInBy: t.checkedInByName,
            sale:
              t.sale_status === "sold"
                ? `Sold · ${t.sale_source === "scan" && !t.sale_method ? "found at gate" : methodLabel(t.sale_method)}`
                : t.sale_status === "comp"
                  ? "Free pass"
                  : t.sale_status === "returned"
                    ? "Returned"
                    : "In stock",
            seller: t.print_sellers?.name ?? null,
          }))}
        />
      </section>

      {editable ? (
        <Card>
          <CardHeader>
            <CardTitle>Batch settings</CardTitle>
            <CardDescription>Sellers, sales and money are on Sales &amp; cash.</CardDescription>
          </CardHeader>
          <CardContent>
            <BatchOptionsForm
              orgSlug={org.slug}
              batchId={batch.id}
              requireSale={batch.require_sale}
              printingCost={batch.printing_cost_paisa ? paisaToRupeesInput(Number(batch.printing_cost_paisa)) : ""}
            />
          </CardContent>
        </Card>
      ) : null}

      {editable ? (
        <Card>
          <CardHeader>
            <CardTitle>Lost or stolen tickets?</CardTitle>
            <CardDescription>Void them so they can&apos;t be used. Scanning a voided ticket shows &quot;Invalid – cancelled&quot;, and its place goes back on sale.</CardDescription>
          </CardHeader>
          <CardContent>
            <VoidRangeForm orgSlug={org.slug} batchId={batch.id} prefix={batch.prefix} first={batch.first_serial} last={batch.first_serial + batch.quantity - 1} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

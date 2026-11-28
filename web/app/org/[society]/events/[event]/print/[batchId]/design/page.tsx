import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireOrgEvent } from "@/lib/auth";
import { getPrintBatch, getTypeScope } from "@/lib/queries/print";
import { printValues } from "@/lib/print/values";
import { parseDesign } from "@/lib/print/design";
import { BatchDesignEditor } from "@/components/print/batch-design-editor";

export const metadata: Metadata = { title: "Edit ticket design" };

export default async function BatchDesignPage({ params }: { params: Promise<{ society: string; event: string; batchId: string }> }) {
  const { society, event: eventSlug, batchId } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/print/${batchId}/design`);
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const detail = await getPrintBatch(event.id, batchId);
  if (!detail) notFound();
  const back = `/org/${org.slug}/events/${event.slug}/print/${batchId}`;
  if (event.status === "cancelled") redirect(back);
  const design = parseDesign(detail.batch.design);
  if (!design) redirect(back);
  const first = detail.tickets[0];
  const scope = await getTypeScope(event, detail.batch.ticket_types.id);
  return (
    <BatchDesignEditor
      orgSlug={org.slug}
      batchId={batchId}
      backHref={back}
      initialDesign={design}
      values={{ ...printValues(event, org, detail.batch.ticket_types, scope), serial: first?.serial, code: first?.code }}
    />
  );
}

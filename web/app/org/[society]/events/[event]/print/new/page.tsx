import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireOrgEvent } from "@/lib/auth";
import { getPrintOverview, getPrintSessions, listOrgTemplates, nextSerial } from "@/lib/queries/print";
import { printValues, ticketScope } from "@/lib/print/values";
import { suggestPrefix } from "@/lib/print/design";
import { serverNow } from "@/lib/time";
import { PrintWizard } from "@/components/print/print-wizard";

export const metadata: Metadata = { title: "New printed tickets" };

export default async function NewPrintedTicketsPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/print/new`);
  const base = `/org/${org.slug}/events/${event.slug}/print`;
  if (event.status !== "published" || new Date(event.ends_at).getTime() <= serverNow()) redirect(base);

  const [{ types }, saved, next, { sessions, access }] = await Promise.all([
    getPrintOverview(event.id),
    listOrgTemplates(org.id),
    nextSerial(event.id),
    getPrintSessions(event.id),
  ]);

  return (
    <div className="grid gap-4">
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Printed tickets
      </Link>
      <PrintWizard
        orgSlug={org.slug}
        eventId={event.id}
        basePath={base}
        nextSerial={next}
        defaultPrefix={suggestPrefix(event.name)}
        saved={saved.map((s) => ({ id: s.id, name: s.name, category: s.category, design: s.design }))}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          price_paisa: t.price_paisa,
          remaining: t.remaining,
          values: printValues(event, org, t, ticketScope(event.format, access.get(t.id), sessions)),
        }))}
      />
    </div>
  );
}

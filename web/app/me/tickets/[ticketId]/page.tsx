import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, IdCard, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveTicketQR } from "@/components/live-ticket-qr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TicketLinkButton } from "./share-link";

export const metadata: Metadata = { title: "Ticket", robots: { index: false } };

// TKT-02..TKT-05
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const user = await requireUser(`/me/tickets/${ticketId}`);
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) redirect("/not-allowed");
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      `id, code, status, checked_in_at, holder_name, order_id, owner_id,
       ticket_types!inner ( name, requires_student_card ),
       events!inner ( name, venue, starts_at, ends_at, status, organizations!inner ( name ) )`,
    )
    .eq("id", ticketId)
    .eq("owner_id", user.id)
    .maybeSingle();
  // Someone else's ticket (or a wrong link) → "Not allowed" (acceptance criteria)
  if (!ticket) redirect("/not-allowed");

  const { data: siblings } = await supabase
    .from("tickets")
    .select("id, code, ticket_types!inner ( name )")
    .eq("order_id", ticket.order_id)
    .order("created_at");

  const ev = ticket.events;
  const status = ev.status === "cancelled" ? "cancelled" : ticket.status;

  return (
    <div className="mx-auto grid max-w-md gap-5">
      <Button asChild variant="ghost" className="justify-self-start px-2">
        <Link href="/me/tickets">
          <ArrowLeft /> My tickets
        </Link>
      </Button>

      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-border">
        <div className="bg-navy p-5 text-white">
          <p className="text-sm text-slate-300">{ev.organizations.name}</p>
          <h1 className="font-heading text-2xl font-bold">{ev.name}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-200">
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden /> {formatEventRange(ev.starts_at, ev.ends_at)}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-slate-200">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {ev.venue}
          </p>
        </div>
        <div className="p-5">
          <LiveTicketQR ticketId={ticket.id} initialStatus={status} initialCheckedInAt={ticket.checked_in_at} />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
            <div>
              <div className="text-muted-foreground">Name</div>
              <div className="font-semibold text-navy">{ticket.holder_name}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Ticket</div>
              <div className="font-semibold text-navy">{ticket.ticket_types.name}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Code</div>
              <div className="font-mono font-semibold text-navy">{ticket.code}</div>
            </div>
          </div>
          {ticket.ticket_types.requires_student_card ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden /> Show your student card at the gate.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Show this live screen at the gate. Screenshots don&apos;t work – the code changes every 30 seconds.
          </p>
        </div>
      </div>

      {siblings && siblings.length > 1 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Tickets in this order</h2>
            <TicketLinkButton path={`/me/tickets/${ticket.id}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            {siblings.map((s, i) => (
              <Link
                key={s.id}
                href={`/me/tickets/${s.id}`}
                aria-current={s.id === ticket.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border",
                  s.id === ticket.id ? "bg-navy text-white" : "bg-white text-navy hover:bg-secondary",
                )}
              >
                #{i + 1} {s.ticket_types.name}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Each ticket has its own QR. Show each one separately at the gate.</p>
        </section>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, IdCard, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TicketQr } from "@/components/ticket-qr";
import { ticketQrDataUrl } from "@/lib/qr";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventRange, formatShortDateTime, formatTime } from "@/lib/format";
import { kindEmoji } from "@/lib/sessions";
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
      `id, code, status, checked_in_at, entry_at, holder_name, order_id, owner_id, ticket_type_id,
       ticket_types!inner ( name, requires_student_card, all_sessions ),
       events!inner ( id, name, venue, starts_at, ends_at, status, organizations!inner ( name ) )`,
    )
    .eq("id", ticketId)
    .eq("owner_id", user.id)
    .maybeSingle();
  // Someone else's ticket (or a wrong link) → "Not allowed" (acceptance criteria)
  // Printed tickets have no owner, so they never show up here.
  if (!ticket?.order_id) redirect("/not-allowed");

  const [{ data: siblings }, { data: sessions }, { data: links }, { data: scans }] = await Promise.all([
    supabase.from("tickets").select("id, code, ticket_types!inner ( name )").eq("order_id", ticket.order_id).order("created_at"),
    supabase.from("event_sessions").select("id, name, kind, starts_at, pass_access").eq("event_id", ticket.events.id).order("starts_at"),
    supabase.from("ticket_type_sessions").select("session_id").eq("ticket_type_id", ticket.ticket_type_id),
    supabase.from("session_checkins").select("session_id, checked_in_at").eq("ticket_id", ticket.id),
  ]);

  const ev = ticket.events;
  const status = ev.status === "cancelled" ? "cancelled" : ticket.status;
  // D-044: a festival ticket opens several sessions – keep the QR after the first scan
  const linked = new Set((links ?? []).map((l) => l.session_id));
  const opens = (sessions ?? []).filter((x) => linked.has(x.id) || (ticket.ticket_types.all_sessions && x.pass_access));
  const multiUse = Boolean(sessions?.length);
  const scannedAt = new Map((scans ?? []).map((x) => [x.session_id, x.checked_in_at]));
  const qrDataUrl = status === "valid" || (multiUse && status === "checked_in") ? await ticketQrDataUrl(ticket.id) : null;

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
          <TicketQr ticketId={ticket.id} code={ticket.code} qrDataUrl={qrDataUrl} initialStatus={status} initialCheckedInAt={ticket.checked_in_at} multiUse={multiUse} />
          {multiUse ? (
            <div className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm">
              <p className="mb-1 font-medium text-navy">This ticket opens</p>
              <ul className="grid gap-1">
                {ticket.ticket_types.all_sessions ? (
                  <li className="flex justify-between gap-2">
                    <span>Main entry</span>
                    <span className="text-xs text-muted-foreground">{ticket.entry_at ? `✓ ${formatTime(ticket.entry_at)}` : ""}</span>
                  </li>
                ) : null}
                {opens.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2">
                    <span>
                      {kindEmoji(x.kind)} {x.name} <span className="text-xs text-muted-foreground">· {formatShortDateTime(x.starts_at)}</span>
                    </span>
                    <span className="text-xs text-brand-strong">{scannedAt.get(x.id) ? `✓ ${formatTime(scannedAt.get(x.id)!)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
            Show this QR at the gate – it also works without internet (save it or use the one in your email).{" "}
            {multiUse ? "It is scanned once at each session it opens" : "Each ticket can be scanned only once"}, so don&apos;t share it.
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
          <p className="mt-2 text-xs text-muted-foreground">Each ticket has its own QR. Send each friend their own ticket QR – each works once.</p>
        </section>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, Hourglass, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { canRetry, effectiveStatus, getOrderForBuyer } from "@/lib/queries/orders";
import { formatDateTime, formatEventRange, formatPKR } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { DisputeForm } from "./dispute-form";

export const metadata: Metadata = { title: "Order status", robots: { index: false } };

// PAY-05: "Review mein hai" status page
export default async function OrderStatusPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await requireUser(`/checkout/${orderId}/status`);
  const data = await getOrderForBuyer(orderId, user.id);
  if (!data) redirect("/not-allowed");
  const { order, proofs, disputes } = data;
  const now = serverNow();
  const status = effectiveStatus(order, now);
  const ev = order.events;
  if (status === "awaiting_payment") redirect(`/checkout/${order.id}`);
  const openDispute = disputes.find((d) => d.status === "open");
  const lastDispute = disputes[0];

  const view = {
    under_review: {
      icon: Hourglass,
      tone: "text-blue-700",
      title: "Review mein hai",
      text: "Your payment is with the organizer for review. Your tickets stay reserved until they decide. We'll email you.",
    },
    approved: {
      icon: CheckCircle2,
      tone: "text-brand-strong",
      title: "Your tickets are ready!",
      text: "Show your QR at the gate – it's in My tickets and in your email, and works without internet.",
    },
    rejected: { icon: XCircle, tone: "text-destructive", title: "Payment not approved", text: order.reject_reason ?? "" },
    expired: { icon: Clock3, tone: "text-muted-foreground", title: "Order expired", text: "The 60 minute hold ended before a screenshot was uploaded." },
  }[status as "under_review" | "approved" | "rejected" | "expired"] ?? {
    icon: Clock3,
    tone: "text-muted-foreground",
    title: status,
    text: "",
  };
  const Icon = view.icon;

  return (
    <div className="grid gap-5">
      {status === "under_review" ? <AutoRefresh seconds={30} /> : null}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-8 text-center">
          <Icon className={`size-14 ${view.tone}`} aria-hidden />
          <h1 className="text-2xl font-bold text-navy">{view.title}</h1>
          {view.text ? <p className="max-w-md text-muted-foreground">{view.text}</p> : null}
          <StatusBadge status={status} />
          <div className="mt-2 grid w-full gap-1 rounded-lg bg-secondary p-4 text-left text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Event</span><span className="text-right font-medium">{ev.name}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">When</span><span className="text-right">{formatEventRange(ev.starts_at, ev.ends_at)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Order</span><span className="font-mono font-semibold">{order.ref_code}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Tickets</span><span>{order.order_items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatPKR(order.total_paisa, { freeLabel: "Free" })}</span></div>
            {Number(order.discount_paisa) > 0 ? (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Discount</span><span className="text-brand-strong">−{formatPKR(Number(order.discount_paisa))}</span></div>
            ) : null}
            {order.submitted_at ? (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Screenshot sent</span><span>{formatDateTime(order.submitted_at)}</span></div>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            {status === "approved" ? (
              <Button asChild variant="brand" size="lg">
                <Link href="/me/tickets">Open My tickets</Link>
              </Button>
            ) : null}
            {status === "rejected" && canRetry(order, now) ? (
              <Button asChild variant="brand" size="lg">
                <Link href={`/checkout/${order.id}`}>Upload a new screenshot</Link>
              </Button>
            ) : null}
            {status === "expired" ? (
              <Button asChild variant="brand" size="lg">
                <Link href={eventPath(ev.organizations.slug, ev.slug)}>Book again</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {proofs.length > 1 ? (
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-2 font-semibold text-navy">Upload history</h2>
            <ul className="grid gap-2 text-sm">
              {proofs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{formatDateTime(p.created_at)} · TID {p.transaction_id ?? "–"}</span>
                  <StatusBadge status={p.status === "pending" ? "under_review" : p.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* ADM-04: dispute */}
      {status === "under_review" || status === "rejected" ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            {openDispute ? (
              <p className="text-sm text-muted-foreground">
                You reported this order on {formatDateTime(openDispute.created_at)}. TickLO is looking into it.
              </p>
            ) : (
              <>
                {lastDispute?.status === "resolved" ? (
                  <p className="text-sm text-muted-foreground">TickLO&apos;s note on your last report: {lastDispute.admin_note ?? "Resolved."}</p>
                ) : null}
                <DisputeForm orderId={order.id} />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

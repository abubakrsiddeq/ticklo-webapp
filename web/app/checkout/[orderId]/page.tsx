import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, IdCard, Landmark, Wallet } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { requireUser } from "@/lib/auth";
import { canRetry, effectiveStatus, getOrderForBuyer } from "@/lib/queries/orders";
import { accountLabel } from "@/lib/payments/accounts";
import { formatEventRange, formatPKR } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { HoldTimer } from "./hold-timer";
import { ProofForm } from "./proof-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-base font-semibold break-all text-navy">{value}</div>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orderId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/checkout/${orderId}`);
  const data = await getOrderForBuyer(orderId, user.id);
  if (!data) redirect("/not-allowed");
  const { order, accounts } = data;
  const now = serverNow();
  const status = effectiveStatus(order, now);
  const ev = order.events;

  if (status === "under_review" || status === "approved") redirect(`/checkout/${order.id}/status`);
  if (!ev) notFound();

  const retry = canRetry(order, now);
  const paid = order.total_paisa > 0;
  const lastProof = data.proofs[0];

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={eventPath(ev.organizations.slug, ev.slug)} className="hover:underline">
            {ev.name}
          </Link>{" "}
          · {ev.organizations.name}
        </p>
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">{status === "rejected" ? "Payment not approved" : "Complete your payment"}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
          <CalendarDays className="size-4" aria-hidden /> {formatEventRange(ev.starts_at, ev.ends_at)}
        </p>
      </div>

      {sp.existing ? (
        <Alert>
          <AlertTitle>You already have a booking in progress</AlertTitle>
          <AlertDescription>Finish paying for this order first. If you don&apos;t pay, it expires and you can book again.</AlertDescription>
        </Alert>
      ) : null}

      {status === "expired" ? (
        <Card>
          <CardHeader>
            <CardTitle>Hold expired</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground">
              We didn&apos;t receive a payment screenshot within 60 minutes, so the tickets went back on sale (order {order.ref_code}).
            </p>
            <p className="text-sm text-muted-foreground">If you already sent money, book again and upload the same screenshot.</p>
            <Button asChild variant="brand">
              <Link href={eventPath(ev.organizations.slug, ev.slug)}>Book again</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {status === "rejected" ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Reason from the organizer</AlertTitle>
          <AlertDescription>{order.reject_reason ?? lastProof?.reject_reason ?? "Not given"}</AlertDescription>
        </Alert>
      ) : null}

      {status === "awaiting_payment" && order.hold_expires_at ? <HoldTimer until={order.hold_expires_at} /> : null}

      {(status === "awaiting_payment" || (status === "rejected" && retry)) ? (
        <>
          {/* PAY-03 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Send {paid ? "the payment" : "your details"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1 rounded-xl bg-navy p-4 text-white">
                <span className="text-sm text-slate-300">Total amount</span>
                <span className="font-heading text-3xl font-bold">{formatPKR(order.total_paisa, { freeLabel: "Free" })}</span>
                <span className="text-sm text-slate-300">
                  {order.ticket_count} ticket{order.ticket_count === 1 ? "" : "s"}:{" "}
                  {order.order_items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}
                </span>
              </div>
              <div className="rounded-xl border-2 border-brand bg-brand-soft p-3">
                <CopyRow label="Reference code" value={order.ref_code} />
                {paid ? (
                  <p className="text-sm font-medium text-navy">
                    Transfer ke remarks mein reference code likhein: <strong>{order.ref_code}</strong>
                  </p>
                ) : null}
              </div>
              {paid ? (
                accounts.length ? (
                  <div className="grid gap-3">
                    {accounts.map((a) => (
                      <div key={a.id} className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] px-4 py-2">
                        <div className="flex items-center gap-2 pt-2 font-semibold text-navy">
                          {a.kind === "bank" ? <Landmark className="size-4" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
                          {accountLabel(a)}
                        </div>
                        <div className="divide-y">
                          <CopyRow label="Account title" value={a.account_title} />
                          <CopyRow label={a.kind === "bank" ? "Account number" : "Mobile number"} value={a.account_number} />
                          {a.iban ? <CopyRow label="IBAN" value={a.iban} /> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertDescription>The organizer has not added payment accounts. Please contact the society.</AlertDescription>
                  </Alert>
                )
              ) : null}
              {order.requires_student_card ? (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden /> You must upload your student card photo and show the card at the gate.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* PAY-04 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Upload {paid ? "the payment screenshot" : "your student card"}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProofForm
                orderId={order.id}
                paid={paid}
                requiresCard={order.requires_student_card}
                accounts={accounts.map((a) => ({ id: a.id, label: `${accountLabel(a)} – ${a.account_number}` }))}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      {status === "rejected" && !retry ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <p className="text-muted-foreground">Ticket sale for this event is closed, so a new screenshot cannot be uploaded.</p>
            <Button asChild variant="outline">
              <Link href={`/checkout/${order.id}/status`}>Report a problem</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

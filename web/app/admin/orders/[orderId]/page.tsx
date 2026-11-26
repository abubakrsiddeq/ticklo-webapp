import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ZoomableImage } from "@/components/zoomable-image";
import { ActionButton } from "@/components/action-button";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDateTime, formatPKR, formatShortDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { accountLabel } from "@/lib/payments/accounts";
import { setUserSuspended } from "../../actions";
import { ResolveDispute } from "../../resolve-dispute";

export const metadata: Metadata = { title: "Order history" };

// ADM-03: the order's full history (payment, tickets, scans); ADM-04 dispute context + organizer contact
export default async function AdminOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requireAdmin("/admin/orders");
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      `*, events!inner ( id, name, slug, starts_at, status, org_id, organizations!inner ( id, name, slug ) ),
       order_items ( quantity, unit_price_paisa, ticket_types!inner ( name ) )`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();

  const [{ data: proofs }, { data: tickets }, { data: audit }, { data: disputes }, { data: buyer }, { data: team }] = await Promise.all([
    supabase
      .from("payment_proofs")
      .select("*, payment_accounts ( kind, bank_name, account_number )")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false }),
    supabase.from("tickets").select("id, code, status, holder_name, checked_in_at, checkin_method, ticket_types!inner ( name )").eq("order_id", order.id),
    supabase.from("audit_log").select("id, action, actor_id, details, created_at").eq("target_type", "order").eq("target_id", order.id).order("created_at"),
    supabase.from("disputes").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, phone, is_suspended").eq("id", order.user_id).maybeSingle(),
    supabase.rpc("org_team", { p_org_id: order.events.organizations.id }),
  ]);
  const ticketIds = (tickets ?? []).map((t) => t.id);
  const { data: scans } = ticketIds.length
    ? await supabase.from("checkins").select("id, ticket_id, result, method, device, detail, created_at, scanned_by").in("ticket_id", ticketIds).order("created_at")
    : { data: [] };
  const [shots, cards] = await Promise.all([
    signedUrls("payment-proofs", (proofs ?? []).map((p) => p.screenshot_path)),
    signedUrls("student-cards", (proofs ?? []).map((p) => p.student_card_path)),
  ]);
  const organizers = (team ?? []).filter((t) => t.role !== "scanner");
  const dupIds = [...new Set((proofs ?? []).flatMap((p) => p.duplicate_order_ids ?? []))];
  const { data: dupOrders } = dupIds.length ? await supabase.from("orders").select("id, ref_code").in("id", dupIds) : { data: [] };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/orders" className="text-sm text-muted-foreground hover:underline">
          ← Orders
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-navy">{order.ref_code}</h1>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Event</dt>
              <dd>
                <Link href={`/e/${order.events.organizations.slug}/${order.events.slug}`} className="underline">
                  {order.events.name}
                </Link>{" "}
                ({order.events.status})
              </dd>
              <dt className="text-muted-foreground">Society</dt>
              <dd>{order.events.organizations.name}</dd>
              <dt className="text-muted-foreground">Tickets</dt>
              <dd>{order.order_items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}</dd>
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">{formatPKR(order.total_paisa, { freeLabel: "Free" })}</dd>
              <dt className="text-muted-foreground">Booked</dt>
              <dd>{formatDateTime(order.created_at)}</dd>
              {order.submitted_at ? (
                <>
                  <dt className="text-muted-foreground">Screenshot sent</dt>
                  <dd>{formatDateTime(order.submitted_at)}</dd>
                </>
              ) : null}
              {order.decided_at ? (
                <>
                  <dt className="text-muted-foreground">Decided</dt>
                  <dd>
                    {formatDateTime(order.decided_at)}
                    {order.reject_reason ? ` – ${order.reject_reason}` : ""}
                  </dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="font-medium text-navy">Buyer</p>
              <p>
                {buyer?.full_name ?? order.buyer_name} · {buyer?.email ?? order.buyer_email} · {formatPhone(buyer?.phone ?? order.buyer_phone)}
              </p>
              {buyer ? (
                <div className="mt-2">
                  {buyer.is_suspended ? (
                    <ActionButton size="sm" variant="outline" action={setUserSuspended.bind(null, buyer.id, false, undefined)}>
                      Restore account
                    </ActionButton>
                  ) : (
                    <ActionButton
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      action={setUserSuspended.bind(null, buyer.id, true, `Fraud review of order ${order.ref_code}`)}
                      confirm={{ title: "Suspend this account?", description: "They will be logged out and cannot log in.", confirmLabel: "Suspend" }}
                    >
                      Suspend account
                    </ActionButton>
                  )}
                </div>
              ) : null}
            </div>
            <div>
              <p className="font-medium text-navy">Organizers (contact for disputes)</p>
              <ul>
                {organizers.map((t) => (
                  <li key={t.user_id}>
                    {t.full_name ?? "–"} ({t.role}) · {t.email} · {formatPhone(t.phone)}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment proofs ({proofs?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(proofs ?? []).map((p) => (
            <div key={p.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_240px]">
              <div className="grid gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status === "pending" ? "under_review" : p.status} />
                  <span className="text-muted-foreground">{formatDateTime(p.created_at)}</span>
                </div>
                {p.is_possible_duplicate ? (
                  <p className="flex items-center gap-1 font-semibold text-red-700">
                    <AlertTriangle className="size-4" aria-hidden /> Possible duplicate ({p.duplicate_reasons.join(", ")}):{" "}
                    {(dupOrders ?? [])
                      .filter((d) => p.duplicate_order_ids.includes(d.id))
                      .map((d) => (
                        <Link key={d.id} href={`/admin/orders/${d.id}`} className="font-mono underline">
                          {d.ref_code}
                        </Link>
                      ))}
                  </p>
                ) : null}
                <p>
                  TID <span className="font-mono">{p.transaction_id ?? "–"}</span> · sender {p.sender_name ?? "–"}
                </p>
                <p>Paid to: {p.payment_accounts ? `${accountLabel(p.payment_accounts)} · ${p.payment_accounts.account_number}` : "–"}</p>
                <p className="break-all font-mono text-xs text-muted-foreground">sha256 {p.image_hash ?? "–"}</p>
                {p.reject_reason ? <p>Reject reason: {p.reject_reason}</p> : null}
              </div>
              <div className="grid gap-2">
                {p.screenshot_path && shots.get(p.screenshot_path) ? (
                  <ZoomableImage src={shots.get(p.screenshot_path)!} alt="Payment screenshot" label="Screenshot" />
                ) : null}
                {p.student_card_path && cards.get(p.student_card_path) ? (
                  <ZoomableImage src={cards.get(p.student_card_path)!} alt="Student card" label="Student card" />
                ) : null}
              </div>
            </div>
          ))}
          {!proofs?.length ? <p className="text-sm text-muted-foreground">No payment proof uploaded.</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets & scans</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {(tickets ?? []).map((t) => (
              <div key={t.id} className="rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {t.ticket_types.name} · <span className="font-mono">{t.code}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {(scans ?? [])
                    .filter((s) => s.ticket_id === t.id)
                    .map((s) => (
                      <li key={s.id}>
                        {formatShortDateTime(s.created_at)} · {s.method} · {s.result} · {s.device ?? ""}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {!tickets?.length ? <p className="text-muted-foreground">No tickets (only approved orders get tickets).</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              <li>{formatShortDateTime(order.created_at)} · booked</li>
              {(proofs ?? [])
                .slice()
                .reverse()
                .map((p) => (
                  <li key={p.id}>{formatShortDateTime(p.created_at)} · screenshot uploaded</li>
                ))}
              {(audit ?? []).map((a) => (
                <li key={a.id}>
                  {formatShortDateTime(a.created_at)} · {a.action}
                  {(a.details as { reason?: string })?.reason ? ` – ${(a.details as { reason?: string }).reason}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {disputes?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Disputes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {disputes.map((d) => (
              <div key={d.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <StatusBadge status={d.status} />
                  <span className="text-xs text-muted-foreground">{formatShortDateTime(d.created_at)}</span>
                </div>
                <p className="whitespace-pre-line">{d.message}</p>
                {d.status === "open" ? <ResolveDispute id={d.id} /> : <p className="text-muted-foreground">Note: {d.admin_note ?? "–"}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

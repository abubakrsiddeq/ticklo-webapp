import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { ZoomableImage } from "@/components/zoomable-image";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatDateTime, formatPKR } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { accountLabel } from "@/lib/payments/accounts";
import { cn } from "@/lib/utils";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "Payments" };

const TABS = [
  { key: "review", label: "Review baqi", statuses: ["under_review"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "waiting", label: "Awaiting payment", statuses: ["awaiting_payment"] },
] as const;

// PAY-06 verification list, PAY-09 duplicate flags
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society, event: eventSlug } = await params;
  const sp = await searchParams;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/payments`);
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      `id, ref_code, status, total_paisa, ticket_count, buyer_name, buyer_phone, buyer_email, created_at, submitted_at,
       hold_expires_at, reject_reason, requires_student_card, discount_paisa, referral_source,
       print_sellers ( name, ref_code ), promo_codes ( code ),
       team_registrations ( team_name, member_count, event_sessions!inner ( name ) ),
       order_items ( quantity, ticket_types!inner ( name ) ),
       payment_proofs ( id, status, transaction_id, sender_name, screenshot_path, student_card_path, created_at,
         is_possible_duplicate, duplicate_order_ids, duplicate_reasons, reject_reason,
         payment_accounts ( kind, bank_name, account_number ) )`,
    )
    .eq("event_id", event.id)
    .in("status", [...tab.statuses])
    .order(tab.key === "review" ? "submitted_at" : "created_at", { ascending: tab.key === "review" })
    .limit(100);

  const list = (orders ?? []).map((o) => ({
    ...o,
    proof: [...(o.payment_proofs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
  }));

  // Ref codes for "possible duplicate" links
  const dupIds = [...new Set(list.flatMap((o) => o.proof?.duplicate_order_ids ?? []))];
  const { data: dupOrders } = dupIds.length
    ? await supabase.from("orders").select("id, ref_code, buyer_name, status").in("id", dupIds)
    : { data: [] };
  const dupMap = new Map((dupOrders ?? []).map((d) => [d.id, d]));

  // Short-lived signed links to the private images (NFR-15)
  const showImages = tab.key === "review" || tab.key === "rejected" || tab.key === "approved";
  const [shots, cards] = showImages
    ? await Promise.all([
        signedUrls("payment-proofs", list.map((o) => o.proof?.screenshot_path)),
        signedUrls("student-cards", list.map((o) => o.proof?.student_card_path)),
      ])
    : [new Map<string, string>(), new Map<string, string>()];

  const base = `/org/${org.slug}/events/${event.slug}/payments`;

  return (
    <div className="grid gap-4">
      {tab.key === "review" ? <AutoRefresh seconds={45} /> : null}
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            role="tab"
            aria-selected={t.key === tab.key}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-4 text-sm font-medium",
              t.key === tab.key ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-border hover:bg-secondary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={tab.key === "review" ? "Nothing to review" : "No orders here"} description={tab.key === "review" ? "New payment screenshots appear here." : undefined} />
      ) : (
        <ul className="grid gap-4">
          {list.map((o) => {
            const p = o.proof;
            const dup = Boolean(p?.is_possible_duplicate);
            return (
              <li key={o.id} className={cn("rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4", dup && "border-2 border-red-500")}>
                {dup ? (
                  <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-600 p-3 text-sm font-semibold text-white" role="alert">
                    <AlertTriangle className="size-5 shrink-0" aria-hidden />
                    <div>
                      Possible duplicate –{" "}
                      {(p?.duplicate_reasons ?? []).map((r) => (r === "transaction_id" ? "same transaction ID" : "same screenshot")).join(" and ")} used in:{" "}
                      {(p?.duplicate_order_ids ?? []).map((id) => {
                        const d = dupMap.get(id);
                        return d ? (
                          <span key={id} className="mr-2 inline-block font-mono">
                            {d.ref_code} ({d.buyer_name}, {d.status.replace("_", " ")})
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-[1fr_260px]">
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold text-navy">{o.ref_code}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Expected amount</dt>
                      <dd className="font-bold text-navy">{formatPKR(o.total_paisa, { freeLabel: "Free" })}</dd>
                      <dt className="text-muted-foreground">Tickets</dt>
                      <dd>{o.order_items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}</dd>
                      {Number(o.discount_paisa) > 0 ? (
                        <>
                          <dt className="text-muted-foreground">Discount</dt>
                          <dd>
                            −{formatPKR(Number(o.discount_paisa))}
                            {o.promo_codes ? <span className="ml-1 font-mono text-xs">({o.promo_codes.code})</span> : o.print_sellers ? <span className="ml-1 text-xs">(ambassador)</span> : null}
                          </dd>
                        </>
                      ) : null}
                      {(() => {
                        // one-to-one in our types; PostgREST may still send a list for a partial unique index
                        const raw = o.team_registrations as unknown;
                        const team = (Array.isArray(raw) ? raw[0] : raw) as { team_name: string; member_count: number; event_sessions: { name: string } } | null;
                        return team ? (
                          <>
                            <dt className="text-muted-foreground">Team</dt>
                            <dd>
                              🏆 {team.team_name} · {team.event_sessions.name} ({team.member_count} {team.member_count === 1 ? "member" : "members"})
                            </dd>
                          </>
                        ) : null;
                      })()}
                      {o.print_sellers ? (
                        <>
                          <dt className="text-muted-foreground">Ambassador</dt>
                          <dd>
                            {o.print_sellers.name} <span className="font-mono text-xs text-muted-foreground">{o.print_sellers.ref_code} · {o.referral_source === "code" ? "code" : "link"}</span>
                          </dd>
                        </>
                      ) : null}
                      <dt className="text-muted-foreground">Buyer</dt>
                      <dd>
                        {o.buyer_name} · {formatPhone(o.buyer_phone)}
                        {o.buyer_email ? <span className="block text-muted-foreground">{o.buyer_email}</span> : null}
                      </dd>
                      {p ? (
                        <>
                          <dt className="text-muted-foreground">Transaction ID</dt>
                          <dd className="font-mono font-semibold">{p.transaction_id ?? "–"}</dd>
                          <dt className="text-muted-foreground">Sender name</dt>
                          <dd>{p.sender_name ?? "–"}</dd>
                          <dt className="text-muted-foreground">Paid to</dt>
                          <dd>{p.payment_accounts ? `${accountLabel(p.payment_accounts)} · ${p.payment_accounts.account_number}` : "–"}</dd>
                          <dt className="text-muted-foreground">Uploaded</dt>
                          <dd>{formatDateTime(p.created_at)}</dd>
                        </>
                      ) : (
                        <>
                          <dt className="text-muted-foreground">Booked</dt>
                          <dd>{formatDateTime(o.created_at)}{o.hold_expires_at ? ` · hold until ${formatDateTime(o.hold_expires_at)}` : ""}</dd>
                        </>
                      )}
                      {o.status === "rejected" && o.reject_reason ? (
                        <>
                          <dt className="text-muted-foreground">Reject reason</dt>
                          <dd>{o.reject_reason}</dd>
                        </>
                      ) : null}
                    </dl>
                    {o.status === "under_review" ? (
                      <div className="mt-2">
                        <ReviewActions orgSlug={org.slug} orderId={o.id} refCode={o.ref_code} duplicate={dup} />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    {p?.screenshot_path && shots.get(p.screenshot_path) ? (
                      <ZoomableImage src={shots.get(p.screenshot_path)!} alt={`Payment screenshot for ${o.ref_code}`} label="Payment screenshot" />
                    ) : p ? (
                      <p className="text-sm text-muted-foreground">No screenshot (free ticket).</p>
                    ) : null}
                    {p?.student_card_path && cards.get(p.student_card_path) ? (
                      <ZoomableImage src={cards.get(p.student_card_path)!} alt={`Student card for ${o.ref_code}`} label="Student card" />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { Pill } from "@/components/status-badge";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { DECISION_ACTIONS, STUDENT_LABELS, studentReasonLabel } from "@/lib/decisions";
import { eventPath } from "@/lib/site";

export interface MyHistoryRow {
  id: number;
  action: string;
  created_at: string;
  decided_by: string | null;
  subject: string | null;
  extra: string | null;
  reason: string | null;
  amount_paisa: number | null;
  order_id: string | null;
  event_name: string | null;
  event_slug: string | null;
  org_slug: string | null;
}

/** D-078: a student's own approvals and rejections (payments, reports, teams, applications). */
export function MyHistoryList({ rows, compact = false }: { rows: MyHistoryRow[]; compact?: boolean }) {
  return (
    <ul className="grid gap-2">
      {rows.map((r) => {
        const meta = DECISION_ACTIONS[r.action];
        const tone = meta?.outcome === "approved" ? "success" : meta?.outcome === "rejected" ? "danger" : "neutral";
        const isOrder = r.action.startsWith("order.") || r.action === "dispute.resolve";
        return (
          <li key={r.id} className={compact ? "grid gap-0.5 text-sm" : "grid gap-1 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]"}>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={tone}>{STUDENT_LABELS[r.action] ?? meta?.label ?? r.action}</Pill>
              {compact ? null : (
                <>
                  <span className="font-semibold text-navy">
                    {isOrder && r.order_id ? (
                      <Link href={`/checkout/${r.order_id}/status`} className="font-mono text-brand-strong underline">
                        {r.subject}
                      </Link>
                    ) : (
                      r.subject
                    )}
                  </span>
                  {r.extra ? <span className="text-sm text-muted-foreground">· {r.extra}</span> : null}
                  {r.amount_paisa ? <span className="text-sm text-muted-foreground">· {formatPKR(r.amount_paisa)}</span> : null}
                </>
              )}
            </div>
            {compact ? null : r.event_name ? (
              <p className="text-sm">
                {r.event_slug && r.org_slug ? (
                  <Link href={eventPath(r.org_slug, r.event_slug)} className="underline">
                    {r.event_name}
                  </Link>
                ) : (
                  r.event_name
                )}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {r.decided_by === "You" ? "By you" : `By ${r.decided_by ?? "TickLO"}`} · {formatShortDateTime(r.created_at)}
            </p>
            {r.reason ? (
              <p className="text-sm whitespace-pre-line">
                <span className="font-medium">{studentReasonLabel(r.action)}:</span> {r.reason}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

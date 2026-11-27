import Link from "next/link";
import { Pill } from "@/components/status-badge";
import { formatShortDateTime } from "@/lib/format";
import { DECISION_ACTIONS, decisionReason, reasonLabel } from "@/lib/decisions";

export interface TimelineEntry {
  id: number;
  action: string;
  actor_id: string | null;
  details: unknown;
  created_at: string;
}

/** D-076: the earlier steps and decisions for one society or event (oldest first). */
export function DecisionTimeline({ entries, names }: { entries: TimelineEntry[]; names: Map<string, string> }) {
  if (!entries.length) return null;
  return (
    <details className="rounded-xl bg-secondary/50 px-3 py-2 text-sm" open={entries.some((e) => DECISION_ACTIONS[e.action]?.outcome === "rejected")}>
      <summary className="cursor-pointer font-medium text-navy">History ({entries.length})</summary>
      <ol className="mt-2 grid gap-2">
        {entries.map((e) => {
          const meta = DECISION_ACTIONS[e.action];
          const reason = decisionReason(e.details as Record<string, unknown>);
          return (
            <li key={e.id} className="grid gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={meta?.outcome === "approved" ? "success" : meta?.outcome === "rejected" ? "danger" : "info"}>{meta?.label ?? e.action}</Pill>
                <span className="text-muted-foreground">
                  {e.actor_id ? (
                    <>
                      by{" "}
                      <Link href={`/admin/users/${e.actor_id}`} className="underline">
                        {names.get(e.actor_id) ?? "Deleted account"}
                      </Link>
                    </>
                  ) : (
                    "by the system"
                  )}{" "}
                  · {formatShortDateTime(e.created_at)}
                </span>
              </div>
              {reason && e.action !== "org.resubmit" ? (
                <p className="whitespace-pre-line">
                  <span className="font-medium">{reasonLabel(e.action)}:</span> {reason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

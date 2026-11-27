import Link from "next/link";
import { History, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import {
  DECISION_ACTIONS,
  DECISION_KINDS,
  ORG_DECISION_KINDS,
  cleanSearch,
  orgDecisionActions,
  parseKind,
  parseResult,
  reasonLabel,
  type DecisionKind,
  type ResultFilter,
} from "@/lib/decisions";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/**
 * D-077: the society's record of approvals and rejections (society review, event
 * reviews, payments, team registrations, ambassador applications), read through
 * `org_decision_history` so organizers only ever see their own society.
 */
export async function OrgDecisionHistory({
  orgId,
  orgSlug,
  basePath,
  eventId,
  searchParams: sp,
}: {
  orgId: string;
  orgSlug: string;
  basePath: string;
  eventId?: string;
  searchParams: Record<string, string | undefined>;
}) {
  const forEvent = Boolean(eventId);
  const kinds = DECISION_KINDS.filter((k) => ORG_DECISION_KINDS.includes(k.key) && !(forEvent && k.key === "societies"));
  const parsed = parseKind(sp.kind);
  const kind = parsed && kinds.some((k) => k.key === parsed) ? parsed : null;
  const result = parseResult(sp.result);
  const q = cleanSearch(sp.q);
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_decision_history", {
    p_org_id: orgId,
    p_actions: orgDecisionActions(kind, result, forEvent),
    p_event_id: eventId ?? null,
    p_q: q || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Event names link to the event's dashboard (only needed on the society-wide page).
  const eventIds = forEvent ? [] : [...new Set(rows.map((r) => r.event_id).filter(Boolean))];
  const { data: evs } = eventIds.length ? await supabase.from("events").select("id, slug").in("id", eventIds) : { data: [] };
  const slugs = new Map((evs ?? []).map((e) => [e.id, e.slug]));

  const href = (p: { kind?: DecisionKind | null; result?: ResultFilter; page?: number; q?: string }) => {
    const params = new URLSearchParams();
    const k = p.kind === undefined ? kind : p.kind;
    const r = p.result ?? result;
    const query = p.q ?? q;
    if (k) params.set("kind", k);
    if (r !== "all") params.set("result", r);
    if (query) params.set("q", query);
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const str = params.toString();
    return `${basePath}${str ? `?${str}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap",
      active ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-border hover:bg-secondary",
    );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {forEvent
          ? "Every approval and rejection for this event: TickLO's review, payments, teams and ambassadors, with who decided, when and why."
          : "Every approval and rejection for your society: TickLO's reviews, payments, teams and ambassadors, with who decided, when and why."}{" "}
        This record cannot be edited.
      </p>

      <nav className="-mx-1 overflow-x-auto px-1" aria-label="Type">
        <ul className="flex min-w-max gap-2">
          <li>
            <Link href={href({ kind: null, page: 1 })} className={chip(!kind)} aria-current={!kind ? "page" : undefined}>
              All
            </Link>
          </li>
          {kinds.map((k) => (
            <li key={k.key}>
              <Link href={href({ kind: k.key, page: 1 })} className={chip(kind === k.key)} aria-current={kind === k.key ? "page" : undefined}>
                {k.key === "societies" ? "Society review" : k.key === "events" ? "Event reviews" : k.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2" role="group" aria-label="Result">
          {(
            [
              ["all", "Everything"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
            ] as const
          ).map(([key, label]) => (
            <Link key={key} href={href({ result: key, page: 1 })} className={chip(result === key)} aria-current={result === key ? "true" : undefined}>
              {label}
            </Link>
          ))}
        </div>
        <form className="flex min-w-0 flex-1 basis-64 gap-2" role="search">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          {result !== "all" ? <input type="hidden" name="result" value={result} /> : null}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search history</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder={forEvent ? "TL- reference, buyer, team or person" : "Event, TL- reference, buyer, team or person"} className="pl-9" />
          </label>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-destructive">History could not be loaded. Please refresh the page.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {total === 0 ? "Nothing found" : `${total.toLocaleString("en-PK")} ${total === 1 ? "entry" : "entries"}`}
          {q ? (
            <>
              {` for "${q}" · `}
              <Link href={href({ page: 1, q: "" })} className="text-brand-strong underline">
                clear search
              </Link>
            </>
          ) : null}
        </p>
      )}

      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((r) => {
            const meta = DECISION_ACTIONS[r.action];
            const kindLabel = meta?.kind === "societies" ? "Society" : (DECISION_KINDS.find((k) => k.key === meta?.kind)?.singular ?? "");
            const showEvent = !forEvent && r.event_id && meta?.kind !== "events";
            const eventSlug = r.event_id ? slugs.get(r.event_id) : undefined;
            return (
              <li key={r.id} className="grid gap-1 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={meta?.outcome === "approved" ? "success" : meta?.outcome === "rejected" ? "danger" : "info"}>{meta?.label ?? r.action}</Pill>
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kindLabel}</span>
                  <span className="font-semibold text-navy">
                    {meta?.kind === "events" && eventSlug ? (
                      <Link href={`/org/${orgSlug}/events/${eventSlug}`} className="text-brand-strong underline">
                        {r.subject}
                      </Link>
                    ) : (
                      r.subject
                    )}
                  </span>
                  {r.extra ? <span className="text-sm text-muted-foreground">· {r.extra}</span> : null}
                  {showEvent ? (
                    <span className="text-sm text-muted-foreground">
                      ·{" "}
                      {eventSlug ? (
                        <Link href={`/org/${orgSlug}/events/${eventSlug}`} className="underline">
                          {r.event_name}
                        </Link>
                      ) : (
                        r.event_name
                      )}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.actor_name ? `by ${r.actor_name}` : "by the system"} · {formatShortDateTime(r.created_at)}
                </p>
                {r.reason ? (
                  <p className="text-sm whitespace-pre-line">
                    <span className="font-medium">{reasonLabel(r.action)}:</span> {r.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : error ? null : (
        <EmptyState icon={History} title="Nothing here yet" description={q ? "Try another search or clear it." : "Approvals and rejections will show up here."} />
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Pages">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={href({ page: page - 1 })}>Newer</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={href({ page: page + 1 })}>Older</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { History, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import {
  DECISION_ACTIONS,
  DECISION_KINDS,
  cleanSearch,
  decisionActions,
  decisionReason,
  parseKind,
  parseResult,
  reasonLabel,
  type DecisionKind,
  type ResultFilter,
} from "@/lib/decisions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Decisions" };

const PAGE_SIZE = 50;

type Details = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : null);
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// D-076: every accept / reject (societies, events, payments, teams, ambassadors,
// universities, disputes, users) stays on record: who decided, when, and why.
export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/admin/decisions");
  const sp = await searchParams;
  const kind = parseKind(sp.kind);
  const result = parseResult(sp.result);
  const q = cleanSearch(sp.q);
  const page = Math.max(1, Math.min(1000, Number.parseInt(sp.page ?? "1", 10) || 1));
  const supabase = await createClient();

  const href = (p: { kind?: DecisionKind | null; result?: ResultFilter; page?: number; q?: string }) => {
    const params = new URLSearchParams();
    const k = p.kind === undefined ? kind : p.kind;
    const r = p.result ?? result;
    if (k) params.set("kind", k);
    if (r !== "all") params.set("result", r);
    const query = p.q ?? q;
    if (query) params.set("q", query);
    if (p.page && p.page > 1) params.set("page", String(p.page));
    const str = params.toString();
    return `/admin/decisions${str ? `?${str}` : ""}`;
  };

  // Search: names written in the record, plus current names of societies,
  // events, universities and people (so renamed or nameless rows still match).
  let searchFilter: string | null = null;
  if (q) {
    const like = `%${q}%`;
    const [orgs, events, unis, people] = await Promise.all([
      supabase.from("organizations").select("id").ilike("name", like).limit(50),
      supabase.from("events").select("id").ilike("name", like).limit(50),
      supabase.from("universities").select("id").ilike("name", like).limit(50),
      supabase.from("profiles").select("id").or(`full_name.ilike.*${q}*,email.ilike.*${q}*`).limit(50),
    ]);
    const targetIds = uniq([...(orgs.data ?? []), ...(events.data ?? []), ...(unis.data ?? []), ...(people.data ?? [])].map((r) => r.id));
    const personIds = uniq((people.data ?? []).map((r) => r.id));
    const parts = [`details->>name.ilike.*${q}*`, `details->>team.ilike.*${q}*`, `details->>ref_code.ilike.*${q}*`];
    if (targetIds.length) parts.push(`target_id.in.(${targetIds.join(",")})`);
    if (personIds.length) parts.push(`details->>user_id.in.(${personIds.join(",")})`, `actor_id.in.(${personIds.join(",")})`);
    searchFilter = parts.join(",");
  }

  let query = supabase
    .from("audit_log")
    .select("id, action, actor_id, target_type, target_id, details, created_at", { count: "exact" })
    .in("action", decisionActions(kind, result))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (searchFilter) query = query.or(searchFilter);
  const { data: rows, count } = await query;
  const list = (rows ?? []).map((r) => ({ ...r, details: (r.details ?? {}) as Details }));

  // Resolve names and links for what was decided on.
  const idsOf = (type: string) => uniq(list.filter((r) => r.target_type === type).map((r) => r.target_id)).filter(isUuid);
  const orgIds = idsOf("organization");
  const eventIds = idsOf("event");
  const orderIds = idsOf("order");
  const uniIds = uniq([...idsOf("university"), ...list.map((r) => s(r.details.into))]).filter(isUuid);
  const disputeIds = idsOf("dispute");
  const teamIds = uniq(list.filter((r) => r.action.startsWith("team.")).map((r) => s(r.details.registration_id))).filter(isUuid);
  const personIds = uniq([
    ...list.map((r) => r.actor_id),
    ...idsOf("user"),
    ...list.filter((r) => r.action.startsWith("ambassador.")).map((r) => s(r.details.user_id)),
  ]).filter(isUuid);

  const none = { data: [] as never[] };
  const [orgsRes, eventsRes, ordersRes, unisRes, disputesRes, teamsRes, peopleRes] = await Promise.all([
    orgIds.length ? supabase.from("organizations").select("id, name, slug, status").in("id", orgIds) : none,
    eventIds.length ? supabase.from("events").select("id, name, slug, status, organizations ( slug, name )").in("id", eventIds) : none,
    orderIds.length ? supabase.from("orders").select("id, ref_code, buyer_name, total_paisa, events ( name )").in("id", orderIds) : none,
    uniIds.length ? supabase.from("universities").select("id, name").in("id", uniIds) : none,
    disputeIds.length ? supabase.from("disputes").select("id, order_id, orders ( ref_code )").in("id", disputeIds) : none,
    teamIds.length ? supabase.from("team_registrations").select("id, team_name, reject_reason, event_sessions ( name )").in("id", teamIds) : none,
    personIds.length ? supabase.from("profiles").select("id, full_name, email, is_admin").in("id", personIds) : none,
  ]);
  const orgs = new Map((orgsRes.data ?? []).map((o) => [o.id, o]));
  const events = new Map((eventsRes.data ?? []).map((e) => [e.id, e]));
  const orders = new Map((ordersRes.data ?? []).map((o) => [o.id, o]));
  const unis = new Map((unisRes.data ?? []).map((u) => [u.id, u]));
  const disputes = new Map((disputesRes.data ?? []).map((d) => [d.id, d]));
  const teams = new Map((teamsRes.data ?? []).map((t) => [t.id, t]));
  const people = new Map((peopleRes.data ?? []).map((p) => [p.id, p]));
  const personName = (id: string | null) => {
    if (!id) return null;
    const p = people.get(id);
    return p ? (p.full_name ?? p.email ?? "Unknown") : "Deleted account";
  };

  const describe = (r: (typeof list)[number]): { subject: React.ReactNode; context?: React.ReactNode; reason: string | null } => {
    const d = r.details;
    const id = r.target_id ?? "";
    const link = (h: string, text: React.ReactNode) => (
      <Link href={h} className="text-brand-strong underline">
        {text}
      </Link>
    );
    const ev = events.get(id);
    const eventLink = ev
      ? ev.status === "published"
        ? link(`/e/${ev.organizations?.slug}/${ev.slug}`, ev.name)
        : ev.name
      : s(d.name) ?? "Deleted event";
    switch (DECISION_ACTIONS[r.action]?.kind) {
      case "societies": {
        const o = orgs.get(id);
        const name = o?.name ?? s(d.name) ?? "Deleted society";
        return { subject: o ? link(`/admin/societies/${id}`, name) : name, reason: decisionReason(d) };
      }
      case "events":
        return { subject: eventLink, context: ev?.organizations?.name, reason: decisionReason(d) };
      case "payments": {
        const o = orders.get(id);
        return {
          subject: link(`/admin/orders/${id}`, o?.ref_code ?? s(d.ref_code) ?? "Order"),
          context: o ? `${o.buyer_name} · ${formatPKR(o.total_paisa)} · ${o.events?.name ?? ""}` : undefined,
          reason: decisionReason(d),
        };
      }
      case "teams": {
        const t = teams.get(s(d.registration_id) ?? "");
        return {
          subject: t?.team_name ?? s(d.team) ?? "Team",
          context: (
            <>
              {t?.event_sessions?.name ? `${t.event_sessions.name} · ` : ""}
              {eventLink}
            </>
          ),
          reason: decisionReason(d) ?? (r.action === "team.reject" ? (t?.reject_reason ?? null) : null),
        };
      }
      case "ambassadors": {
        const uid = s(d.user_id);
        return {
          subject: uid ? link(`/admin/users/${uid}`, personName(uid)) : "Applicant",
          context: eventLink,
          reason: decisionReason(d),
        };
      }
      case "universities": {
        const into = s(d.into);
        return {
          subject: unis.get(id)?.name ?? s(d.name) ?? "Removed university",
          context: into ? `merged into ${unis.get(into)?.name ?? "another university"}` : s(d.city) ?? undefined,
          reason: decisionReason(d),
        };
      }
      case "disputes": {
        const dsp = disputes.get(id);
        return {
          subject: dsp ? link(`/admin/orders/${dsp.order_id}`, `Dispute on ${dsp.orders?.ref_code ?? "order"}`) : "Dispute",
          reason: decisionReason(d),
        };
      }
      case "users":
        return { subject: link(`/admin/users/${id}`, personName(id)), reason: decisionReason(d) };
      default:
        return { subject: r.target_type, reason: decisionReason(d) };
    }
  };

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap",
      active ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-border hover:bg-secondary",
    );

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Every approve and reject on TickLO, with who decided, when and the reason. This record cannot be edited or deleted.
      </p>

      <nav className="-mx-1 overflow-x-auto px-1" aria-label="Type">
        <ul className="flex min-w-max gap-2">
          <li>
            <Link href={href({ kind: null, page: 1 })} className={chip(!kind)} aria-current={!kind ? "page" : undefined}>
              All
            </Link>
          </li>
          {DECISION_KINDS.map((k) => (
            <li key={k.key}>
              <Link href={href({ kind: k.key, page: 1 })} className={chip(kind === k.key)} aria-current={kind === k.key ? "page" : undefined}>
                {k.label}
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
            <span className="sr-only">Search decisions</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Society, event, team, TL- reference or person" className="pl-9" />
          </label>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <p className="text-sm text-muted-foreground">
        {total === 0 ? "Nothing found" : `${total.toLocaleString("en-PK")} ${total === 1 ? "entry" : "entries"}`}
        {q ? ` for "${q}"` : ""}
        {q ? (
          <>
            {" · "}
            <Link href={href({ page: 1, q: "" })} className="text-brand-strong underline">
              clear search
            </Link>
          </>
        ) : null}
      </p>

      {list.length ? (
        <ul className="grid gap-2">
          {list.map((r) => {
            const meta = DECISION_ACTIONS[r.action];
            const kindLabel = DECISION_KINDS.find((k) => k.key === meta?.kind)?.singular ?? r.target_type;
            const { subject, context, reason } = describe(r);
            const actor = r.actor_id ? people.get(r.actor_id) : null;
            return (
              <li key={r.id} className="grid gap-1 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={meta?.outcome === "approved" ? "success" : meta?.outcome === "rejected" ? "danger" : "info"}>{meta?.label ?? r.action}</Pill>
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kindLabel}</span>
                  <span className="font-semibold text-navy">{subject}</span>
                  {context ? <span className="text-sm text-muted-foreground">· {context}</span> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.actor_id ? (
                    <>
                      by{" "}
                      <Link href={`/admin/users/${r.actor_id}`} className="underline">
                        {personName(r.actor_id)}
                      </Link>
                      {actor?.is_admin ? " (TickLO admin)" : ""}
                    </>
                  ) : (
                    "by the system"
                  )}{" "}
                  · {formatShortDateTime(r.created_at)}
                </p>
                {reason ? (
                  <p className="text-sm whitespace-pre-line">
                    <span className="font-medium">{reasonLabel(r.action)}:</span> {reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={History} title="No decisions here yet" description={q ? "Try another name or clear the search." : undefined} />
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

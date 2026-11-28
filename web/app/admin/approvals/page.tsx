import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import { formatEventRange, formatPKR, formatShortDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { reviewEvent, reviewOrganization } from "../actions";
import { ReviewButtons } from "../review-buttons";
import { DecisionTimeline } from "../decision-timeline";
import { DECISION_ACTIONS, decisionActions } from "@/lib/decisions";

export const metadata: Metadata = { title: "Approvals" };

// ADM-01 pending societies (details + proof), ADM-02 pending events
export default async function ApprovalsPage() {
  await requireAdmin("/admin/approvals");
  const supabase = await createClient();
  const [{ data: orgs }, { data: events }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, slug, name, type, about, logo_url, social_links, proof_path, created_at, created_by, universities ( name, status )")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("events")
      .select(
        `id, slug, name, venue, starts_at, ends_at, capacity, visibility, format, description, poster_url, submitted_at,
         organizations!inner ( slug, name, status ), ticket_types ( name, price_paisa, quantity, requires_student_card )`,
      )
      .eq("status", "pending_review")
      .order("submitted_at"),
  ]);
  const creatorIds = [...new Set((orgs ?? []).map((o) => o.created_by))];
  const { data: creators } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", creatorIds)
    : { data: [] };
  const creatorMap = new Map((creators ?? []).map((c) => [c.id, c]));
  // D-060: society head (president / chairperson / lead) for verification
  const orgIds = (orgs ?? []).map((o) => o.id);
  const { data: heads } = orgIds.length
    ? await supabase.from("organization_heads").select("org_id, is_submitter, name, phone, email").in("org_id", orgIds)
    : { data: [] };
  const headMap = new Map((heads ?? []).map((h) => [h.org_id, h]));
  const proofs = await signedUrls("org-proofs", (orgs ?? []).map((o) => o.proof_path), 900);

  // D-076: earlier decisions (e.g. rejected before, now resubmitted) next to each request
  const eventIds = (events ?? []).map((e) => e.id);
  const [{ data: orgLog }, { data: eventLog }] = await Promise.all([
    orgIds.length
      ? supabase.from("audit_log").select("id, action, actor_id, target_id, details, created_at").eq("target_type", "organization").in("target_id", orgIds).in("action", decisionActions("societies", "all")).order("id")
      : { data: [] },
    eventIds.length
      ? supabase.from("audit_log").select("id, action, actor_id, target_id, details, created_at").eq("target_type", "event").in("target_id", eventIds).in("action", decisionActions("events", "all")).order("id")
      : { data: [] },
  ]);
  const historyOf = (log: typeof orgLog, id: string) => {
    const entries = (log ?? []).filter((l) => l.target_id === id);
    return entries.some((l) => DECISION_ACTIONS[l.action]?.outcome !== "step") ? entries : [];
  };
  const actorIds = [...new Set([...(orgLog ?? []), ...(eventLog ?? [])].map((l) => l.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const actorNames = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? "Unknown"]));

  return (
    <div className="grid gap-8">
      <p className="-mb-4 text-sm text-muted-foreground">
        Approved and rejected requests stay on record in{" "}
        <Link href="/admin/decisions" className="text-brand-strong underline">
          Decisions
        </Link>
        .
      </p>
      <section>
        <h2 className="mb-3 text-xl font-semibold text-navy">Societies ({orgs?.length ?? 0})</h2>
        {orgs?.length ? (
          <ul className="grid gap-4">
            {orgs.map((o) => {
              const c = creatorMap.get(o.created_by);
              const head = headMap.get(o.id);
              const proofUrl = o.proof_path ? proofs.get(o.proof_path) : null;
              const links = Object.entries((o.social_links ?? {}) as Record<string, string>);
              return (
                <li key={o.id} className="grid gap-3 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
                  <div>
                    <p className="text-lg font-semibold text-navy">{o.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {o.type} · {o.universities ? `${o.universities.name}${o.universities.status === "pending" ? " (new university – check in Universities)" : ""}` : "University not listed"} · registered {formatShortDateTime(o.created_at)}
                    </p>
                  </div>
                  {o.about ? <p className="whitespace-pre-line text-sm">{o.about}</p> : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Registered by</dt>
                    <dd>
                      {c?.full_name ?? "–"} · {c?.email} · {c?.phone ?? "no phone"}
                    </dd>
                    <dt className="text-muted-foreground">Society head</dt>
                    <dd>
                      {head ? (
                        <>
                          {head.name} ·{" "}
                          <a href={`tel:${head.phone}`} className="text-brand-strong underline">
                            {formatPhone(head.phone)}
                          </a>{" "}
                          ·{" "}
                          <a href={`mailto:${head.email}`} className="text-brand-strong underline">
                            {head.email}
                          </a>
                          <span className="text-muted-foreground">{head.is_submitter ? " (entered by themselves from their account)" : " (entered by someone else, verify with them)"}</span>
                        </>
                      ) : (
                        "Not given"
                      )}
                    </dd>
                    <dt className="text-muted-foreground">Links</dt>
                    <dd className="flex flex-wrap gap-3">
                      {links.length
                        ? links.map(([k, v]) => (
                            <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="text-brand-strong underline">
                              {k}
                            </a>
                          ))
                        : "–"}
                    </dd>
                    <dt className="text-muted-foreground">Proof</dt>
                    <dd>
                      {proofUrl ? (
                        <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-strong underline">
                          <FileText className="size-4" aria-hidden /> Open proof (link valid 15 min)
                        </a>
                      ) : (
                        "No proof uploaded"
                      )}
                    </dd>
                  </dl>
                  <DecisionTimeline entries={historyOf(orgLog, o.id)} names={actorNames} />
                  <ReviewButtons name={o.name} review={reviewOrganization.bind(null, o.id)} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={CheckCircle2} title="No societies waiting" />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-navy">Events ({events?.length ?? 0})</h2>
        {events?.length ? (
          <ul className="grid gap-4">
            {events.map((e) => (
              <li key={e.id} className="grid gap-3 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold text-navy">{e.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {e.organizations.name} {e.organizations.status !== "approved" ? `(society ${e.organizations.status})` : ""} · submitted{" "}
                      {e.submitted_at ? formatShortDateTime(e.submitted_at) : "–"}
                    </p>
                  </div>
                  <Link
                    href={`/e/${e.organizations.slug}/${e.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-sm text-brand-strong underline"
                  >
                    Preview page <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </div>
                <p className="text-sm">
                  {formatEventRange(e.starts_at, e.ends_at)} · {e.venue} · {e.format === "festival" ? "festival (seats per session)" : `capacity ${e.capacity}`} · {e.visibility === "public" ? "public" : "link only"}
                </p>
                <ul className="text-sm">
                  {e.ticket_types.map((t) => (
                    <li key={t.name}>
                      • {t.name}: {formatPKR(t.price_paisa, { freeLabel: "Free" })} × {t.quantity}
                      {t.requires_student_card ? " (student card)" : ""}
                    </li>
                  ))}
                </ul>
                {e.description ? <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{e.description}</p> : null}
                <DecisionTimeline entries={historyOf(eventLog, e.id)} names={actorNames} />
                <ReviewButtons name={e.name} review={reviewEvent.bind(null, e.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={CheckCircle2} title="No events waiting" />
        )}
      </section>
    </div>
  );
}

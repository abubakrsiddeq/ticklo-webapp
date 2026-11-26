import type { Metadata } from "next";
import { AlertTriangle, Download, Lock, Megaphone, MessageCircle, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { Pill } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAmbassadorPage } from "@/lib/queries/ambassadors";
import { formatDate, formatPKR, formatShortDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { absoluteUrl } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { ambassadorInviteWhatsApp, ambassadorPath, discountLabel, milestoneProgress, rewardDue, rewardLabel, SAME_PHONE_FLAG } from "@/lib/referrals";
import { SellerDialog } from "@/components/print/sales/sales-forms";
import { ApplicationButtons, CodeDialog, DeletePayoutButton, PayoutDialog, ProgramSettingsForm, PromoActions, PromoDialog } from "@/components/ambassadors/organizer-forms";

export const metadata: Metadata = { title: "Ambassadors" };

const rs = (p: number) => formatPKR(p);

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "good" }) {
  return (
    <div className={`rounded-2xl p-4 shadow-card ring-1 ring-navy/[0.06] ${tone === "warn" ? "bg-warning-soft" : tone === "good" ? "bg-brand-soft" : "bg-white"}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-heading text-2xl font-bold text-navy tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "bad" | "good" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${strong ? "font-semibold text-navy" : "text-slate-700"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone === "bad" ? "font-semibold text-destructive" : tone === "good" ? "font-semibold text-brand-strong" : ""}`}>{value}</span>
    </div>
  );
}

/** D-043 (AMB-01 .. AMB-12): ambassadors, their links, numbers, rewards; promo codes; applications. */
export default async function AmbassadorsPage({ params }: { params: Promise<{ society: string; event: string }> }) {
  const { society, event: eventSlug } = await params;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/ambassadors`);
  const supabase = await createClient();
  const [page, { data: team }, { data: types }] = await Promise.all([
    getAmbassadorPage(event.id),
    supabase.rpc("org_team", { p_org_id: org.id }),
    supabase.from("ticket_types").select("id, name").eq("event_id", event.id).order("sort_order"),
  ]);
  const { rows, settings, promos, payouts, applications, totals } = page;
  const editable = event.status !== "cancelled";
  const live = event.status === "published";
  const teamOptions = (team ?? []).map((m) => ({ user_id: m.user_id, name: m.full_name || m.email }));
  const names = new Map(rows.map((r) => [r.seller_id, r.name]));
  const pending = applications.filter((a) => a.status === "pending");
  const typeNames = new Map((types ?? []).map((t) => [t.id, t.name]));
  const base = `/org/${org.slug}/events/${event.slug}/ambassadors`;
  const reward = rewardLabel(settings.reward_type, settings.reward_value);
  const discount = discountLabel(settings.discount_type, settings.discount_value);
  const now = serverNow();

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Ambassadors" value={String(rows.length)} sub={pending.length ? `${pending.length} waiting for you` : undefined} tone={pending.length ? "warn" : undefined} />
        <Tile
          label="Tickets they brought"
          value={String(totals.tickets)}
          sub={`${totals.pending ? `${totals.pending} more in review · ` : ""}${settings.credit_on === "checked_in" ? "scanned at gate" : "approved / sold"}`}
          tone="good"
        />
        <Tile label="Money they brought" value={rs(totals.revenue)} sub={totals.discount ? `after ${rs(totals.discount)} discounts` : undefined} />
        <Tile label="Rewards due" value={rs(Math.max(0, totals.reward - totals.paid))} sub={`${rs(totals.reward)} earned · ${rs(totals.paid)} given`} tone={totals.reward - totals.paid > 0 ? "warn" : undefined} />
      </div>

      {pending.length ? (
        <section className="grid gap-3">
          <h3 className="font-heading text-lg font-bold text-navy">Applications</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((a) => (
              <article key={a.id} className="grid gap-2 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                <div>
                  <p className="font-semibold text-navy">{a.full_name || a.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {[formatPhone(a.phone), a.university, `applied ${formatShortDateTime(a.created_at)}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {a.message ? <p className="rounded-xl bg-secondary/60 p-3 text-sm text-slate-700">{a.message}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {a.past_events ? `Ambassador at ${a.past_events} other ${a.past_events === 1 ? "event" : "events"} · brought ${a.past_tickets} tickets` : "First time as an ambassador"}
                </p>
                {editable ? <ApplicationButtons orgSlug={org.slug} applicationId={a.id} name={a.full_name || "this person"} /> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg font-bold text-navy">Ambassadors</h3>
            <p className="text-sm text-muted-foreground">
              Each one has a link and a code. Everyone who books through them counts for them – online and the paper tickets they sell.
            </p>
          </div>
          <div className="flex gap-2">
            {rows.length ? (
              <Button asChild variant="outline">
                <a href={`${base}/export`} download>
                  <Download /> CSV
                </a>
              </Button>
            ) : null}
            {editable ? <SellerDialog orgSlug={org.slug} eventId={event.id} trigger="add" addLabel="Add ambassador" team={teamOptions} /> : null}
          </div>
        </div>

        {rows.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => {
              const link = absoluteUrl(ambassadorPath(org.slug, event.slug, r.ref_code));
              const due = rewardDue(r.reward_paisa, r.paid_paisa);
              const ms = milestoneProgress(settings.milestones, r.credited_tickets);
              const settled = Boolean(r.settled_at);
              const flagged = r.max_orders_same_phone >= SAME_PHONE_FLAG;
              return (
                <article key={r.seller_id} className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-bold ${r.rank === 1 && r.credited_tickets > 0 ? "bg-brand text-navy" : "bg-secondary text-navy"}`}
                        aria-label={`Rank ${r.rank}`}
                      >
                        {r.credited_tickets > 0 && r.rank <= 3 ? <Trophy className="size-5" aria-hidden /> : `#${r.rank}`}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                          {r.name}
                          {settled ? (
                            <Pill tone="neutral">
                              <Lock className="mr-1 inline size-3" aria-hidden />
                              Closed
                            </Pill>
                          ) : null}
                          {r.joined_via === "application" ? <Pill tone="info">Applied</Pill> : null}
                        </p>
                        <p className="flex items-center gap-1 font-mono text-sm text-brand-strong">
                          {r.ref_code}
                          {editable ? <CodeDialog orgSlug={org.slug} sellerId={r.seller_id} code={r.ref_code} name={r.name} /> : null}
                        </p>
                        {r.phone ? <p className="text-xs text-muted-foreground">{formatPhone(r.phone)}</p> : null}
                      </div>
                    </div>
                    {editable ? (
                      <SellerDialog orgSlug={org.slug} eventId={event.id} trigger="edit" team={teamOptions} seller={{ id: r.seller_id, name: r.name, phone: r.phone, userId: r.user_id }} />
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-secondary px-3 py-2 text-xs">{link}</code>
                    <CopyButton value={link} label="Ambassador link" />
                  </div>

                  <div className="grid gap-1 rounded-xl bg-secondary/50 p-3">
                    <Line label="Link opens" value={String(r.clicks)} />
                    <Line label="Online tickets (approved)" value={`${r.online_tickets}${r.pending_tickets ? ` + ${r.pending_tickets} in review` : ""}`} />
                    {settings.credit_on === "checked_in" ? <Line label="  └ scanned at gate" value={String(r.online_checked_in)} /> : null}
                    <Line label="Paper tickets sold" value={String(r.paper_sold)} />
                    {settings.credit_on === "checked_in" ? <Line label="  └ scanned at gate" value={String(r.paper_used)} /> : null}
                    <Line label="Counts for them" value={String(r.credited_tickets)} strong />
                    <Line label="Money they brought" value={rs(r.credited_revenue_paisa)} />
                    {r.discount_paisa ? <Line label="Discounts given to buyers" value={rs(r.discount_paisa)} /> : null}
                    {settings.reward_type !== "none" || r.paid_paisa ? (
                      <>
                        <div className="my-1 border-t border-navy/10" />
                        <Line label="Reward earned" value={rs(r.reward_paisa)} strong />
                        <Line label="Given" value={rs(r.paid_paisa)} />
                        <Line label="Due" value={rs(due)} strong tone={due > 0 ? "bad" : undefined} />
                      </>
                    ) : null}
                  </div>

                  {ms.reached.length || ms.next ? (
                    <p className="text-xs text-muted-foreground">
                      {ms.reached.length ? `Reached: ${ms.reached.map((m) => `${m.reward} (${m.tickets})`).join(", ")}. ` : ""}
                      {ms.next ? `Next: ${ms.next.reward} at ${ms.next.tickets} (${ms.left} to go).` : "All milestones reached."}
                    </p>
                  ) : null}

                  {flagged ? (
                    <p className="flex items-start gap-1 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {r.max_orders_same_phone} orders came from the same phone number – check they are real buyers.
                    </p>
                  ) : null}

                  {editable ? (
                    <div className="flex flex-wrap gap-2">
                      {r.phone ? (
                        <Button asChild size="sm" variant="outline" className="border-[#25D366] text-[#128C4B]">
                          <a
                            href={ambassadorInviteWhatsApp({
                              name: r.name.split(" ")[0],
                              phone: r.phone,
                              eventName: event.name,
                              link,
                              code: r.ref_code,
                              dashboardUrl: r.user_id ? absoluteUrl(`/sell/${event.id}/promote`) : null,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle /> Send link on WhatsApp
                          </a>
                        </Button>
                      ) : null}
                      <PayoutDialog orgSlug={org.slug} eventId={event.id} sellerId={r.seller_id} name={r.name} due={due ? rs(due) : null} />
                    </div>
                  ) : null}
                  {!r.user_id ? <p className="text-xs text-muted-foreground">No TickLO account – they share the link; you see their numbers here.</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-card">
            <Megaphone className="size-10 text-brand-strong" aria-hidden />
            <p className="max-w-md text-sm text-muted-foreground">
              Add the people who promote your event – class reps, friends, team members. Each gets a personal link and code, a leaderboard and (if you want) a
              reward. Or turn on applications below and let students apply.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Program</CardTitle>
            <CardDescription>
              {[reward ? `Reward: ${reward}` : "No money reward", discount ? `Buyers get ${discount}` : null, settings.applications_open ? "Taking applications" : null]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProgramSettingsForm orgSlug={org.slug} eventId={event.id} settings={settings} disabled={!editable} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Promo codes</CardTitle>
                  <CardDescription>Early bird, group deals (“4 or more”), codes for one university…</CardDescription>
                </div>
                {editable ? <PromoDialog orgSlug={org.slug} eventId={event.id} ticketTypes={types ?? []} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              {promos.length ? (
                <ul className="divide-y">
                  {promos.map((p) => {
                    const used = p.uses > 0 || p.approved > 0;
                    const ended = p.ends_at && new Date(p.ends_at).getTime() < now;
                    return (
                      <li key={p.id} className="flex items-start justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold text-navy">{p.code}</span>
                            {!p.active ? <Pill tone="neutral">Off</Pill> : ended ? <Pill tone="neutral">Ended</Pill> : <Pill tone="success">On</Pill>}
                          </p>
                          <p className="text-sm text-slate-700">
                            {discountLabel(p.discount_type, p.discount_value)}
                            {p.min_tickets > 1 ? ` · ${p.min_tickets}+ tickets` : ""}
                            {p.ticket_type_ids?.length ? ` · ${p.ticket_type_ids.map((id) => typeNames.get(id) ?? "?").join(", ")}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.max_uses ? `${p.uses} of ${p.max_uses} used` : `${p.uses} used`}
                            {p.approved ? ` · ${rs(p.discount_paisa)} given on ${p.approved} paid orders` : ""}
                            {p.starts_at ? ` · from ${formatDate(p.starts_at)}` : ""}
                            {p.ends_at ? ` · until ${formatShortDateTime(p.ends_at)}` : ""}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                        {editable ? (
                          <div className="flex shrink-0">
                            <PromoDialog orgSlug={org.slug} eventId={event.id} ticketTypes={types ?? []} promo={p} />
                            <PromoActions orgSlug={org.slug} promoId={p.id} code={p.code} active={p.active} used={used} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No promo codes yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rewards given</CardTitle>
              <CardDescription>What your society handed over. TickLO never holds or sends money.</CardDescription>
            </CardHeader>
            <CardContent>
              {payouts.length ? (
                <ul className="divide-y text-sm">
                  {payouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="font-medium text-navy">{names.get(p.seller_id) ?? "Ambassador"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatShortDateTime(p.created_at)}
                          {p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`tabular-nums ${p.amount_paisa < 0 ? "text-destructive" : ""}`}>{p.amount_paisa ? rs(p.amount_paisa) : "Gift"}</span>
                        {editable ? <DeletePayoutButton orgSlug={org.slug} payoutId={p.id} /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recorded yet. Use “Reward given” on an ambassador.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {!live && editable ? <p className="text-sm text-muted-foreground">Links start working once TickLO approves the event.</p> : null}
    </div>
  );
}

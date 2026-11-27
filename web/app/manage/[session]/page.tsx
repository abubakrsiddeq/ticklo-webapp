import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, Download, MapPin, ScanLine, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventRange, formatPKR, formatShortDateTime, formatTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { feeLabel, kindEmoji, kindLabel, teamSizeLabel, type TeamMember } from "@/lib/sessions";
import { serverNow } from "@/lib/time";
import { signedUrls } from "@/lib/storage";
import { answerLabel, asForm, ticketFieldsOf, type FormField } from "@/lib/registration-form";
import { ResultsEditor, SessionCheckInButton, TeamDecision } from "@/components/sessions/manage-forms";

export const metadata: Metadata = { title: "Session" };

/** FES-12: one session for its managers and the organizers – attendees, answers, teams, results. */
export default async function ManageSessionPage({ params }: { params: Promise<{ session: string }> }) {
  const { session: sessionId } = await params;
  const user = await requireUser(`/manage/${sessionId}`);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_manage_session", { p_session_id: sessionId, p_user_id: user.id });
  if (!allowed) redirect("/not-allowed");
  const { data: s } = await supabase
    .from("event_sessions")
    .select("*, events!inner ( id, name, slug, venue, status, ends_at, organizations!inner ( slug, name ) )")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) notFound();
  const competition = s.kind === "competition";
  // D-069: what this session asks every ticket holder (its ticket form, or older settings)
  const questions = ticketFieldsOf(s.form, { names: s.attendee_names, university: s.attendee_university, questions: s.questions }).filter(
    (f) => !f.builtin && !f.hidden,
  );
  const [{ data: attendees }, { data: regs }, { data: counts }, { data: fee }] = await Promise.all([
    supabase.rpc("session_attendees", { p_session_id: sessionId }),
    competition ? supabase.rpc("session_registrations", { p_session_id: sessionId }) : Promise.resolve({ data: [] as never[] }),
    supabase.rpc("session_counts", { p_session_id: sessionId }),
    supabase.from("ticket_types").select("price_paisa").eq("registration_session_id", sessionId).maybeSingle(),
  ]);
  const ev = s.events;
  const now = serverNow();
  const live = ev.status === "published" && now <= new Date(ev.ends_at).getTime() + 6 * 3600 * 1000;
  const c = (counts as { checked_in: number; total_tickets: number } | null) ?? { checked_in: 0, total_tickets: 0 };
  const registrations = regs ?? [];
  // D-068: answers follow the competition's registration form; files open through short signed links
  const regForm = asForm(s.form);
  const fileIds = new Set([...regForm.member, ...regForm.team, ...questions].filter((f) => f.type === "file").map((f) => f.id));
  const filePaths = registrations.flatMap((r) => {
    const team = Object.entries((r.answers ?? {}) as Record<string, unknown>);
    const mem = ((Array.isArray(r.members) ? r.members : []) as { answers?: Record<string, unknown> }[]).flatMap((m) => Object.entries(m.answers ?? {}));
    return [...team, ...mem].filter(([k, v]) => fileIds.has(k) && typeof v === "string").map(([, v]) => v as string);
  });
  const ticketFiles = (attendees ?? []).flatMap((a) =>
    Object.entries((a.answers ?? {}) as Record<string, unknown>).filter(([k, v]) => fileIds.has(k) && typeof v === "string").map(([, v]) => v as string),
  );
  const fileUrls = await signedUrls("registration-files", [...filePaths, ...ticketFiles], 900);
  const show = (f: FormField, v: unknown) =>
    f.type === "file" && typeof v === "string" ? (
      fileUrls.get(v) ? (
        <a href={fileUrls.get(v)} target="_blank" rel="noopener noreferrer" className="text-brand-strong underline">
          Open file
        </a>
      ) : (
        "File"
      )
    ) : (
      answerLabel(f, v) || "-"
    );
  const customMember = regForm.member.filter((f) => !f.builtin);
  const paidTeams = registrations.filter((r) => r.status === "approved" && r.order_status === "approved");
  const results = (Array.isArray(s.results) ? s.results : []) as unknown as { label: string; name: string; registration_id?: string }[];

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {ev.organizations.name} · {ev.name}
        </p>
        <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold text-navy">
          {kindEmoji(s.kind)} {s.name} <Pill tone="neutral">{kindLabel(s.kind)}</Pill>
        </h1>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {formatEventRange(s.starts_at, s.ends_at)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {s.venue ?? ev.venue}
          </span>
          {competition ? (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" aria-hidden /> {teamSizeLabel(s.team_min, s.team_max)} · {feeLabel(fee?.price_paisa ?? 0, s.fee_mode)}
            </span>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {live ? (
            <Button asChild variant="brand">
              <Link href={`/scan/${ev.id}?session=${s.id}`}>
                <ScanLine /> Scan for this session
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <a href={`/manage/${s.id}/export`} download>
              <Download /> CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
          <div className="text-sm text-muted-foreground">{competition ? "Entry passes" : "Tickets"}</div>
          <div className="font-heading text-2xl font-bold text-navy">{c.total_tickets}</div>
          {s.capacity && !competition ? <div className="text-xs text-muted-foreground">of {s.capacity} seats</div> : null}
        </div>
        <div className="rounded-2xl bg-brand-soft p-4 shadow-card ring-1 ring-navy/[0.06]">
          <div className="text-sm text-muted-foreground">Checked in</div>
          <div className="font-heading text-2xl font-bold text-navy">{c.checked_in}</div>
        </div>
        {competition ? (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
              <div className="text-sm text-muted-foreground">Teams registered</div>
              <div className="font-heading text-2xl font-bold text-navy">{paidTeams.length}</div>
              <div className="text-xs text-muted-foreground">of {s.capacity} places</div>
            </div>
            <div className={`rounded-2xl p-4 shadow-card ring-1 ring-navy/[0.06] ${registrations.some((r) => r.status === "pending") ? "bg-warning-soft" : "bg-white"}`}>
              <div className="text-sm text-muted-foreground">Waiting for you</div>
              <div className="font-heading text-2xl font-bold text-navy">{registrations.filter((r) => r.status === "pending").length}</div>
            </div>
          </>
        ) : null}
      </div>

      {competition ? (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold text-navy">Teams</h2>
          {registrations.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {registrations.map((r) => {
                const members = (Array.isArray(r.members) ? r.members : []) as unknown as (TeamMember & { answers?: Record<string, unknown> })[];
                const answers = (r.answers ?? {}) as Record<string, unknown>;
                const payment =
                  r.status === "pending"
                    ? "Waiting for your decision"
                    : r.status === "rejected"
                      ? `Declined${r.reject_reason ? `: ${r.reject_reason}` : ""}`
                      : r.status === "withdrawn"
                        ? "Withdrawn by the team"
                        : r.order_status === "approved"
                          ? `Paid ✓ ${r.order_ref ?? ""}`
                          : r.order_status === "under_review"
                            ? "Payment sent – check it in Payments"
                            : r.order_status === "awaiting_payment" && r.hold_expires_at && new Date(r.hold_expires_at).getTime() > now
                              ? "Paying now (place held)"
                              : "Accepted – not paid yet";
                return (
                  <article key={r.id} className={`grid gap-2 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] ${r.status === "rejected" || r.status === "withdrawn" ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy">{r.team_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.leader_name} · {formatPhone(r.leader_phone)} · {r.leader_email} · {formatShortDateTime(r.created_at)}
                        </p>
                      </div>
                      {r.order_status ? <StatusBadge status={r.order_status} /> : null}
                    </div>
                    <p className="text-sm font-medium text-slate-700">{payment}</p>
                    <ol className="grid gap-0.5 rounded-xl bg-secondary/50 p-2 text-xs">
                      {members.map((m, i) => (
                        <li key={i}>
                          {i + 1}. <strong>{m.name}</strong>
                          {[m.roll_no, m.university, m.phone ? formatPhone(m.phone) : null, m.email].filter(Boolean).length
                            ? ` · ${[m.roll_no, m.university, m.phone ? formatPhone(m.phone) : null, m.email].filter(Boolean).join(" · ")}`
                            : ""}
                          {customMember.filter((f) => m.answers?.[f.id] !== undefined).map((f) => (
                            <span key={f.id} className="block pl-4 text-muted-foreground">
                              {f.label}: <span className="text-navy">{show(f, m.answers?.[f.id])}</span>
                            </span>
                          ))}
                        </li>
                      ))}
                    </ol>
                    {regForm.team.some((f) => answers[f.id] !== undefined || !f.hidden) ? (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                        {regForm.team
                          .filter((f) => answers[f.id] !== undefined || !f.hidden)
                          .map((f) => (
                            <div key={f.id} className="contents">
                              <dt className="text-muted-foreground">{f.label}</dt>
                              <dd>{show(f, answers[f.id])}</dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}
                    {r.order_status === "approved" ? (
                      <p className="text-xs text-muted-foreground">
                        {formatPKR(Number(r.order_total_paisa ?? 0), { freeLabel: "Free" })} · checked in {r.checked_in}/{r.tickets}
                      </p>
                    ) : null}
                    {(r.status === "pending" || (r.status === "approved" && r.order_status !== "approved" && r.order_status !== "under_review")) ? (
                      <TeamDecision sessionId={s.id} registrationId={r.id} team={r.team_name} canAccept={r.status === "pending"} />
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">No teams yet. Share the event link – teams register from the schedule.</p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-brand-strong" aria-hidden /> Results
              </CardTitle>
              <CardDescription>Shown on the event page once you tick “Show”.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResultsEditor sessionId={s.id} teams={paidTeams.map((t) => ({ id: t.id, name: t.team_name }))} initial={results} published={s.results_published} />
            </CardContent>
          </Card>
        </section>
      ) : (
        <section className="grid gap-3">
          <h2 className="text-xl font-bold text-navy">Attendees</h2>
          {attendees?.length ? (
            <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06]">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-secondary/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Ticket</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    {questions.map((q) => (
                      <th key={q.id} className="px-3 py-2 font-medium">
                        {q.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Checked in</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attendees.map((a) => {
                    const ans = (a.answers ?? {}) as Record<string, unknown>;
                    return (
                      <tr key={a.ticket_id}>
                        <td className="px-3 py-2 font-medium text-navy">
                          {a.holder_name}
                          {a.holder_university ? <div className="text-xs font-normal text-muted-foreground">{a.holder_university}</div> : null}
                        </td>
                        <td className="px-3 py-2">
                          {a.ticket_type}
                          <div className="font-mono text-xs text-muted-foreground">{a.serial ? `Printed ${a.serial}` : a.code}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{a.buyer_phone ? formatPhone(a.buyer_phone) : "-"}</td>
                        {questions.map((q) => (
                          <td key={q.id} className="px-3 py-2 text-xs">
                            {show(q, ans[q.id])}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          {a.session_checked_in_at ? (
                            <span className="text-brand-strong">✓ {formatTime(a.session_checked_in_at)}</span>
                          ) : live ? (
                            <SessionCheckInButton sessionId={s.id} ticketId={a.ticket_id} name={a.holder_name} />
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-2xl bg-white p-6 text-sm text-muted-foreground shadow-card">No tickets for this session yet.</p>
          )}
        </section>
      )}
    </div>
  );
}

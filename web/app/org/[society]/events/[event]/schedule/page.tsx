import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, ChevronRight, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/status-badge";
import { requireOrgEvent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatTime, toPKTInputValue } from "@/lib/format";
import { asQuestions, feeLabel, groupByDay, kindEmoji, kindLabel, teamSizeLabel } from "@/lib/sessions";
import { DeleteSessionButton, SessionDialog, SessionManagers, type SessionValue } from "@/components/sessions/session-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SetupChecklist } from "@/components/sessions/setup-checklist";
import { getSetupSteps } from "@/lib/queries/setup";
import { asEventFormat } from "@/lib/sessions";

export const metadata: Metadata = { title: "Schedule" };

/** D-044 (FES-01, FES-08, FES-12, FES-14): the festival's sessions, seats, managers. */
export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society, event: eventSlug } = await params;
  const sp = await searchParams;
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/schedule`);
  const supabase = await createClient();
  const [{ data: sessions }, { data: stats }, { data: managers }, { data: team }] = await Promise.all([
    supabase.rpc("event_schedule", { p_event_id: event.id }),
    supabase.rpc("session_stats", { p_event_id: event.id }),
    supabase.from("session_managers").select("session_id, user_id, event_sessions!inner ( event_id )").eq("event_sessions.event_id", event.id),
    supabase.rpc("org_team", { p_org_id: org.id }),
  ]);
  const list = sessions ?? [];
  const statOf = new Map((stats ?? []).map((s) => [s.session_id, s]));
  const teamOptions = (team ?? []).map((m) => ({ user_id: m.user_id, name: m.full_name || m.email || "Team member" }));
  const names = new Map(teamOptions.map((t) => [t.user_id, t.name]));
  const editable = event.status !== "cancelled";
  const defaultStart = toPKTInputValue(event.starts_at);
  const format = asEventFormat(event.format);
  const steps = event.status === "published" || event.status === "cancelled" ? null : await getSetupSteps(event, `/org/${org.slug}/events/${event.slug}`);
  const isCompetition = format === "competition";

  return (
    <div className="grid gap-6">
      {steps ? <SetupChecklist steps={steps} format={format} /> : null}
      {sp.created ? (
        <Alert>
          <AlertDescription>
            {isCompetition
              ? "Draft created. Set up your competition below: team size, entry fee and how many teams can take part."
              : "Draft created. Now add the sessions – each workshop, competition, night or talk – then create passes and session tickets on Edit & tickets."}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="font-heading text-lg font-bold text-navy">{isCompetition ? "Competition" : "Schedule"}</h3>
          <p className="text-sm text-muted-foreground">
            {isCompetition ? (
              <>Teams register from the event page, pay the entry fee (or wait for shortlisting) and get one pass per team or per member. You can add more than one competition (e.g. categories).</>
            ) : (
              <>
                Add each workshop, competition, qawwali night or talk as a session. Then on <strong>Edit &amp; tickets</strong> choose what each ticket opens: a
                pass, or only some sessions. Competitions get team registration.
              </>
            )}
          </p>
        </div>
        {editable ? (
          <SessionDialog
            orgSlug={org.slug}
            eventId={event.id}
            defaultStart={defaultStart}
            eventVenue={event.venue}
            defaultKind={isCompetition || sp.add === "competition" ? "competition" : "workshop"}
            defaultOpen={sp.add === "competition" && !list.length}
            addLabel={isCompetition ? "Add competition" : "Add session"}
          />
        ) : null}
      </div>

      {list.length ? (
        groupByDay(list).map((day) => (
          <section key={day.day} className="grid gap-3">
            <h4 className="flex items-center gap-2 font-semibold text-navy">
              <CalendarRange className="size-4 text-brand-strong" aria-hidden /> {day.label}
            </h4>
            <div className="grid gap-3">
              {day.sessions.map((s) => {
                const st = statOf.get(s.id);
                const competition = s.kind === "competition";
                const value: SessionValue = {
                  id: s.id,
                  name: s.name,
                  kind: s.kind,
                  description: s.description,
                  venue: s.venue,
                  starts_at: s.starts_at,
                  ends_at: s.ends_at,
                  capacity: s.capacity,
                  pass_access: s.pass_access,
                  questions: asQuestions(s.questions),
                  team_min: s.team_min,
                  team_max: s.team_max,
                  fee_mode: s.fee_mode,
                  fee_paisa: s.fee_paisa,
                  needs_approval: s.needs_approval,
                  registration_ends_at: competition ? s.registration_ends_at : null,
                };
                const mine = (managers ?? []).filter((m) => m.session_id === s.id).map((m) => ({ user_id: m.user_id, name: names.get(m.user_id) ?? "Team member" }));
                return (
                  <article key={s.id} className="grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg" aria-hidden>
                          {kindEmoji(s.kind)}
                        </span>
                        <p className="font-semibold text-navy">{s.name}</p>
                        <Pill tone="neutral">{kindLabel(s.kind)}</Pill>
                        {s.pass_access ? <Pill tone="success">In passes</Pill> : null}
                        {competition && s.needs_approval ? <Pill tone="info">Shortlisting</Pill> : null}
                        {Array.isArray(s.results) && s.results.length ? <Pill tone="warning">Results published</Pill> : null}
                      </div>
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5" aria-hidden /> {formatTime(s.starts_at)}–{formatTime(s.ends_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {s.venue ?? event.venue}
                        </span>
                        {competition ? (
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" aria-hidden /> {teamSizeLabel(s.team_min, s.team_max)} · {feeLabel(s.fee_paisa, s.fee_mode)}
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2 text-sm">
                        {competition ? (
                          <>
                            <span className="rounded-lg bg-secondary px-2 py-1">
                              Teams: <strong>{st?.teams_paid ?? 0}</strong> paid · {st?.taken ?? 0}/{s.capacity} places held
                            </span>
                            {st?.teams_pending ? <span className="rounded-lg bg-warning-soft px-2 py-1">{st.teams_pending} waiting for you</span> : null}
                          </>
                        ) : (
                          <span className="rounded-lg bg-secondary px-2 py-1">
                            Tickets: <strong>{st?.tickets ?? 0}</strong>
                            {s.capacity ? ` · ${st?.taken ?? 0}/${s.capacity} seats taken` : ""}
                          </span>
                        )}
                        <span className="rounded-lg bg-brand-soft px-2 py-1">Checked in: {st?.checked_in ?? 0}</span>
                        {asQuestions(s.questions).length ? <span className="rounded-lg bg-secondary px-2 py-1">{asQuestions(s.questions).length} questions</span> : null}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Session managers</p>
                        {editable ? (
                          <SessionManagers orgSlug={org.slug} sessionId={s.id} managers={mine} team={teamOptions} />
                        ) : (
                          <p className="text-sm">{mine.map((m) => m.name).join(", ") || "—"}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-1 md:flex-col md:items-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/manage/${s.id}`}>
                          {competition ? "Teams & results" : "Attendees"} <ChevronRight />
                        </Link>
                      </Button>
                      {editable ? (
                        <div className="flex">
                          <SessionDialog orgSlug={org.slug} eventId={event.id} session={value} defaultStart={defaultStart} eventVenue={event.venue} />
                          <DeleteSessionButton orgSlug={org.slug} sessionId={s.id} name={s.name} />
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center shadow-card">
          <CalendarRange className="size-10 text-brand-strong" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            {isCompetition
              ? "No competition yet. Click “Add competition” to set the team size, entry fee and number of teams."
              : "No sessions yet. Add the first workshop, competition, night or talk."}
          </p>
        </div>
      )}
    </div>
  );
}

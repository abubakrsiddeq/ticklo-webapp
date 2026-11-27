import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Trophy, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getEventPage } from "@/lib/queries/public";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatEventRange } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { eventPath } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { competitionState, feeLabel, participationOf, seatsLabel, teamSizeLabel } from "@/lib/sessions";
import { TeamForm } from "./team-form";

export const metadata: Metadata = { title: "Register", robots: { index: false } };

type Params = { society: string; event: string; session: string };

/** FES-10: team registration for a competition inside a festival. */
export default async function RegisterTeamPage({ params }: { params: Promise<Params> }) {
  const { society, event: eventSlug, session: sessionId } = await params;
  const back = eventPath(society, eventSlug);
  const user = await requireUser(`${back}/register/${sessionId}`);
  const data = await getEventPage(society, eventSlug);
  if (!data) notFound();
  const s = data.sessions.find((x) => x.id === sessionId && x.kind === "competition");
  if (!s) notFound();
  const { event, org } = data;
  const supabase = await createClient();
  const { data: mine } = await supabase.from("team_registrations").select("id, team_name, status").eq("session_id", s.id).eq("user_id", user.id).in("status", ["pending", "approved"]).maybeSingle();
  const now = serverNow();
  const closesAt = s.registration_ends_at ? new Date(s.registration_ends_at).getTime() : new Date(s.starts_at).getTime();
  // D-064: same rule as the schedule and the sidebar card
  const state = competitionState(s, now, event.status === "published");
  const full = state === "full";
  const closed = state === "closed" || state === "not_open";
  const solo = participationOf(s.team_max) === "individual";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={back} className="text-sm text-muted-foreground hover:underline">
        ← {event.name}
      </Link>
      {s.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.poster_url} alt={`${s.name} poster`} className="mt-3 max-h-80 w-full rounded-3xl bg-navy object-contain shadow-card" />
      ) : null}
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold text-navy">
        <Trophy className="size-7 text-brand-strong" aria-hidden /> {s.name}
      </h1>
      <p className="text-muted-foreground">
        {org.name} · {event.name}
      </p>
      <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand-strong" aria-hidden /> {formatEventRange(s.starts_at, s.ends_at)}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 text-brand-strong" aria-hidden /> {s.venue ?? event.venue}
        </li>
        <li className="flex items-center gap-2">
          <Users className="size-4 text-brand-strong" aria-hidden /> {teamSizeLabel(s.team_min, s.team_max)} · {feeLabel(s.fee_paisa, s.fee_mode)}
        </li>
        <li className="text-muted-foreground">
          {seatsLabel(s) ?? ""} {closed ? "" : `· register by ${formatDateTime(new Date(closesAt).toISOString())}`}
        </li>
      </ul>
      {s.description ? <p className="mt-4 whitespace-pre-line text-slate-700">{s.description}</p> : null}

      <div className="mt-6">
        {mine ? (
          <Alert>
            <AlertTitle>{solo ? "You are already registered" : `You already registered “${mine.team_name}”`}</AlertTitle>
            <AlertDescription>
              {mine.status === "pending"
                ? `Waiting for the organizer to accept your ${solo ? "application" : "team"}.`
                : `See it, change ${solo ? "your details" : "members"} or pay (if needed) in My tickets.`}{" "}
              <Link href="/me/tickets#teams" className="font-medium underline">
                Open My tickets
              </Link>
            </AlertDescription>
          </Alert>
        ) : closed || full ? (
          <Alert>
            <AlertTitle>{full ? "This competition is full" : "Registration is closed"}</AlertTitle>
            <AlertDescription>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href={back}>Back to the event</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <TeamForm
            eventId={event.id}
            sessionId={s.id}
            teamMin={s.team_min}
            teamMax={s.team_max}
            feePaisa={s.fee_paisa ?? 0}
            feeMode={s.fee_mode}
            needsApproval={s.needs_approval}
            questions={s.questions}
            memberRequired={s.member_required ?? []}
            profileIncomplete={!user.profile.full_name || !user.profile.phone}
            leader={{ name: user.profile.full_name ?? "", phone: formatPhone(user.profile.phone), email: user.email }}
          />
        )}
      </div>
    </div>
  );
}

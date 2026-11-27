import Link from "next/link";
import { Clock, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaitlistButton, type WaitlistEntry } from "@/components/waitlist-button";
import { formatDateTime, formatEventRange } from "@/lib/format";
import { competitionCta, competitionState, seatsLabel, teamSizeLabel, competitionFeeText } from "@/lib/sessions";

export interface CardCompetition {
  id: string;
  name: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  remaining: number | null;
  team_min: number;
  team_max: number;
  fee_mode: string;
  fee_paisa: number | null;
  needs_approval: boolean;
  registration_ends_at: string | null;
  registration_type_id: string | null;
  early_fee_paisa?: number | null;
  early_until?: string | null;
}

/** D-064: the main call to action of a competition event, in the sidebar (not below the description). */
export function CompetitionCard({
  competitions,
  registerBase,
  now,
  eventOpen,
  notOpenText,
  title,
  waitlist,
  loggedIn = false,
  loginHref = "/login",
}: {
  competitions: CardCompetition[];
  registerBase: string;
  now: number;
  eventOpen: boolean;
  /** Why registration is not open (preview, cancelled, ended). */
  notOpenText: string;
  /** D-070: e.g. "🏆 Compete" inside a festival */
  title?: string;
  /** D-071: my waitlist entries by competition */
  waitlist?: Record<string, WaitlistEntry>;
  loggedIn?: boolean;
  loginHref?: string;
}) {
  return (
    <section id="register" aria-labelledby="register-heading" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-lift ring-1 ring-navy/[0.06] sm:p-6">
      <h2 id="register-heading" className="mb-4 flex items-center gap-2 font-heading text-xl font-bold text-navy">
        <Trophy className="size-5 text-brand-strong" aria-hidden /> {title ?? (competitions.length > 1 ? "Competitions" : "Register")}
      </h2>
      <ul className="grid gap-3">
        {competitions.map((s) => {
          const state = competitionState(s, now, eventOpen);
          const seats = seatsLabel(s);
          return (
            <li key={s.id} className="grid gap-2 rounded-2xl border border-navy/10 p-4">
              <p className="font-semibold text-navy">{s.name}</p>
              <p className="text-xs text-muted-foreground">{formatEventRange(s.starts_at, s.ends_at)}</p>
              <p className="flex items-center gap-1.5 text-sm text-slate-700">
                <Users className="size-4 shrink-0 text-brand-strong" aria-hidden /> {teamSizeLabel(s.team_min, s.team_max)} · {competitionFeeText(s, now)}
              </p>
              {state === "open" ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" aria-hidden /> Register by {formatDateTime(s.registration_ends_at ?? s.starts_at)}
                  {seats ? ` · ${seats}` : ""}
                </p>
              ) : null}
              {state === "open" ? (
                <Button asChild variant="brand" className="mt-1 w-full">
                  <Link href={`${registerBase}/${s.id}`}>{competitionCta(s)}</Link>
                </Button>
              ) : state === "full" ? (
                <div className="grid gap-2 rounded-lg bg-secondary p-2 text-center">
                  <p className="text-sm font-medium text-navy">Full</p>
                  <WaitlistButton sessionId={s.id} entry={waitlist?.[s.id]} loggedIn={loggedIn} loginHref={loginHref} className="justify-self-center" />
                </div>
              ) : state === "closed" ? (
                <p className="rounded-lg bg-secondary p-2 text-center text-sm font-medium text-navy">Registration closed</p>
              ) : (
                <p className="rounded-lg bg-secondary p-2 text-center text-sm text-muted-foreground">{notOpenText}</p>
              )}
              {s.needs_approval && state === "open" ? (
                <p className="text-xs text-muted-foreground">The organizer reviews applications first; accepted entries have 48 hours to pay.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

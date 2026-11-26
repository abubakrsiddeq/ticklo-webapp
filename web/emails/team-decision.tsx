import { CTA, EmailLayout, H1, P } from "./layout";

export interface TeamDecisionProps {
  name: string;
  teamName: string;
  competition: string;
  eventName: string;
  approved: boolean;
  reason?: string | null;
  feeText: string;
  url: string;
}

// FES-11: the organizer accepted or declined a team (shortlisting)
export default function TeamDecisionEmail(p: TeamDecisionProps) {
  return (
    <EmailLayout preview={`${p.teamName}: ${p.approved ? "accepted" : "not accepted"} for ${p.competition}`}>
      <H1>{p.approved ? `${p.teamName} is accepted 🎉` : `${p.teamName} was not accepted`}</H1>
      <P>Hi {p.name},</P>
      {p.approved ? (
        <>
          <P>
            Your team is accepted for {p.competition} at {p.eventName}.{" "}
            {p.feeText === "Free" ? "Confirm your place on TickLO to get your entry pass." : `Pay the entry fee (${p.feeText}) on TickLO to confirm your place.`}
          </P>
          <P>Places go to the teams that pay first, so don&apos;t wait too long.</P>
        </>
      ) : (
        <>
          <P>
            The organizers of {p.eventName} could not accept your team for {p.competition}.
          </P>
          {p.reason ? <P>Reason: {p.reason}</P> : null}
        </>
      )}
      <CTA href={p.url}>{p.approved ? (p.feeText === "Free" ? "Confirm place" : "Pay now") : "Open TickLO"}</CTA>
    </EmailLayout>
  );
}

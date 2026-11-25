import { CTA, EmailLayout, H1, P } from "./layout";

export interface ReviewDecisionProps {
  kind: "society" | "event";
  name: string;
  subjectName: string;
  approved: boolean;
  note?: string | null;
  url: string;
}

// EML-07: admin approved/rejected a society or an event
export default function ReviewDecisionEmail(p: ReviewDecisionProps) {
  const what = p.kind === "society" ? "society" : "event";
  return (
    <EmailLayout preview={`Your ${what} ${p.subjectName} was ${p.approved ? "approved" : "not approved"}`}>
      <H1>{p.approved ? `Your ${what} is approved ✅` : `Your ${what} was not approved`}</H1>
      <P>Hi {p.name},</P>
      {p.approved ? (
        <P>
          {p.kind === "society"
            ? `${p.subjectName} is now live on TickLO. You can create events and invite your team.`
            : `${p.subjectName} is now published and tickets are on sale. Share the link with your audience!`}
        </P>
      ) : (
        <>
          <P>TickLO could not approve {p.subjectName}.</P>
          {p.note ? <P>Reason: {p.note}</P> : null}
          <P>Please update the details and submit again.</P>
        </>
      )}
      <CTA href={p.url}>{p.approved && p.kind === "event" ? "View event page" : "Open dashboard"}</CTA>
    </EmailLayout>
  );
}

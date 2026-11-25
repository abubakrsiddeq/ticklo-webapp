import { Details, EmailLayout, H1, P } from "./layout";

export interface EventCancelledProps {
  name: string;
  eventName: string;
  eventDate: string;
  orgName: string;
  reason: string;
  contact?: string | null;
}

// EML-05: organizer cancelled the event. Refunds are handled by the organizer (rule 10).
export default function EventCancelledEmail(p: EventCancelledProps) {
  return (
    <EmailLayout preview={`${p.eventName} has been cancelled`}>
      <H1>Event cancelled</H1>
      <P>Hi {p.name}, we are sorry – {p.orgName} has cancelled {p.eventName}.</P>
      <Details rows={[["Event", p.eventName], ["Was on", p.eventDate], ["Reason", p.reason]]} />
      <P>
        Your tickets for this event are no longer valid. For any payment you made, please contact {p.orgName}
        {p.contact ? ` (${p.contact})` : ""} directly – they will handle refunds. TickLO does not hold your money.
      </P>
    </EmailLayout>
  );
}

import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface EventReminderProps {
  name: string;
  eventName: string;
  eventDate: string;
  venue: string;
  ticketsUrl: string;
  requiresCard: boolean;
}

// EML-04: 24 hours before the event
export default function EventReminderEmail(p: EventReminderProps) {
  return (
    <EmailLayout preview={`${p.eventName} is tomorrow`}>
      <H1>See you tomorrow!</H1>
      <P>Hi {p.name}, a quick reminder about {p.eventName}.</P>
      <Details rows={[["When", p.eventDate], ["Where", p.venue]]} />
      <P>
        Keep your phone charged and open My tickets at the gate – the QR code is live and changes every 30 seconds.
        {p.requiresCard ? " Don't forget your student card." : ""}
      </P>
      <CTA href={p.ticketsUrl}>Open My tickets</CTA>
    </EmailLayout>
  );
}

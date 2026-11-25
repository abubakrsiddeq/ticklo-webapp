import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface OrderConfirmedProps {
  name: string;
  eventName: string;
  eventDate: string;
  venue: string;
  refCode: string;
  ticketCount: number;
  ticketsUrl: string;
  requiresCard: boolean;
}

// EML-03 / TKT-07: event details and a link to "My tickets" – no QR image.
export default function OrderConfirmedEmail(p: OrderConfirmedProps) {
  return (
    <EmailLayout preview={`Your ${p.ticketCount === 1 ? "ticket" : "tickets"} for ${p.eventName} ${p.ticketCount === 1 ? "is" : "are"} ready`}>
      <H1>You&apos;re in! 🎉</H1>
      <P>Hi {p.name}, your order is confirmed. Befikar raho – your tickets are waiting in TickLO.</P>
      <Details
        rows={[
          ["Event", p.eventName],
          ["When", p.eventDate],
          ["Where", p.venue],
          ["Tickets", String(p.ticketCount)],
          ["Order", p.refCode],
        ]}
      />
      <P>
        At the gate, open <strong>My tickets</strong> on your phone and show the live QR code. Screenshots do not work –
        the code changes every 30 seconds.{p.requiresCard ? " Bring your student card too." : ""}
      </P>
      <CTA href={p.ticketsUrl}>Open My tickets</CTA>
    </EmailLayout>
  );
}

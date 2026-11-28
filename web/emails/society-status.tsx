import { CTA, EmailLayout, H1, P } from "./layout";

export interface SocietyStatusProps {
  change: "suspended" | "restored" | "deleted";
  name: string;
  societyName: string;
  reason?: string | null;
  cancelledEvents: number;
  url: string;
}

// D-084: a TickLO admin suspended, restored or deleted the society
export default function SocietyStatusEmail(p: SocietyStatusProps) {
  const title =
    p.change === "suspended" ? `${p.societyName} is suspended` : p.change === "restored" ? `${p.societyName} is active again` : `${p.societyName} was removed from TickLO`;
  return (
    <EmailLayout preview={title}>
      <H1>{title}</H1>
      <P>Hi {p.name},</P>
      {p.change === "suspended" ? (
        <>
          <P>TickLO has suspended {p.societyName}. Ticket sales are stopped and the society cannot create or change events for now.</P>
          {p.reason ? <P>Reason: {p.reason}</P> : null}
          <P>Tickets already sold still work at the gate, and you can still review payments that were sent before.</P>
        </>
      ) : p.change === "restored" ? (
        <P>The suspension of {p.societyName} is lifted. You can sell tickets and manage your events again.</P>
      ) : (
        <>
          <P>TickLO has removed {p.societyName}. Its public page and events are no longer on TickLO.</P>
          {p.reason ? <P>Reason: {p.reason}</P> : null}
        </>
      )}
      {p.cancelledEvents > 0 ? (
        <P>
          {p.cancelledEvents === 1 ? "1 upcoming event was" : `${p.cancelledEvents} upcoming events were`} cancelled and the ticket holders were emailed.
        </P>
      ) : null}
      <P>Questions? Reply to this email and the TickLO team will help.</P>
      {p.change !== "deleted" ? <CTA href={p.url}>Open dashboard</CTA> : null}
    </EmailLayout>
  );
}

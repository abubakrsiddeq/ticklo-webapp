import { Img, Section, Text } from "@react-email/components";
import { CTA, Details, EmailLayout, H1, NAVY, P } from "./layout";

export interface OrderConfirmedProps {
  name: string;
  eventName: string;
  eventDate: string;
  venue: string;
  refCode: string;
  ticketCount: number;
  ticketsUrl: string;
  requiresCard: boolean;
  /** One entry per ticket; `cid` points at the inline QR attachment (D-037). */
  tickets?: { code: string; type: string; cid: string | null }[];
}

// EML-03: event details + the ticket QR codes (fixed QR, works without internet).
export default function OrderConfirmedEmail(p: OrderConfirmedProps) {
  const tickets = p.tickets ?? [];
  return (
    <EmailLayout preview={`Your ${p.ticketCount === 1 ? "ticket" : "tickets"} for ${p.eventName} ${p.ticketCount === 1 ? "is" : "are"} ready`}>
      <H1>You&apos;re in! 🎉</H1>
      <P>Hi {p.name}, your order is confirmed. Befikar raho – your {p.ticketCount === 1 ? "ticket is" : "tickets are"} below.</P>
      <Details
        rows={[
          ["Event", p.eventName],
          ["When", p.eventDate],
          ["Where", p.venue],
          ["Tickets", String(p.ticketCount)],
          ["Order", p.refCode],
        ]}
      />
      {tickets.map((t, i) => (
        <Section key={t.code} style={{ border: "1px solid #E2E6EE", borderRadius: 12, padding: 16, margin: "12px 0", textAlign: "center" }}>
          <Text style={{ margin: "0 0 8px", fontSize: 14, color: "#5B6475" }}>
            Ticket {i + 1} of {tickets.length} · <strong style={{ color: NAVY }}>{t.type}</strong>
          </Text>
          {t.cid ? <Img src={`cid:${t.cid}`} alt={`QR code for ticket ${t.code}`} width={220} height={220} style={{ margin: "0 auto" }} /> : null}
          <Text style={{ margin: "8px 0 0", fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: NAVY, letterSpacing: 2 }}>{t.code}</Text>
        </Section>
      ))}
      <P>
        Show the QR at the gate – it works without internet. The QR images are also attached to this email, and always in
        <strong> My tickets</strong>. Each ticket can be scanned only once, so don&apos;t share it.
        {p.requiresCard ? " Bring your student card too." : ""}
      </P>
      <CTA href={p.ticketsUrl}>Open My tickets</CTA>
    </EmailLayout>
  );
}

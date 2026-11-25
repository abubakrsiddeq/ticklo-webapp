import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface PaymentAccountLine {
  label: string; // "Meezan Bank" / "JazzCash"
  title: string;
  number: string;
  iban?: string | null;
}

export interface PaymentInstructionsProps {
  name: string;
  eventName: string;
  eventDate: string;
  refCode: string;
  amount: string;
  holdEndsAt: string;
  accounts: PaymentAccountLine[];
  checkoutUrl: string;
  requiresCard: boolean;
}

// EML-02: sent right after booking
export default function PaymentInstructionsEmail(p: PaymentInstructionsProps) {
  return (
    <EmailLayout preview={`Pay ${p.amount} for ${p.eventName} – reference ${p.refCode}`}>
      <H1>Complete your payment</H1>
      <P>Hi {p.name}, your tickets for {p.eventName} are on hold until {p.holdEndsAt}.</P>
      <Details rows={[["Amount", p.amount], ["Reference code", p.refCode], ["Event", `${p.eventName} · ${p.eventDate}`]]} />
      <P>Send the exact amount to one of these accounts:</P>
      {p.accounts.map((a) => (
        <Details
          key={`${a.label}-${a.number}`}
          rows={[
            ["Bank / wallet", a.label],
            ["Account title", a.title],
            ["Account number", a.number],
            ...(a.iban ? ([["IBAN", a.iban]] as [string, string][]) : []),
          ]}
        />
      ))}
      <P>
        <strong>Write {p.refCode} in the transfer remarks.</strong> Then upload the payment screenshot
        {p.requiresCard ? " and a photo of your student card" : ""} on TickLO before the hold ends.
      </P>
      <CTA href={p.checkoutUrl}>Upload payment screenshot</CTA>
      <P muted>If you do not upload a screenshot within 60 minutes, the tickets go back on sale.</P>
    </EmailLayout>
  );
}

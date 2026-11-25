import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface PaymentRejectedProps {
  name: string;
  eventName: string;
  refCode: string;
  reason: string;
  retryUrl: string;
}

// EML-06: organizer rejected the payment screenshot (PAY-07, PAY-08)
export default function PaymentRejectedEmail(p: PaymentRejectedProps) {
  return (
    <EmailLayout preview={`Payment for ${p.eventName} was not approved`}>
      <H1>Payment not approved</H1>
      <P>Hi {p.name}, the organizer could not approve your payment for {p.eventName}.</P>
      <Details rows={[["Order", p.refCode], ["Reason", p.reason]]} />
      <P>
        If you think this is a mistake, you can upload a new screenshot while tickets are still on sale. If you sent the
        money and it is still not approved, you can report it from your order page.
      </P>
      <CTA href={p.retryUrl}>Upload a new screenshot</CTA>
    </EmailLayout>
  );
}

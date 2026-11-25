import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface NewProofProps {
  name: string;
  eventName: string;
  refCode: string;
  amount: string;
  buyerName: string;
  possibleDuplicate: boolean;
  reviewUrl: string;
}

// EML-08: a student uploaded a payment screenshot (PAY-14)
export default function NewProofEmail(p: NewProofProps) {
  return (
    <EmailLayout preview={`New payment to review: ${p.refCode} (${p.amount})`}>
      <H1>New payment to review</H1>
      <P>Hi {p.name}, {p.buyerName} uploaded a payment screenshot for {p.eventName}.</P>
      <Details rows={[["Order", p.refCode], ["Expected amount", p.amount]]} />
      {p.possibleDuplicate ? (
        <P>
          <strong style={{ color: "#B91C1C" }}>⚠ Possible duplicate:</strong> the same transaction ID or screenshot was used in another
          order. Check carefully before approving.
        </P>
      ) : null}
      <CTA href={p.reviewUrl}>Review payment</CTA>
    </EmailLayout>
  );
}

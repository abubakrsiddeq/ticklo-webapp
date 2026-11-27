import { CTA, EmailLayout, H1, P } from "./layout";

export interface WaitlistOfferProps {
  name: string;
  target: string;
  eventName: string;
  until: string;
  url: string;
}

// D-071: a place opened for the next person on the waitlist (held 2 hours)
export default function WaitlistOfferEmail(p: WaitlistOfferProps) {
  return (
    <EmailLayout preview={`A place opened: ${p.target} – book by ${p.until}`}>
      <H1>A place opened for you 🎉</H1>
      <P>Hi {p.name},</P>
      <P>
        You were next on the waitlist for <strong>{p.target}</strong> at {p.eventName}. The place is held for you until{" "}
        <strong>{p.until}</strong> – book before then, or it goes to the next person in line.
      </P>
      <CTA href={p.url}>Book now</CTA>
    </EmailLayout>
  );
}

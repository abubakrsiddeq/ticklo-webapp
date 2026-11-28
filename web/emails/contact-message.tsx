import { Text } from "@react-email/components";
import { Details, EmailLayout, H1, P } from "./layout";

export interface ContactMessageProps {
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  message: string;
  account: string | null;
}

/** A message sent from the Contact page to TickLO support. Reply goes straight to the sender. */
export default function ContactMessageEmail(p: ContactMessageProps) {
  return (
    <EmailLayout preview={`${p.topic}: ${p.message.slice(0, 80)}`}>
      <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 6px" }}>
        TickLO · Contact page
      </Text>
      <H1>New message from {p.name}</H1>
      <Details
        rows={[
          ["Topic", p.topic],
          ["Email", p.email],
          ["Phone", p.phone ?? "Not given"],
          ["TickLO account", p.account ?? "Not logged in"],
        ]}
      />
      <Text style={{ whiteSpace: "pre-wrap", borderLeft: "3px solid #CBD5E1", padding: "4px 0 4px 12px", margin: "12px 0", color: "#1F2937", fontSize: 15, lineHeight: "24px" }}>
        {p.message}
      </Text>
      <P muted>Press Reply to answer {p.name} directly.</P>
    </EmailLayout>
  );
}

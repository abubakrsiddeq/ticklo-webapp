import { Link, Section, Text } from "@react-email/components";
import { CTA, EmailLayout, GREEN_DARK, H1, NAVY, P } from "./layout";

export interface DigestItem {
  name: string;
  sub?: string | null;
  /** e.g. "3 h", "2 days" */
  waiting?: string | null;
  /** Waited more than 24 hours: shown in red */
  overdue?: boolean;
}

export interface DigestGroup {
  title: string;
  count: number;
  url: string;
  items: DigestItem[];
}

export interface AdminDigestProps {
  dateLabel: string;
  waiting: DigestGroup[];
  attention: DigestGroup[];
  eventsSoon: DigestItem[];
  yesterday: { signups: number; orders: number; tickets: number };
  adminUrl: string;
}

const RED = "#B91C1C";
const MAX_ITEMS = 5;

function Heading({ children }: { children: string }) {
  return <Text style={{ color: NAVY, fontSize: 16, fontWeight: 700, margin: "24px 0 8px" }}>{children}</Text>;
}

function Group({ g }: { g: DigestGroup }) {
  const more = g.count - Math.min(g.items.length, MAX_ITEMS);
  return (
    <Section style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: "10px 16px", margin: "0 0 10px" }}>
      <Text style={{ margin: "2px 0 6px", fontSize: 14, fontWeight: 700, color: NAVY }}>
        {g.title} ({g.count}){" "}
        <Link href={g.url} style={{ color: GREEN_DARK, fontWeight: 600, fontSize: 13 }}>
          Open
        </Link>
      </Text>
      {g.items.slice(0, MAX_ITEMS).map((it, i) => (
        <Text key={i} style={{ margin: "3px 0", fontSize: 14, color: "#1F2937", lineHeight: "20px" }}>
          {it.name}
          {it.sub ? <span style={{ color: "#6B7280" }}> · {it.sub}</span> : null}
          {it.waiting ? (
            <span style={{ color: it.overdue ? RED : "#6B7280", fontWeight: it.overdue ? 700 : 400 }}> · waiting {it.waiting}</span>
          ) : null}
        </Text>
      ))}
      {more > 0 ? <Text style={{ margin: "3px 0", fontSize: 13, color: "#6B7280" }}>and {more} more</Text> : null}
    </Section>
  );
}

// D-088: the morning email to TickLO admins. Sent only when something waits or needs attention.
export default function AdminDigestEmail(p: AdminDigestProps) {
  const overdue = p.waiting.some((g) => g.items.some((i) => i.overdue));
  return (
    <EmailLayout preview={`TickLO daily for ${p.dateLabel}`}>
      <H1>Good morning</H1>
      <P>Here is what needs TickLO admins today, {p.dateLabel}.</P>
      {overdue ? (
        <P>
          <strong style={{ color: RED }}>Items in red have waited more than 24 hours or start very soon.</strong>
        </P>
      ) : null}

      {p.waiting.length ? (
        <>
          <Heading>Waiting for review</Heading>
          {p.waiting.map((g) => (
            <Group key={g.title} g={g} />
          ))}
        </>
      ) : null}

      {p.attention.length ? (
        <>
          <Heading>Needs attention</Heading>
          {p.attention.map((g) => (
            <Group key={g.title} g={g} />
          ))}
        </>
      ) : null}

      {p.eventsSoon.length ? (
        <>
          <Heading>Events today and tomorrow</Heading>
          <Section style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: "10px 16px" }}>
            {p.eventsSoon.map((e, i) => (
              <Text key={i} style={{ margin: "3px 0", fontSize: 14, color: "#1F2937", lineHeight: "20px" }}>
                {e.name}
                {e.sub ? <span style={{ color: "#6B7280" }}> · {e.sub}</span> : null}
              </Text>
            ))}
          </Section>
        </>
      ) : null}

      <Heading>Yesterday on TickLO</Heading>
      <Text style={{ margin: "0 0 4px", fontSize: 14, color: "#1F2937" }}>
        {p.yesterday.signups} new {p.yesterday.signups === 1 ? "account" : "accounts"} · {p.yesterday.orders}{" "}
        {p.yesterday.orders === 1 ? "booking" : "bookings"} · {p.yesterday.tickets} {p.yesterday.tickets === 1 ? "ticket" : "tickets"} issued
      </Text>

      <CTA href={p.adminUrl}>Open admin</CTA>
      <P muted>You get this every morning at 9:00 when something is waiting. No email on quiet days.</P>
    </EmailLayout>
  );
}

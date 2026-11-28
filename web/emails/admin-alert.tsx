import type { ReactNode } from "react";
import { Text } from "@react-email/components";
import { CTA, Details, EmailLayout, H1, P } from "./layout";

export interface AdminAlertProps {
  /** Small label above the title, e.g. "Society review" */
  label: string;
  title: string;
  intro: ReactNode;
  rows: [string, ReactNode][];
  /** Shown in red under the details, e.g. why a proof looks like a duplicate */
  warning?: string | null;
  /** A quote from the person, e.g. the dispute message or the last rejection reason */
  quote?: { label: string; text: string } | null;
  ctaLabel: string;
  ctaUrl: string;
}

// D-088: one layout for every instant email to TickLO admins. One button, straight to the page.
export default function AdminAlertEmail(p: AdminAlertProps) {
  return (
    <EmailLayout preview={p.title}>
      <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 6px" }}>
        TickLO admin · {p.label}
      </Text>
      <H1>{p.title}</H1>
      <P>{p.intro}</P>
      <Details rows={p.rows} />
      {p.quote ? (
        <Text style={{ borderLeft: "3px solid #CBD5E1", padding: "4px 0 4px 12px", margin: "12px 0", color: "#374151", fontSize: 14, lineHeight: "22px" }}>
          <span style={{ color: "#6B7280" }}>{p.quote.label}: </span>
          {p.quote.text}
        </Text>
      ) : null}
      {p.warning ? (
        <P>
          <strong style={{ color: "#B91C1C" }}>{p.warning}</strong>
        </P>
      ) : null}
      <CTA href={p.ctaUrl}>{p.ctaLabel}</CTA>
      <P muted>You get this because you are a TickLO admin.</P>
    </EmailLayout>
  );
}

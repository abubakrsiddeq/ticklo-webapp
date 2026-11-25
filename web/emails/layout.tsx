import type { ReactNode } from "react";
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

// TickLO brand colours (NFR-12). Green text/buttons use the darker shade for contrast.
export const NAVY = "#0B1F3A";
export const GREEN = "#0F9D58";
export const GREEN_DARK = "#0B7D47";

const fontStack = "Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#F3F5F8", fontFamily: fontStack, margin: 0, padding: "24px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 12, overflow: "hidden" }}>
          <Section style={{ backgroundColor: NAVY, padding: "20px 28px" }}>
            <Text style={{ color: "#ffffff", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
              Tick<span style={{ color: GREEN }}>LO</span>
            </Text>
          </Section>
          <Section style={{ padding: "28px" }}>{children}</Section>
          <Hr style={{ borderColor: "#E5E7EB", margin: 0 }} />
          <Section style={{ padding: "16px 28px" }}>
            <Text style={{ color: "#6B7280", fontSize: 12, margin: 0 }}>
              TickLO se ticket lo, befikar raho! · You get this email because of your activity on TickLO.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={{ color: NAVY, fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>{children}</Text>;
}

export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text style={{ color: muted ? "#6B7280" : "#1F2937", fontSize: 15, lineHeight: "24px", margin: "0 0 12px" }}>
      {children}
    </Text>
  );
}

export function CTA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "20px 0" }}>
      <Button
        href={href}
        style={{
          backgroundColor: GREEN_DARK,
          color: "#ffffff",
          padding: "12px 22px",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

export function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Section style={{ backgroundColor: "#F8FAFC", borderRadius: 8, padding: "12px 16px", margin: "12px 0" }}>
      {rows.map(([label, value]) => (
        <Text key={label} style={{ margin: "4px 0", fontSize: 14, color: "#1F2937" }}>
          <span style={{ color: "#6B7280" }}>{label}: </span>
          <strong>{value}</strong>
        </Text>
      ))}
    </Section>
  );
}

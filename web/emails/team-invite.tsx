import { CTA, EmailLayout, H1, P } from "./layout";

export interface TeamInviteProps {
  orgName: string;
  role: "member" | "scanner";
  inviterName: string;
  acceptUrl: string;
}

// EML-09: organizer added a member or scanner (ORG-03)
export default function TeamInviteEmail(p: TeamInviteProps) {
  const roleText =
    p.role === "member"
      ? "a team member (manage events and verify payments)"
      : "a gate volunteer (let people in by scanning their tickets with your phone)";
  return (
    <EmailLayout preview={`${p.inviterName} invited you to ${p.orgName} on TickLO`}>
      <H1>You&apos;re invited to {p.orgName}</H1>
      <P>
        {p.inviterName} invited you to join {p.orgName} on TickLO as {roleText}.
      </P>
      <P>Log in (or sign up) with this email address, then accept the invite.</P>
      <CTA href={p.acceptUrl}>Accept invite</CTA>
      <P muted>This invite expires in 14 days. If you were not expecting it, you can ignore this email.</P>
    </EmailLayout>
  );
}

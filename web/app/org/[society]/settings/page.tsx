import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgStaff } from "@/lib/auth";
import { serverNow } from "@/lib/time";
import { ReferralCodeForm } from "./referral-form";
import { HeadForm } from "./head-form";
import { createClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/phone";
import { listUniversityChoices } from "@/lib/queries/public";
import { updateOrganization } from "../../_actions/org";
import { OrgForm } from "../../org-form";

export const metadata: Metadata = { title: "Society profile" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org, role, user } = await requireOrgStaff(society, `/org/${society}/settings`);
  // AMB-14: owners can still say which TickLO ambassador brought them (first 30 days)
  const canAddReferral = role === "owner" && !org.referred_by && serverNow() - new Date(org.created_at).getTime() < 30 * 86400 * 1000;
  const universities = await listUniversityChoices();
  const links = (org.social_links ?? {}) as Record<string, string>;
  // D-061: only owners can see and change the society head (RLS also limits it to owners and admins)
  const head =
    role === "owner"
      ? (await (await createClient()).from("organization_heads").select("is_submitter, name, phone, email").eq("org_id", org.id).maybeSingle()).data
      : null;
  const account = { name: user.profile.full_name ?? "", email: user.email, phone: user.profile.phone };
  const headIsMe = Boolean(head?.is_submitter && head.email === user.email.toLowerCase());
  const savedOther = head && !headIsMe ? { name: head.name, phone: formatPhone(head.phone), email: head.email } : undefined;
  return (
    <div className="grid gap-6">
    <Card>
      <CardHeader>
        <CardTitle>Society profile</CardTitle>
      </CardHeader>
      <CardContent>
        <OrgForm
          mode="edit"
          hasLogo={Boolean(org.logo_url)}
          action={updateOrganization.bind(null, org.slug)}
          universities={universities}
          defaults={{
            name: org.name,
            university_id: org.university_id ?? "",
            new_university_name: "",
            new_university_city: "",
            type: org.type,
            about: org.about ?? "",
            instagram: links.instagram ?? "",
            linkedin: links.linkedin ?? "",
            website: links.website ?? "",
          }}
        />
      </CardContent>
    </Card>
    {role === "owner" ? (
      <Card>
        <CardHeader>
          <CardTitle>Who leads the society?</CardTitle>
          <CardDescription>
            {head
              ? "Change this when the president, chairperson or lead changes."
              : "Your society has no head details yet. Add them so TickLO can verify your society."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeadForm
            orgSlug={org.slug}
            account={account}
            otherDefaults={savedOther}
            defaults={
              headIsMe && head
                ? { head_role: "self", head_name: account.name || head.name, head_phone: formatPhone(head.phone), head_email: user.email }
                : savedOther
                  ? { head_role: "other", head_name: savedOther.name, head_phone: savedOther.phone, head_email: savedOther.email }
                  : { head_role: undefined, head_name: "", head_phone: "", head_email: "" }
            }
          />
        </CardContent>
      </Card>
    ) : null}
    {canAddReferral ? (
      <Card>
        <CardHeader>
          <CardTitle>Who told you about TickLO?</CardTitle>
          <CardDescription>If a TickLO campus ambassador helped you sign up, enter their code so they get credit. You can do this once.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReferralCodeForm orgSlug={org.slug} />
        </CardContent>
      </Card>
    ) : null}
    </div>
  );
}

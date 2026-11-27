import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgStaff } from "@/lib/auth";
import { serverNow } from "@/lib/time";
import { ReferralCodeForm } from "./referral-form";
import { listUniversityChoices } from "@/lib/queries/public";
import { updateOrganization } from "../../_actions/org";
import { OrgForm } from "../../org-form";

export const metadata: Metadata = { title: "Society profile" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org, role } = await requireOrgStaff(society, `/org/${society}/settings`);
  // AMB-14: owners can still say which TickLO ambassador brought them (first 30 days)
  const canAddReferral = role === "owner" && !org.referred_by && serverNow() - new Date(org.created_at).getTime() < 30 * 86400 * 1000;
  const universities = await listUniversityChoices();
  const links = (org.social_links ?? {}) as Record<string, string>;
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

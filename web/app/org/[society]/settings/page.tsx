import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgStaff } from "@/lib/auth";
import { listUniversities } from "@/lib/queries/public";
import { updateOrganization } from "../../_actions/org";
import { OrgForm } from "../../org-form";

export const metadata: Metadata = { title: "Society profile" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org } = await requireOrgStaff(society, `/org/${society}/settings`);
  const universities = await listUniversities();
  const links = (org.social_links ?? {}) as Record<string, string>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Society profile</CardTitle>
      </CardHeader>
      <CardContent>
        <OrgForm
          mode="edit"
          action={updateOrganization.bind(null, org.slug)}
          universities={universities}
          defaults={{
            name: org.name,
            university_id: org.university_id ?? "",
            type: org.type,
            about: org.about ?? "",
            instagram: links.instagram ?? "",
            facebook: links.facebook ?? "",
            website: links.website ?? "",
          }}
        />
      </CardContent>
    </Card>
  );
}

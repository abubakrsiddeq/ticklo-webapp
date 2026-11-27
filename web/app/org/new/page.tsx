import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listUniversityChoices } from "@/lib/queries/public";
import { createOrganization } from "../_actions/org";
import { OrgForm } from "../org-form";

export const metadata: Metadata = { title: "Register a society" };

// ORG-01
export default async function NewOrgPage() {
  await requireUser("/org/new");
  const universities = await listUniversityChoices();
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl text-navy">Register your society</CardTitle>
          <CardDescription>
            TickLO checks every society before it can sell tickets. Approval usually takes a day. TickLO charges no fees –
            students pay your society directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgForm
            mode="create"
            action={createOrganization}
            universities={universities}
            defaults={{ name: "", university_id: "", new_university_name: "", new_university_city: "", type: "society", about: "", instagram: "", facebook: "", website: "" }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

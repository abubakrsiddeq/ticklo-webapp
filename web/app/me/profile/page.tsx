import type { Metadata } from "next";
import { IdCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listUniversities } from "@/lib/queries/public";
import { formatPhone } from "@/lib/phone";
import { ProfileForm } from "./profile-form";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default async function ProfilePage() {
  const user = await requireUser("/me/profile");
  const universities = await listUniversities();
  const p = user.profile;
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-bold text-navy">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaults={{ full_name: p.full_name ?? "", phone: formatPhone(p.phone), university_id: p.university_id ?? "" }}
            avatarUrl={p.avatar_url}
            universities={universities}
          />
        </CardContent>
      </Card>
      {/* AUTH-05: no university email check; student card per ticket type instead */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="size-5 text-brand-strong" aria-hidden /> Student verification
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You don&apos;t need a university email. When a ticket type says <strong>student card required</strong>, you upload
          a photo of your card with the payment and show the same card at the gate.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccount requestedAt={p.deletion_requested_at} />
        </CardContent>
      </Card>
    </div>
  );
}

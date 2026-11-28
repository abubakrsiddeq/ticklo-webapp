import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { ActionButton } from "@/components/action-button";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/app/org/_actions/invite";

export const metadata: Metadata = { title: "Team invite", robots: { index: false } };

interface Invite {
  org_name: string;
  org_slug: string;
  email: string;
  role: "member" | "scanner";
  state: "open" | "accepted" | "revoked" | "expired";
}

// ORG-03 / EML-09: accept a team invite
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite", { p_token: token });
  const invite = data as Invite | null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy">
              <Users className="size-5" aria-hidden /> Team invite
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!invite ? (
              <p>This invite link is not valid.</p>
            ) : invite.state !== "open" ? (
              <p>This invite has been {invite.state}. Ask the society owner for a new one.</p>
            ) : invite.email.toLowerCase() !== user.email.toLowerCase() ? (
              <>
                <p>
                  This invite was sent to <strong>{invite.email}</strong>, but you are logged in as <strong>{user.email}</strong>.
                </p>
                <form action="/auth/signout" method="post">
                  <Button type="submit" variant="outline" className="w-full">
                    Log out and switch account
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p>
                  <strong>{invite.org_name}</strong> invited you to join as{" "}
                  <strong>{invite.role === "member" ? "a team member" : "a gate volunteer"}</strong>.
                </p>
                <ActionButton variant="brand" size="lg" action={acceptInvite.bind(null, token)}>
                  Accept invite
                </ActionButton>
              </>
            )}
            <Button asChild variant="ghost">
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

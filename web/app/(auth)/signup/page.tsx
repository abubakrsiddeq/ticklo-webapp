import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/oauth-buttons";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/site";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");
  if (await getCurrentUser()) redirect(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">Create your TickLO account</CardTitle>
        <CardDescription>TickLO se ticket lo, befikar raho!</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <OAuthButtons next={next} verb="Sign up" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
        </div>
        <SignupForm next={next} />
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to our <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-brand-strong underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

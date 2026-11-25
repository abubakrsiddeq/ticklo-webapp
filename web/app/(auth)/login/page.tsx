import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleButton } from "@/components/google-button";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/site";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  suspended: "Your account is suspended. Contact TickLO support if you think this is a mistake.",
  link: "That link is invalid or has expired. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/");
  const user = await getCurrentUser();
  if (user && !user.profile.is_suspended) redirect(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">Welcome back</CardTitle>
        <CardDescription>Log in to book tickets and see your QR codes.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sp.error && ERRORS[sp.error] ? (
          <Alert variant="destructive">
            <AlertDescription>{ERRORS[sp.error]}</AlertDescription>
          </Alert>
        ) : null}
        <GoogleButton next={next} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
        </div>
        <LoginForm next={next} />
        <p className="text-center text-sm text-muted-foreground">
          New to TickLO?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-brand-strong underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

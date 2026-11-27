import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetRequestForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

const ERRORS: Record<string, string> = {
  expired: "That reset link has expired or was already used. Enter your email to get a new one.",
  device: "Please open the reset link on the same phone or browser where you asked for it – or get a new link below.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">Password bhool gaye?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && ERRORS[error] ? (
          <Alert variant="destructive">
            <AlertDescription>{ERRORS[error]}</AlertDescription>
          </Alert>
        ) : null}
        <ResetRequestForm />
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand-strong underline-offset-4 hover:underline">Back to login</Link>
        </p>
      </CardContent>
    </Card>
  );
}

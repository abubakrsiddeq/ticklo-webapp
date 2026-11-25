import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetRequestForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">Password bhool gaye?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ResetRequestForm />
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand-strong underline-offset-4 hover:underline">Back to login</Link>
        </p>
      </CardContent>
    </Card>
  );
}

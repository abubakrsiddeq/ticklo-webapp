import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { NewPasswordForm } from "../reset-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function UpdatePasswordPage() {
  const user = await getCurrentUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl text-navy">Set a new password</CardTitle>
        <CardDescription>{user ? `For ${user.email}` : "Open this page from the link in your email."}</CardDescription>
      </CardHeader>
      <CardContent>
        {user ? (
          <NewPasswordForm />
        ) : (
          <p className="text-sm">
            Your reset link has expired.{" "}
            <Link href="/reset-password" className="text-brand-strong underline">Request a new one</Link>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

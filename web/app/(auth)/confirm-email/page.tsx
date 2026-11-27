import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailCheck, KeyRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { safeNext } from "@/lib/site";
import { confirmEmailLinkAction } from "../actions";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

// D-052: landing page for email links. Opening it does not use the one-time token –
// only pressing the button does – so mail scanners that open links can't expire it.
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tokenHash = sp.token_hash;
  const type = sp.type;
  if (!tokenHash || !type) redirect("/login?error=link");
  const isReset = type === "recovery";
  const next = safeNext(sp.next, "/");
  const Icon = isReset ? KeyRound : MailCheck;

  return (
    <Card>
      <CardHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand-strong">
          <Icon className="size-6" aria-hidden />
        </span>
        <CardTitle className="font-heading text-2xl text-navy">{isReset ? "Set a new password" : "Confirm your email"}</CardTitle>
        <CardDescription>
          {isReset
            ? "Tap the button to continue and choose a new password."
            : "One last step – tap the button to activate your TickLO account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={confirmEmailLinkAction}>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <SubmitButton pendingText={isReset ? "Checking…" : "Confirming…"} className="w-full">
            {isReset ? "Continue" : "Confirm my email"}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

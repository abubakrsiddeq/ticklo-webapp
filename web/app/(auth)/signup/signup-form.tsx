"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signupAction } from "../actions";

export function SignupForm({ next }: { next: string }) {
  const [pending, start] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: "", email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await signupAction(values, next);
      if (!res) return;
      setExists(!res.ok && res.code === "exists");
      if (!res.ok) {
        if (res.code !== "exists") toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof SignupInput, { message: v });
        return;
      }
      setSentTo(values.email);
    }),
  );

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-brand-soft p-6 text-center" role="status">
        <MailCheck className="size-10 text-brand-strong" aria-hidden />
        <p className="font-semibold text-navy">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account – you&apos;ll come
          straight back here.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="full_name" label="Full name" error={errors.full_name?.message}>
        <Input autoComplete="name" {...fieldAria("full_name", errors.full_name?.message)} {...form.register("full_name")} />
      </FormField>
      <FormField id="email" label="Email" hint="Any email works – no university email needed." error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...fieldAria("email", errors.email?.message, true)} {...form.register("email")} />
      </FormField>
      <FormField id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("password", errors.password?.message, true)} {...form.register("password")} />
      </FormField>
      {exists ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="font-medium">This email already has a TickLO account.</p>
          <p className="mt-1">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold underline underline-offset-4">
              Log in
            </Link>{" "}
            instead. Signed up with Google? Use the Google button above. No password yet or forgot it?{" "}
            <Link href="/reset-password" className="font-semibold underline underline-offset-4">
              Set a password
            </Link>
            .
          </p>
        </div>
      ) : null}
      <SubmitButton pending={pending} pendingText="Creating account…" variant="brand" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { loginAction, resendConfirmationAction } from "../actions";
import { useActionTransition } from "@/lib/use-action-transition";

export function LoginForm({ next }: { next: string }) {
  const [pending, start] = useActionTransition();
  const [resending, startResend] = useActionTransition();
  const [unconfirmed, setUnconfirmed] = useState(false);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await loginAction(values, next);
      if (res && !res.ok) {
        setUnconfirmed(res.code === "unconfirmed");
        toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof LoginInput, { message: v });
      }
    }),
  );

  const resend = () =>
    startResend(async () => {
      const res = await resendConfirmationAction({ email: form.getValues("email") }, next);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...fieldAria("email", errors.email?.message)} {...form.register("email")} />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...fieldAria("password", errors.password?.message)} {...form.register("password")} />
      </FormField>
      <div className="-mt-2 text-right text-sm">
        <Link href="/reset-password" className="text-brand-strong underline-offset-4 hover:underline">
          Password bhool gaye?
        </Link>
      </div>
      <SubmitButton pending={pending} pendingText="Logging in…" className="w-full">
        Log in
      </SubmitButton>
      {unconfirmed ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Your email isn&apos;t confirmed yet. Didn&apos;t get the email, or the link expired?</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" disabled={resending} onClick={resend}>
            {resending ? "Sending…" : "Send a new link"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

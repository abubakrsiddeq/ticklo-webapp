"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { loginAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [pending, start] = useTransition();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await loginAction(values, next);
      if (res && !res.ok) {
        toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof LoginInput, { message: v });
      }
    }),
  );

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
    </form>
  );
}

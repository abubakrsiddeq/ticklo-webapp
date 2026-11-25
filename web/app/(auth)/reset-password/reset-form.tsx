"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { newPasswordSchema, resetRequestSchema } from "@/lib/validation/auth";
import { requestResetAction, updatePasswordAction } from "../actions";

export function ResetRequestForm() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetRequestSchema>>({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const err = form.formState.errors.email?.message;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await requestResetAction(values);
      if (res.ok) setDone(res.message ?? "Check your email.");
      else toast.error(res.error);
    }),
  );
  if (done) return <p className="rounded-lg bg-brand-soft p-4 text-sm text-navy" role="status">{done}</p>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="email" label="Email" error={err}>
        <Input type="email" autoComplete="email" {...fieldAria("email", err)} {...form.register("email")} />
      </FormField>
      <SubmitButton pending={pending} pendingText="Sending…" className="w-full">Send reset link</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [pending, start] = useTransition();
  const form = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await updatePasswordAction(values);
      if (res && !res.ok) toast.error(res.error);
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="password" label="New password" hint="At least 8 characters." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("password", errors.password?.message, true)} {...form.register("password")} />
      </FormField>
      <FormField id="confirm" label="Repeat new password" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria("confirm", errors.confirm?.message)} {...form.register("confirm")} />
      </FormField>
      <SubmitButton pending={pending} pendingText="Saving…" className="w-full">Save new password</SubmitButton>
    </form>
  );
}

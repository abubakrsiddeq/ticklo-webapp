"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { FormField, fieldAria } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { CONTACT_TOPICS, contactSchema, type ContactInput } from "@/lib/validation/contact";
import { useActionTransition } from "@/lib/use-action-transition";
import { sendContactMessage } from "./actions";

export function ContactForm({ defaults }: { defaults: { name: string; email: string; phone: string } }) {
  const [pending, start] = useActionTransition();
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { ...defaults, topic: "" as ContactInput["topic"], message: "", website: "" },
  });
  const { errors } = form.formState;
  const length = useWatch({ control: form.control, name: "message" })?.length ?? 0;

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await sendContactMessage(values);
      if (!res.ok) {
        toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof ContactInput, { message: v });
        return;
      }
      setSent(values.email);
      form.reset({ ...defaults, topic: "" as ContactInput["topic"], message: "", website: "" });
    }),
  );

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <CircleCheck className="size-7" aria-hidden />
        </span>
        <p className="font-heading text-xl font-semibold text-navy">Message sent. Shukriya!</p>
        <p className="max-w-sm text-sm text-slate-600">
          We will reply to <strong className="text-navy">{sent}</strong>, usually within one working day.
        </p>
        <Button variant="outline" className="mt-2 rounded-full" onClick={() => setSent(null)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="name" label="Full name" required error={errors.name?.message}>
          <Input {...fieldAria("name", errors.name?.message)} autoComplete="name" className="h-11" {...form.register("name")} />
        </FormField>
        <FormField id="email" label="Email" required error={errors.email?.message}>
          <Input
            {...fieldAria("email", errors.email?.message)}
            type="email"
            inputMode="email"
            autoComplete="email"
            className="h-11"
            {...form.register("email")}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="phone" label="Mobile number" hint="Optional, if you prefer a call or WhatsApp." error={errors.phone?.message}>
          <Input
            {...fieldAria("phone", errors.phone?.message, true)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0300 1234567"
            className="h-11"
            {...form.register("phone")}
          />
        </FormField>
        <FormField id="topic" label="What is it about?" required error={errors.topic?.message}>
          <NativeSelect {...fieldAria("topic", errors.topic?.message)} {...form.register("topic")}>
            <option value="" disabled>
              Choose a topic
            </option>
            {CONTACT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        id="message"
        label="Message"
        required
        hint="For a booking, add the event name and your reference code (TL-…)."
        error={errors.message?.message}
      >
        <Textarea {...fieldAria("message", errors.message?.message, true)} rows={6} className="min-h-36" {...form.register("message")} />
      </FormField>
      <p className="-mt-2 text-right text-xs text-slate-400 tabular-nums" aria-live="polite">
        {length} / 2000
      </p>
      {/* Honeypot: off-screen for people, tempting for bots */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...form.register("website")} />
      </div>
      <SubmitButton pending={pending} pendingText="Sending…" variant="brand" size="lg" className="rounded-full sm:justify-self-start sm:px-8">
        <Send /> Send message
      </SubmitButton>
      <p className="text-xs text-slate-500">
        By sending this form you agree that we use your details to reply to you, as described in our{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-navy">
          Privacy policy
        </Link>
        .
      </p>
    </form>
  );
}

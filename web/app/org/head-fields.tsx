"use client";

import type { UseFormReturn } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { HeadInput } from "@/lib/validation/org";

export interface HeadAccount {
  name: string;
  email: string;
  phone: string | null;
}

const OPTIONS = [
  { key: "self", title: "I am the president / chairperson / lead", text: "Your name and email come from your account." },
  { key: "other", title: "Someone else leads the society", text: "Enter their name, mobile and email." },
] as const;

/**
 * D-060: who leads the society, so TickLO can call or email them to verify it.
 * "self" fills name and email from the account (locked) and the phone (editable).
 */
export function HeadFields<T extends HeadInput>({
  form: anyForm,
  account,
  otherDefaults,
}: {
  form: UseFormReturn<T>;
  account: HeadAccount;
  /** Settings: the saved "someone else" details, restored when switching back to that option. */
  otherDefaults?: { name: string; phone: string; email: string };
}) {
  // Only the head_* fields are used here, so treat the form as a head form.
  const form = anyForm as unknown as UseFormReturn<HeadInput>;
  const role = useWatch({ control: form.control, name: "head_role" });
  const { errors } = form.formState;
  const isSelf = role === "self";
  // If the account has no name yet, let them type it (the server still uses the account's when it has one).
  const lockName = isSelf && account.name.trim().length >= 2;

  function choose(next: "self" | "other") {
    const opts = { shouldValidate: form.formState.isSubmitted, shouldDirty: true };
    form.setValue("head_role", next, opts);
    if (next === "self") {
      form.setValue("head_name", account.name, opts);
      form.setValue("head_email", account.email, opts);
      form.setValue("head_phone", formatPhone(account.phone), opts);
    } else {
      form.setValue("head_name", otherDefaults?.name ?? "", opts);
      form.setValue("head_email", otherDefaults?.email ?? "", opts);
      form.setValue("head_phone", otherDefaults?.phone ?? "", opts);
    }
  }

  const locked = "cursor-not-allowed bg-muted text-navy/80 focus-visible:ring-0";

  return (
    <fieldset className="grid gap-3 rounded-2xl border border-navy/10 p-4" aria-describedby="head-hint">
      <legend className="px-1 text-sm font-medium text-navy">
        Society head <span className="text-destructive" aria-hidden>*</span>
      </legend>
      <p id="head-hint" className="-mt-1 text-xs text-muted-foreground">
        The president, chairperson or lead of the society. TickLO may call or email them to verify the society. Only TickLO
        admins see these details.
      </p>
      <input type="hidden" {...form.register("head_role")} />
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who leads the society?">
        {OPTIONS.map((o) => (
          <label
            key={o.key}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-2xl border-2 p-3 text-sm transition-colors",
              role === o.key ? "border-brand bg-brand-soft" : "border-navy/10 hover:border-brand/40",
            )}
          >
            <input
              type="radio"
              name="head_role_choice"
              value={o.key}
              checked={role === o.key}
              onChange={() => choose(o.key)}
              className="mt-0.5 size-4 accent-[#0B7D47]"
            />
            <span>
              <span className="block font-semibold text-navy">{o.title}</span>
              <span className="block text-xs text-muted-foreground">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
      {errors.head_role?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.head_role.message}
        </p>
      ) : null}

      {role ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="head_name" label="Full name" error={errors.head_name?.message} required hint={lockName ? <LockedHint /> : undefined}>
            <Input
              autoComplete={isSelf ? "name" : "off"}
              maxLength={100}
              readOnly={lockName}
              aria-readonly={lockName || undefined}
              className={cn(lockName && locked)}
              {...fieldAria("head_name", errors.head_name?.message, lockName)}
              {...form.register("head_name")}
            />
          </FormField>
          <FormField id="head_phone" label="Mobile number" error={errors.head_phone?.message} required>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete={isSelf ? "tel" : "off"}
              maxLength={20}
              placeholder="0300 1234567"
              {...fieldAria("head_phone", errors.head_phone?.message)}
              {...form.register("head_phone")}
            />
          </FormField>
          <FormField id="head_email" label="Email" error={errors.head_email?.message} required hint={isSelf ? <LockedHint /> : undefined}>
            <Input
              type="email"
              autoComplete={isSelf ? "email" : "off"}
              maxLength={254}
              readOnly={isSelf}
              aria-readonly={isSelf || undefined}
              className={cn(isSelf && locked)}
              {...fieldAria("head_email", errors.head_email?.message, isSelf)}
              {...form.register("head_email")}
            />
          </FormField>
        </div>
      ) : null}
    </fieldset>
  );
}

function LockedHint() {
  return (
    <span className="inline-flex items-center gap-1">
      <Lock className="size-3" aria-hidden /> From your account
    </span>
  );
}

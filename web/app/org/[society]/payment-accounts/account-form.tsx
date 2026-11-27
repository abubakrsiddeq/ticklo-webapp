"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { paymentAccountSchema, type PaymentAccountInput } from "@/lib/validation/payments";
import { savePaymentAccount } from "@/app/org/_actions/manage";
import { useActionTransition } from "@/lib/use-action-transition";

export function AccountForm({
  orgSlug,
  accountId,
  defaults,
  onDone,
}: {
  orgSlug: string;
  accountId: string | null;
  defaults?: PaymentAccountInput;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  const form = useForm<PaymentAccountInput>({
    resolver: zodResolver(paymentAccountSchema),
    defaultValues: defaults ?? { kind: "bank", bank_name: "", account_title: "", account_number: "", iban: "" },
  });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "kind" });
  const p = accountId ? `acc-${accountId}` : "acc-new";

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await savePaymentAccount(orgSlug, accountId, values);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        if (!accountId) form.reset();
        onDone?.();
        router.refresh();
      } else {
        toast.error(res.error);
        for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof PaymentAccountInput, { message: v });
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${p}-kind`} label="Type" error={errors.kind?.message} required>
          <NativeSelect {...fieldAria(`${p}-kind`, errors.kind?.message)} {...form.register("kind")}>
            <option value="bank">Bank account</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </NativeSelect>
        </FormField>
        {kind === "bank" ? (
          <FormField id={`${p}-bank`} label="Bank name" error={errors.bank_name?.message} required>
            <Input placeholder="e.g. Meezan Bank" {...fieldAria(`${p}-bank`, errors.bank_name?.message)} {...form.register("bank_name")} />
          </FormField>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${p}-title`} label="Account title" error={errors.account_title?.message} required>
          <Input {...fieldAria(`${p}-title`, errors.account_title?.message)} {...form.register("account_title")} />
        </FormField>
        <FormField id={`${p}-number`} label={kind === "bank" ? "Account number" : "Mobile number"} error={errors.account_number?.message} required>
          <Input inputMode={kind === "bank" ? "text" : "tel"} {...fieldAria(`${p}-number`, errors.account_number?.message)} {...form.register("account_number")} />
        </FormField>
      </div>
      {kind === "bank" ? (
        <FormField id={`${p}-iban`} label="IBAN (optional)" error={errors.iban?.message}>
          <Input placeholder="PK36MEZN0002110105678901" autoCapitalize="characters" {...fieldAria(`${p}-iban`, errors.iban?.message)} {...form.register("iban")} />
        </FormField>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton pending={pending} pendingText="Saving…">{accountId ? "Save" : "Add account"}</SubmitButton>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

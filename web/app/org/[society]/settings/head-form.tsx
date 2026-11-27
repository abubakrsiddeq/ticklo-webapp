"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { orgHeadSchema, type HeadInput } from "@/lib/validation/org";
import { HeadFields, type HeadAccount } from "../../head-fields";
import { updateOrgHead } from "../../_actions/org";

/** D-061: owners change (or add) the society head from Settings. */
export function HeadForm({
  orgSlug,
  account,
  defaults,
  otherDefaults,
}: {
  orgSlug: string;
  account: HeadAccount;
  defaults: HeadInput;
  otherDefaults?: { name: string; phone: string; email: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<HeadInput>({ resolver: zodResolver(orgHeadSchema), defaultValues: defaults });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    void form.handleSubmit(() =>
      start(async () => {
        const res = await updateOrgHead(orgSlug, fd);
        if (res.ok) {
          toast.success(res.message ?? "Saved");
          form.reset(form.getValues());
          router.refresh();
        } else {
          toast.error(res.error);
          for (const [k, v] of Object.entries(res.fieldErrors ?? {})) {
            if (k.startsWith("head_")) form.setError(k as keyof HeadInput, { message: v });
          }
        }
      }),
    )(e);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <HeadFields form={form} account={account} otherDefaults={otherDefaults} />
      <SubmitButton pending={pending} pendingText="Saving…" variant="outline" className="sm:justify-self-start">
        Save society head
      </SubmitButton>
    </form>
  );
}

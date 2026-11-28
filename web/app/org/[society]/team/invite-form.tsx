"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { inviteSchema } from "@/lib/validation/team";
import { inviteMember } from "@/app/org/_actions/manage";
import { useActionTransition } from "@/lib/use-action-transition";

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  const form = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "scanner" } });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await inviteMember(orgSlug, values);
      if (res.ok) {
        toast.success(res.message ?? "Invite sent");
        form.reset({ email: "", role: values.role });
        router.refresh();
      } else toast.error(res.error);
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end" noValidate>
      <FormField id="invite-email" label="Email" error={errors.email?.message}>
        <Input type="email" placeholder="volunteer@example.com" {...fieldAria("invite-email", errors.email?.message)} {...form.register("email")} />
      </FormField>
      <FormField id="invite-role" label="Role" error={errors.role?.message}>
        <NativeSelect {...fieldAria("invite-role", errors.role?.message)} {...form.register("role")}>
          <option value="scanner">Gate volunteer (lets people in)</option>
          <option value="member">Member (core team)</option>
        </NativeSelect>
      </FormField>
      <SubmitButton pending={pending} pendingText="Sending…">
        Send invite
      </SubmitButton>
    </form>
  );
}

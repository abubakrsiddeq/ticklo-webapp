"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { orgSchema, type OrgInput } from "@/lib/validation/org";
import type { ActionResult } from "@/lib/errors";

export function OrgForm({
  defaults,
  universities,
  action,
  mode,
}: {
  defaults: OrgInput;
  universities: { id: string; name: string; city: string }[];
  action: (fd: FormData) => Promise<ActionResult>;
  mode: "create" | "edit";
}) {
  const [pending, start] = useTransition();
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const form = useForm<OrgInput>({ resolver: zodResolver(orgSchema), defaultValues: defaults });
  const { errors } = form.formState;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    void form.handleSubmit(() =>
      start(async () => {
        const res = await action(fd);
        if (!res) return;
        if (res.ok) toast.success(res.message ?? "Saved");
        else {
          toast.error(res.error);
          const fe = res.fieldErrors ?? {};
          setFileErrors({ logo: fe.logo ?? "", proof: fe.proof ?? "", referral_code: fe.referral_code ?? "" });
          for (const [k, v] of Object.entries(fe)) if (k in defaults) form.setError(k as keyof OrgInput, { message: v });
        }
      }),
    )(e);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate encType="multipart/form-data">
      <FormField id="name" label="Society name" error={errors.name?.message} required>
        <Input {...fieldAria("name", errors.name?.message)} {...form.register("name")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="university_id" label="University" error={errors.university_id?.message}>
          <NativeSelect {...fieldAria("university_id", errors.university_id?.message)} {...form.register("university_id")}>
            <option value="">Not listed / other</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.city})
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="type" label="Type" error={errors.type?.message} required>
          <NativeSelect {...fieldAria("type", errors.type?.message)} {...form.register("type")}>
            <option value="society">Society / club</option>
            <option value="department">Department</option>
          </NativeSelect>
        </FormField>
      </div>
      <FormField id="about" label="About" hint="What your society does (shown on your public page)." error={errors.about?.message}>
        <Textarea rows={4} {...fieldAria("about", errors.about?.message, true)} {...form.register("about")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="instagram" label="Instagram link" error={errors.instagram?.message}>
          <Input type="url" placeholder="https://instagram.com/…" {...fieldAria("instagram", errors.instagram?.message)} {...form.register("instagram")} />
        </FormField>
        <FormField id="facebook" label="Facebook link" error={errors.facebook?.message}>
          <Input type="url" placeholder="https://facebook.com/…" {...fieldAria("facebook", errors.facebook?.message)} {...form.register("facebook")} />
        </FormField>
        <FormField id="website" label="Website" error={errors.website?.message}>
          <Input type="url" placeholder="https://…" {...fieldAria("website", errors.website?.message)} {...form.register("website")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="logo" label="Logo (optional)" hint="Square image, JPG/PNG/WebP, up to 5 MB." error={fileErrors.logo || undefined}>
          <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="pt-2" />
        </FormField>
        <FormField
          id="proof"
          label={mode === "create" ? "Proof that you run this society" : "New proof document (optional)"}
          hint="Letter from the university or a photo of your society/student ID card. Only TickLO admins see it."
          error={fileErrors.proof || undefined}
          required={mode === "create"}
        >
          <Input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="pt-2" />
        </FormField>
      </div>
      {mode === "create" ? (
        <FormField id="referral_code" label="TickLO ambassador code (optional)" hint="Did a TickLO campus ambassador tell you about us? Enter their code." error={fileErrors.referral_code || undefined}>
          <Input id="referral_code" name="referral_code" maxLength={16} autoComplete="off" autoCapitalize="characters" className="font-mono uppercase sm:max-w-xs" />
        </FormField>
      ) : null}
      <SubmitButton pending={pending} pendingText="Saving…" variant={mode === "create" ? "brand" : "default"} className="sm:justify-self-start">
        {mode === "create" ? "Submit for approval" : "Save changes"}
      </SubmitButton>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { profileSchema, type ProfileInput } from "@/lib/validation/profile";
import { updateProfile } from "./actions";

export function ProfileForm({
  defaults,
  avatarUrl,
  universities,
}: {
  defaults: ProfileInput;
  avatarUrl: string | null;
  universities: { id: string; name: string; short_name: string | null; city: string }[];
}) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors } = form.formState;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    void form.handleSubmit(() =>
      start(async () => {
        const res = await updateProfile(fd);
        if (res.ok) toast.success(res.message ?? "Saved");
        else {
          toast.error(res.error);
          for (const [k, v] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof ProfileInput, { message: v });
        }
      }),
    )(e);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {preview ? <AvatarImage src={preview} alt="" /> : null}
          <AvatarFallback className="bg-navy text-white">{defaults.full_name?.[0] ?? "U"}</AvatarFallback>
        </Avatar>
        <label className="inline-flex h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-medium ring-1 ring-border hover:bg-secondary">
          Change photo (optional)
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
        </label>
      </div>
      <FormField id="full_name" label="Full name" error={errors.full_name?.message} required>
        <Input autoComplete="name" {...fieldAria("full_name", errors.full_name?.message)} {...form.register("full_name")} />
      </FormField>
      <FormField id="phone" label="Mobile number" hint="Shown only to organizers of events you book." error={errors.phone?.message} required>
        <Input type="tel" inputMode="tel" placeholder="0300 1234567" autoComplete="tel" {...fieldAria("phone", errors.phone?.message, true)} {...form.register("phone")} />
      </FormField>
      <FormField id="university_id" label="University (optional)" error={errors.university_id?.message}>
        <NativeSelect {...fieldAria("university_id", errors.university_id?.message)} {...form.register("university_id")}>
          <option value="">Not a student / prefer not to say</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.city})
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <SubmitButton pending={pending} pendingText="Saving…" className="sm:justify-self-start">
        Save profile
      </SubmitButton>
    </form>
  );
}

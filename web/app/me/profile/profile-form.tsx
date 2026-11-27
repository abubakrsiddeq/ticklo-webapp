"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormField, fieldAria } from "@/components/form-field";
import { UniversityPicker, type UniversityChoice } from "@/components/university-picker";
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
  universities: UniversityChoice[];
}) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const universityId = useWatch({ control: form.control, name: "university_id" });

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
      <UniversityPicker
        label="University (optional)"
        emptyLabel="Not a student / prefer not to say"
        universities={universities}
        value={universityId}
        selectProps={form.register("university_id")}
        nameProps={form.register("new_university_name")}
        cityProps={form.register("new_university_city")}
        errors={{
          university_id: errors.university_id?.message,
          new_university_name: errors.new_university_name?.message,
          new_university_city: errors.new_university_city?.message,
        }}
      />
      <SubmitButton pending={pending} pendingText="Saving…" className="sm:justify-self-start">
        Save profile
      </SubmitButton>
    </form>
  );
}

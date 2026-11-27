"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { UniversityPicker, type UniversityChoice } from "@/components/university-picker";
import { checkOrgFile, orgSchema, type OrgInput } from "@/lib/validation/org";
import type { ActionResult } from "@/lib/errors";

export function OrgForm({
  defaults,
  universities,
  action,
  mode,
  hasLogo = false,
}: {
  defaults: OrgInput;
  universities: UniversityChoice[];
  action: (fd: FormData) => Promise<ActionResult>;
  mode: "create" | "edit";
  /** Edit mode: the society already has a logo, so a new one is optional. */
  hasLogo?: boolean;
}) {
  const logoRequired = mode === "create" || !hasLogo;
  const [pending, start] = useTransition();
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const form = useForm<OrgInput>({ resolver: zodResolver(orgSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const universityId = useWatch({ control: form.control, name: "university_id" });
  const typedUniversity = useWatch({ control: form.control, name: "new_university_name" });

  function pickUniversity(id: string) {
    form.setValue("university_id", id, { shouldValidate: true, shouldDirty: true });
    form.setValue("new_university_name", "");
    form.setValue("new_university_city", "");
    form.clearErrors(["new_university_name", "new_university_city"]);
  }

  /** Browser-side file checks for quick feedback (the server checks the real bytes again). */
  function checkFiles(fd: FormData) {
    const logo = fd.get("logo");
    const proof = fd.get("proof");
    const errs = {
      logo: checkOrgFile(logo instanceof File ? logo : null, { label: "Logo", required: logoRequired }) ?? "",
      proof: checkOrgFile(proof instanceof File ? proof : null, { label: "Proof document", allowPdf: true, required: mode === "create" }) ?? "",
    };
    setFileErrors((prev) => ({ ...prev, ...errs }));
    return !errs.logo && !errs.proof;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>, label: string, allowPdf = false) {
    const err = checkOrgFile(e.target.files?.[0], { label, allowPdf }) ?? "";
    setFileErrors((prev) => ({ ...prev, [e.target.name]: err }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const filesOk = checkFiles(fd);
    void form.handleSubmit(() => {
      if (!filesOk) {
        toast.error("Please fix the highlighted fields.");
        return;
      }
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
      });
    })(e);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate encType="multipart/form-data">
      <FormField id="name" label="Society name" error={errors.name?.message} required>
        <Input maxLength={120} autoComplete="organization" {...fieldAria("name", errors.name?.message)} {...form.register("name")} />
      </FormField>
      <FormField id="type" label="Type" error={errors.type?.message} required>
        <NativeSelect {...fieldAria("type", errors.type?.message)} {...form.register("type")}>
          <option value="society">Society / club</option>
          <option value="department">Department</option>
        </NativeSelect>
      </FormField>
      <UniversityPicker
        label="University"
        emptyLabel="No university (city / independent society)"
        universities={universities}
        value={universityId}
        typedName={typedUniversity}
        onPick={pickUniversity}
        selectProps={form.register("university_id")}
        nameProps={form.register("new_university_name")}
        cityProps={form.register("new_university_city")}
        errors={{
          university_id: errors.university_id?.message,
          new_university_name: errors.new_university_name?.message,
          new_university_city: errors.new_university_city?.message,
        }}
      />
      <FormField id="about" label="About" hint="What your society does (shown on your public page)." error={errors.about?.message}>
        <Textarea rows={4} maxLength={2000} {...fieldAria("about", errors.about?.message, true)} {...form.register("about")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="linkedin" label="LinkedIn link" error={errors.linkedin?.message} required>
          <Input type="url" inputMode="url" maxLength={300} placeholder="https://linkedin.com/company/…" {...fieldAria("linkedin", errors.linkedin?.message)} {...form.register("linkedin")} />
        </FormField>
        <FormField id="instagram" label="Instagram link" error={errors.instagram?.message}>
          <Input type="url" inputMode="url" maxLength={300} placeholder="https://instagram.com/…" {...fieldAria("instagram", errors.instagram?.message)} {...form.register("instagram")} />
        </FormField>
        <FormField id="website" label="Website" error={errors.website?.message}>
          <Input type="url" inputMode="url" maxLength={300} placeholder="https://…" {...fieldAria("website", errors.website?.message)} {...form.register("website")} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="logo"
          label={logoRequired ? "Logo" : "New logo (optional)"}
          hint="Square image, JPG/PNG/WebP, up to 5 MB. Shown on your page and tickets."
          error={fileErrors.logo || undefined}
          required={logoRequired}
        >
          <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="pt-2" aria-invalid={fileErrors.logo ? true : undefined} onChange={(e) => onFileChange(e, "Logo")} />
        </FormField>
        <FormField
          id="proof"
          label={mode === "create" ? "Proof that you run this society" : "New proof document (optional)"}
          hint="Letter from the university or a photo of your society/student ID card. Only TickLO admins see it."
          error={fileErrors.proof || undefined}
          required={mode === "create"}
        >
          <Input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="pt-2" aria-invalid={fileErrors.proof ? true : undefined} onChange={(e) => onFileChange(e, "Proof document", true)} />
        </FormField>
      </div>
      {mode === "create" ? (
        <FormField id="referral_code" label="TickLO ambassador code (optional)" hint="Did a TickLO campus ambassador tell you about us? Enter their code." error={fileErrors.referral_code || undefined}>
          <Input id="referral_code" name="referral_code" maxLength={16} pattern="[A-Za-z0-9]*" autoComplete="off" autoCapitalize="characters" className="font-mono uppercase sm:max-w-xs" />
        </FormField>
      ) : null}
      <SubmitButton pending={pending} pendingText="Saving…" variant={mode === "create" ? "brand" : "default"} className="sm:justify-self-start">
        {mode === "create" ? "Submit for approval" : "Save changes"}
      </SubmitButton>
    </form>
  );
}

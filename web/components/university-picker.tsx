"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { OTHER_UNIVERSITY } from "@/lib/validation/university";

export interface UniversityChoice {
  id: string;
  name: string;
  city: string;
  status?: string;
}

/**
 * D-057: university list + "Other – not listed". Choosing Other shows name and
 * city boxes; TickLO admins review the typed university before it shows publicly.
 */
export function UniversityPicker({
  label,
  emptyLabel,
  universities,
  value,
  selectProps,
  nameProps,
  cityProps,
  errors,
}: {
  label: string;
  emptyLabel: string;
  universities: UniversityChoice[];
  value: string | undefined;
  selectProps: UseFormRegisterReturn;
  nameProps: UseFormRegisterReturn;
  cityProps: UseFormRegisterReturn;
  errors: { university_id?: string; new_university_name?: string; new_university_city?: string };
}) {
  const selected = universities.find((u) => u.id === value);
  const pending = selected?.status === "pending";
  return (
    <div className="grid gap-3">
      <FormField
        id="university_id"
        label={label}
        error={errors.university_id}
        hint={pending ? "TickLO is checking this university. It shows on your page once approved." : undefined}
      >
        <NativeSelect {...fieldAria("university_id", errors.university_id, pending)} {...selectProps}>
          <option value="">{emptyLabel}</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.city}){u.status === "pending" ? " – under review" : ""}
            </option>
          ))}
          <option value={OTHER_UNIVERSITY}>Other – my university is not listed</option>
        </NativeSelect>
      </FormField>
      {value === OTHER_UNIVERSITY ? (
        <div className="grid gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-[2fr_1fr]">
          <FormField id="new_university_name" label="University name" error={errors.new_university_name} hint="Full name, e.g. University of Sargodha" required>
            <Input autoComplete="off" {...fieldAria("new_university_name", errors.new_university_name, true)} {...nameProps} />
          </FormField>
          <FormField id="new_university_city" label="City" error={errors.new_university_city} required>
            <Input autoComplete="address-level2" {...fieldAria("new_university_city", errors.new_university_city)} {...cityProps} />
          </FormField>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            TickLO checks new universities before adding them to the list. Until then only you see it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { OTHER_UNIVERSITY } from "@/lib/validation/university";
import { matchUniversities, universityLabel } from "@/lib/university-label";

export interface UniversityChoice {
  id: string;
  name: string;
  short_name?: string | null;
  city: string;
  status?: string;
}

/**
 * D-057: university list + "Other – not listed". Choosing Other shows name and
 * city boxes; TickLO admins review the typed university before it shows publicly.
 * While typing, matching universities from the list are suggested so people pick
 * the existing one instead of filing a duplicate.
 */
export function UniversityPicker({
  label,
  emptyLabel,
  universities,
  value,
  typedName,
  onPick,
  selectProps,
  nameProps,
  cityProps,
  errors,
}: {
  label: string;
  emptyLabel: string;
  universities: UniversityChoice[];
  value: string | undefined;
  /** What is typed in the "University name" box (for suggestions). */
  typedName?: string;
  /** Select a university from the suggestions. */
  onPick?: (id: string) => void;
  selectProps: UseFormRegisterReturn;
  nameProps: UseFormRegisterReturn;
  cityProps: UseFormRegisterReturn;
  errors: { university_id?: string; new_university_name?: string; new_university_city?: string };
}) {
  const selected = universities.find((u) => u.id === value);
  const pending = selected?.status === "pending";
  const suggestions = value === OTHER_UNIVERSITY && onPick ? matchUniversities(universities, typedName ?? "", 6) : [];
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
              {universityLabel(u)}
              {u.status === "pending" ? " – under review" : ""}
            </option>
          ))}
          <option value={OTHER_UNIVERSITY}>Other – my university is not listed</option>
        </NativeSelect>
      </FormField>
      {value === OTHER_UNIVERSITY ? (
        <div className="grid items-start gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-[2fr_1fr]">
          <FormField id="new_university_name" label="University name" error={errors.new_university_name} hint="Full name, e.g. University of Sargodha" required>
            <Input autoComplete="off" maxLength={150} {...fieldAria("new_university_name", errors.new_university_name, true)} {...nameProps} />
          </FormField>
          <FormField id="new_university_city" label="City" error={errors.new_university_city} required>
            <Input autoComplete="address-level2" maxLength={80} {...fieldAria("new_university_city", errors.new_university_city)} {...cityProps} />
          </FormField>
          {suggestions.length ? (
            <div className="sm:col-span-2" aria-live="polite">
              <p className="mb-1.5 text-sm font-medium text-navy">Already in the list? Pick it:</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {suggestions.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onPick?.(u.id)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm text-navy ring-1 ring-border transition-colors hover:bg-brand/5 hover:ring-brand/40"
                    >
                      <Check className="size-4 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0">{universityLabel(u)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            TickLO checks new universities before adding them to the list. Until then only you see it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

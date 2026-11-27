"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, fieldAria } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { phoneInput } from "@/lib/phone";
import { isShown, type AnswerValue, type Answers, type FormField as Field } from "@/lib/registration-form";
import { uploadRegistrationFile } from "@/app/(public)/e/[society]/[event]/register/actions";
import { useActionTransition } from "@/lib/use-action-transition";

/** D-068: the organizer's form fields, for one member or for the team. */
export function FormRenderer({
  fields,
  answers,
  onChange,
  errors,
  prefix,
  preview = false,
}: {
  fields: Field[];
  answers: Answers;
  onChange: (id: string, value: AnswerValue) => void;
  errors: Record<string, string>;
  prefix: string;
  /** builder preview: files are not uploaded */
  preview?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((f) =>
        isShown(f, answers) ? (
          <div key={f.id} className={f.type === "long_text" || f.type === "multi" || f.type === "file" ? "sm:col-span-2" : undefined}>
            <FieldInput field={f} id={`${prefix}-${f.id}`} value={answers[f.id]} onChange={(v) => onChange(f.id, v)} error={errors[f.id]} preview={preview} />
          </div>
        ) : null,
      )}
    </div>
  );
}

function FieldInput({
  field: f,
  id,
  value,
  onChange,
  error,
  preview,
}: {
  field: Field;
  id: string;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  error?: string;
  preview: boolean;
}) {
  const [uploading, start] = useActionTransition();
  const str = typeof value === "string" ? value : "";
  const arr = Array.isArray(value) ? value : [];
  const common = fieldAria(id, error, Boolean(f.help));
  let control: React.ReactNode;
  switch (f.type) {
    case "long_text":
      control = <Textarea {...common} value={str} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={Math.min(f.max ?? 2000, 2000)} />;
      break;
    case "select":
      control = (
        <NativeSelect {...common} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      );
      break;
    case "yes_no":
      control = (
        <NativeSelect {...common} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </NativeSelect>
      );
      break;
    case "multi":
      control = (
        <div className="flex flex-wrap gap-x-5 gap-y-1" role="group" aria-labelledby={`${id}-label`}>
          {(f.options ?? []).map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2 text-sm text-navy">
              <input
                type="checkbox"
                className="size-4 accent-[#0B7D47]"
                checked={arr.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    case "file":
      control = (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            {...common}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="pt-2 sm:max-w-xs"
            disabled={preview || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
                toast.error("Upload a PDF or a JPG, PNG or WebP image.");
                e.target.value = "";
                return;
              }
              if (file.size > 5 * 1024 * 1024) {
                toast.error("The file must be 5 MB or smaller.");
                e.target.value = "";
                return;
              }
              const fd = new FormData();
              fd.set("file", file);
              start(async () => {
                const res = await uploadRegistrationFile(fd);
                if (res.ok && res.data) onChange(res.data.path);
                else toast.error(res.ok ? "Upload failed." : res.error);
              });
            }}
          />
          {uploading ? (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Uploading…
            </span>
          ) : str ? (
            <span className="flex items-center gap-1 text-sm text-brand-strong">
              <CheckCircle2 className="size-4" aria-hidden /> File attached
            </span>
          ) : null}
        </div>
      );
      break;
    default:
      control = (
        <Input
          {...common}
          value={str}
          onChange={(e) => {
            const v = e.target.value;
            // only what the field can hold: digits for a mobile, no spaces in an email or link
            onChange(f.type === "phone" ? phoneInput(v) : f.type === "email" || f.type === "url" ? v.replace(/\s/g, "") : v);
          }}
          type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "number" ? "number" : f.type === "url" ? "url" : f.type === "date" ? "date" : "text"}
          inputMode={f.type === "phone" ? "tel" : f.type === "number" ? "decimal" : f.type === "email" ? "email" : f.type === "url" ? "url" : undefined}
          min={f.type === "number" && f.min != null ? f.min : undefined}
          max={f.type === "number" && f.max != null ? f.max : undefined}
          maxLength={f.type === "short_text" ? Math.min(f.max ?? 200, f.id === "name" ? 80 : f.id === "roll_no" ? 40 : f.id === "university" ? 120 : 300) : f.type === "phone" ? 16 : f.type === "email" ? 120 : 300}
          placeholder={f.type === "phone" ? "0300 1234567 or +92 300 1234567" : f.type === "email" ? "name@gmail.com" : f.type === "url" ? "https://…" : f.id === "university" ? "e.g. NUST" : undefined}
          autoComplete="off"
        />
      );
  }
  return (
    <FormField id={id} label={<span id={`${id}-label`}>{f.label}</span>} hint={f.help} error={error} required={f.required}>
      {control}
    </FormField>
  );
}

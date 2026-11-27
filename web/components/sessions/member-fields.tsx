"use client";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { normalizePhone } from "@/lib/phone";
import { MEMBER_FIELDS, type TeamMember } from "@/lib/sessions";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Member details a lead fills in; `required` comes from the organizer (D-064). */
export function MemberFields({
  prefix,
  member,
  required,
  errors,
  onChange,
}: {
  prefix: string;
  member: TeamMember;
  required: string[];
  errors: Record<string, string>;
  onChange: (k: keyof TeamMember, v: string) => void;
}) {
  const req = (k: string) => required.includes(k);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <FormField id={`${prefix}-name`} label="Full name" error={errors.name} required>
        <Input id={`${prefix}-name`} value={member.name} onChange={(e) => onChange("name", e.target.value)} maxLength={80} autoComplete="off" />
      </FormField>
      {MEMBER_FIELDS.map((f) => (
        <FormField key={f.key} id={`${prefix}-${f.key}`} label={f.label} error={errors[f.key]} required={req(f.key)}>
          <Input
            id={`${prefix}-${f.key}`}
            value={member[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
            maxLength={f.key === "university" ? 120 : f.key === "email" ? 120 : f.key === "roll_no" ? 40 : 20}
            type={f.key === "email" ? "email" : f.key === "phone" ? "tel" : "text"}
            inputMode={f.key === "phone" ? "tel" : f.key === "email" ? "email" : undefined}
            placeholder={f.key === "phone" ? "0300 1234567" : f.key === "university" ? "e.g. NUST" : undefined}
            autoComplete="off"
          />
        </FormField>
      ))}
    </div>
  );
}

/** Same checks as Postgres (clean_members), for quick feedback. */
export function checkMember(m: TeamMember, required: string[]): Record<string, string> {
  const e: Record<string, string> = {};
  if ((m.name ?? "").trim().length < 2) e.name = "Name required";
  for (const f of MEMBER_FIELDS) {
    const v = (m[f.key] ?? "").trim();
    if (!v && required.includes(f.key)) e[f.key] = `${f.label} required`;
  }
  if ((m.phone ?? "").trim() && !normalizePhone(m.phone ?? "")) e.phone = "e.g. 0300 1234567";
  if ((m.email ?? "").trim() && !EMAIL.test((m.email ?? "").trim())) e.email = "Check the email";
  return e;
}


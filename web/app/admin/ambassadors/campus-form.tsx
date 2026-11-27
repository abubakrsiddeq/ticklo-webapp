"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { SubmitButton } from "@/components/submit-button";
import { saveCampusAmbassador } from "../actions";

/** AMB-14: add a TickLO campus ambassador by email. */
export function CampusAmbassadorForm({ universities }: { universities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[2fr_1fr_1.5fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        start(async () => {
          const res = await saveCampusAmbassador({
            email: String(fd.get("email") ?? ""),
            code: String(fd.get("code") ?? ""),
            universityId: String(fd.get("university") ?? "") || null,
            active: true,
          });
          setErrors(res.ok ? {} : (res.fieldErrors ?? {}));
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            formEl.reset();
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <FormField id="ca-email" label="Email of their TickLO account" error={errors.email}>
        <Input id="ca-email" name="email" type="email" required autoComplete="off" />
      </FormField>
      <FormField id="ca-code" label="Code" error={errors.code}>
        <Input id="ca-code" name="code" required maxLength={16} className="font-mono uppercase" autoCapitalize="characters" autoComplete="off" placeholder="SANA" />
      </FormField>
      <FormField id="ca-uni" label="Campus">
        <NativeSelect id="ca-uni" name="university" defaultValue="">
          <option value="">None</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <SubmitButton pending={pending} pendingText="Saving…" variant="brand">
        Add
      </SubmitButton>
    </form>
  );
}

export function CampusToggle({ userId, code, universityId, active }: { userId: string; code: string; universityId: string | null; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await saveCampusAmbassador({ userId, code, universityId, active: !active });
          if (res.ok) toast.success(res.message ?? "Saved");
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      <Power className={active ? "text-brand-strong" : "text-muted-foreground"} /> {active ? "Turn off" : "Turn on"}
    </Button>
  );
}

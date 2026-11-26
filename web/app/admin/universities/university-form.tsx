"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { saveUniversity } from "../actions";

export interface UniRow {
  id: string;
  name: string;
  short_name: string | null;
  city: string;
  email_domain: string | null;
}

export function UniversityForm({ uni, onDone }: { uni?: UniRow; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ name: uni?.name ?? "", short_name: uni?.short_name ?? "", city: uni?.city ?? "", email_domain: uni?.email_domain ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveUniversity(uni?.id ?? null, v);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            setErrors({});
            if (!uni) setV({ name: "", short_name: "", city: "", email_domain: "" });
            onDone?.();
            router.refresh();
          } else {
            setErrors(res.fieldErrors ?? {});
            toast.error(res.error);
          }
        });
      }}
    >
      {(["name", "short_name", "city", "email_domain"] as const).map((k) => (
        <div key={k}>
          <Input
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
            placeholder={{ name: "Full name", short_name: "Short name (LUMS)", city: "City", email_domain: "Email domain" }[k]}
            aria-label={k.replace("_", " ")}
            aria-invalid={errors[k] ? true : undefined}
          />
          {errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null}
        </div>
      ))}
      <div className="flex gap-1">
        <SubmitButton pending={pending}>{uni ? "Save" : "Add"}</SubmitButton>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function UniversityRow({ uni, deleteButton }: { uni: UniRow; deleteButton: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <UniversityForm uni={uni} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium text-navy">
          {uni.name} {uni.short_name ? <span className="text-muted-foreground">({uni.short_name})</span> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {uni.city}
          {uni.email_domain ? ` · @${uni.email_domain}` : ""}
        </p>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {deleteButton}
      </div>
    </div>
  );
}

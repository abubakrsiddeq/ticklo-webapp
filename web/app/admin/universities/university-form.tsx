"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { NativeSelect } from "@/components/native-select";
import { universityLabel } from "@/lib/university-label";
import { approveUniversity, mergeUniversity, saveUniversity } from "../actions";
import { useActionTransition } from "@/lib/use-action-transition";

export interface UniRow {
  id: string;
  name: string;
  short_name: string | null;
  city: string;
  email_domain: string | null;
}

export function UniversityForm({ uni, onDone, approve }: { uni?: UniRow; onDone?: () => void; approve?: boolean }) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  const [v, setV] = useState({ name: uni?.name ?? "", short_name: uni?.short_name ?? "", city: uni?.city ?? "", email_domain: uni?.email_domain ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = approve && uni ? await approveUniversity(uni.id, v) : await saveUniversity(uni?.id ?? null, v);
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
        <SubmitButton pending={pending}>{approve ? "Approve" : uni ? "Save" : "Add"}</SubmitButton>
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

export interface RequestInfo {
  requester: string | null;
  students: number;
  societies: number;
  createdAt: string;
}

/** D-057: a university typed under "Other", waiting for an admin. */
export function UniversityRequestRow({
  uni,
  info,
  approved,
  rejectButton,
}: {
  uni: UniRow;
  info: RequestInfo;
  approved: { id: string; name: string; city: string }[];
  rejectButton: React.ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "approve">("view");
  const [into, setInto] = useState("");
  const [merging, startMerge] = useActionTransition();
  const used = [
    info.students ? `${info.students} student${info.students === 1 ? "" : "s"}` : null,
    info.societies ? `${info.societies} societ${info.societies === 1 ? "y" : "ies"}` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-navy">{uni.name}</p>
          <p className="text-sm text-muted-foreground">
            {uni.city}
            {info.requester ? ` · asked by ${info.requester}` : ""}
            {` · ${new Date(info.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}`}
          </p>
          <p className="text-xs text-muted-foreground">{used.length ? `Linked: ${used.join(", ")}` : "Not linked to anyone yet"}</p>
        </div>
        {mode === "view" ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => setMode("approve")}>
              Check &amp; approve
            </Button>
            {rejectButton}
          </div>
        ) : null}
      </div>
      {mode === "approve" ? <UniversityForm uni={uni} approve onDone={() => setMode("view")} /> : null}
      {approved.length ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startMerge(async () => {
              const res = await mergeUniversity(uni.id, into);
              if (res.ok) {
                toast.success(res.message ?? "Merged");
                router.refresh();
              } else toast.error(res.error);
            });
          }}
        >
          <span className="text-sm text-muted-foreground">Already in the list?</span>
          <NativeSelect value={into} onChange={(e) => setInto(e.target.value)} aria-label={`Merge ${uni.name} into`} className="h-9 w-auto max-w-full min-w-0 flex-1 sm:max-w-xs">
            <option value="">Choose university…</option>
            {approved.map((a) => (
              <option key={a.id} value={a.id}>
                {universityLabel(a)}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton pending={merging} size="sm" variant="outline" disabled={!into || merging}>
            Merge
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

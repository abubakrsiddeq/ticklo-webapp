"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { setEventAccounts } from "@/app/org/_actions/events";
import { useActionTransition } from "@/lib/use-action-transition";

// ORG-02: per event, choose which accounts students see
export function AccountsPicker({
  orgSlug,
  eventId,
  accounts,
  selected,
  isOwner,
}: {
  orgSlug: string;
  eventId: string;
  accounts: { id: string; label: string; detail: string }[];
  selected: string[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(new Set(selected));
  const [pending, start] = useActionTransition();

  if (!accounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No payment accounts yet.{" "}
        {isOwner ? (
          <Link href={`/org/${orgSlug}/payment-accounts`} className="text-brand-strong underline">
            Add one
          </Link>
        ) : (
          "Ask the society owner to add one."
        )}{" "}
        Paid tickets need at least one.
      </p>
    );
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setEventAccounts(orgSlug, eventId, [...chosen]);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      {accounts.map((a) => (
        <label key={a.id} className="flex min-h-11 items-center gap-3 rounded-lg border bg-white px-3 py-2">
          <input
            type="checkbox"
            className="size-5 accent-[#0B7D47]"
            checked={chosen.has(a.id)}
            onChange={(e) => {
              const next = new Set(chosen);
              if (e.target.checked) next.add(a.id);
              else next.delete(a.id);
              setChosen(next);
            }}
          />
          <span>
            <span className="font-medium text-navy">{a.label}</span>
            <span className="block text-sm text-muted-foreground">{a.detail}</span>
          </span>
        </label>
      ))}
      <SubmitButton pending={pending} pendingText="Saving…" variant="outline" className="justify-self-start">
        Save accounts
      </SubmitButton>
    </form>
  );
}

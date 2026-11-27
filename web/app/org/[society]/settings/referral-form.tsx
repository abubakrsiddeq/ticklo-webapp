"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { setOrgReferral } from "../../_actions/org";
import { useActionTransition } from "@/lib/use-action-transition";

/** AMB-14: "Who told you about TickLO?" – once, in the first 30 days. */
export function ReferralCodeForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useActionTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setOrgReferral(orgSlug, code);
          if (res.ok) {
            toast.success(res.message ?? "Saved");
            router.refresh();
          } else {
            setError(res.error);
            toast.error(res.error);
          }
        });
      }}
    >
      <FormField id="org-referral" label="TickLO ambassador code" error={error} className="sm:w-64">
        <Input id="org-referral" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={16} className="font-mono uppercase" autoComplete="off" required />
      </FormField>
      <SubmitButton pending={pending} pendingText="Saving…" variant="outline">
        Add code
      </SubmitButton>
    </form>
  );
}

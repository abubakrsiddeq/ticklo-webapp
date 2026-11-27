"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { resolveDispute } from "./actions";
import { useActionTransition } from "@/lib/use-action-transition";

export function ResolveDispute({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useActionTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await resolveDispute(id, note);
          if (res.ok) {
            toast.success(res.message ?? "Resolved");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the student (what was done)" aria-label="Resolution note" />
      <SubmitButton pending={pending} variant="outline">
        Mark resolved
      </SubmitButton>
    </form>
  );
}

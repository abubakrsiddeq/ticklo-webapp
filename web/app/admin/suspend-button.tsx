"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setUserSuspended } from "./actions";
import { useActionTransition } from "@/lib/use-action-transition";

/** ADM-05 / ADM-06: suspend (asks for a reason) or restore an account. */
export function SuspendButton({ userId, suspended, name }: { userId: string; suspended: boolean; name: string }) {
  const router = useRouter();
  const [pending, start] = useActionTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className={suspended ? "" : "text-destructive"}
      disabled={pending}
      onClick={() => {
        let reason: string | undefined;
        if (!suspended) {
          const r = window.prompt(`Why are you suspending ${name}? (kept in the audit log)`);
          if (r === null) return;
          reason = r.trim() || "Suspended by admin";
        } else if (!window.confirm(`Restore ${name}'s account?`)) return;
        start(async () => {
          const res = await setUserSuspended(userId, !suspended, reason);
          if (res.ok) toast.success(res.message ?? "Done");
          else toast.error(res.error);
          router.refresh();
        });
      }}
    >
      {pending ? "…" : suspended ? "Restore" : "Suspend"}
    </Button>
  );
}

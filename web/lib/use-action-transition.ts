"use client";

import { useCallback, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { actionErrorMessage } from "@/lib/action-errors";

/**
 * D-074: useTransition for calling server actions. If the call throws (no internet, the server
 * failed or timed out, a new version was deployed), people get a toast and the form keeps what
 * they typed, instead of the full-page "Something went wrong" screen that React shows for an
 * error inside a transition. redirect() and notFound() from the action still work.
 */
export function useActionTransition(fallback?: string): [boolean, (run: () => unknown) => void] {
  const [pending, startTransition] = useTransition();
  const start = useCallback(
    (run: () => unknown) =>
      startTransition(async () => {
        try {
          await run();
        } catch (error) {
          unstable_rethrow(error);
          console.error(error);
          toast.error(actionErrorMessage(error, fallback));
        }
      }),
    [fallback],
  );
  return [pending, start];
}

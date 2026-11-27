"use client";

import { useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/lib/errors";
import { actionErrorMessage } from "@/lib/action-errors";

/**
 * A button that runs a server action, shows a toast and refreshes the page.
 * With `confirm`, asks first (for destructive or important actions).
 */
export function ActionButton({
  action,
  children,
  confirm,
  successMessage,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<ActionResult<unknown> | void>;
  confirm?: { title: string; description?: string; confirmLabel?: string };
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      try {
        const res = await action();
        if (res && !res.ok) toast.error(res.error);
        else {
          toast.success((res && res.message) || successMessage || "Done");
          router.refresh();
        }
      } catch (e) {
        // redirect() inside an action throws a special error that Next handles
        unstable_rethrow(e);
        console.error(e);
        toast.error(actionErrorMessage(e));
      }
    });

  const button = (
    <Button {...props} disabled={pending || props.disabled} onClick={confirm ? undefined : run}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
  if (!confirm) return button;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          {confirm.description ? <AlertDialogDescription>{confirm.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run}>{confirm.confirmLabel ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

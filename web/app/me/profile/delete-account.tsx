"use client";

import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { requestDeletion } from "./actions";
import { useActionTransition } from "@/lib/use-action-transition";

export function DeleteAccount({ requestedAt }: { requestedAt: string | null }) {
  const [pending, start] = useActionTransition();
  if (requestedAt) {
    return <p className="text-sm text-muted-foreground">Deletion requested. TickLO will process it soon.</p>;
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Request account deletion
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            TickLO will delete your profile. Tickets for upcoming events will stop working. Records the society needs for
            payments may be kept as the law requires.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my account</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await requestDeletion();
                if (res.ok) toast.success(res.message ?? "Requested");
                else toast.error(res.error);
              })
            }
          >
            Request deletion
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

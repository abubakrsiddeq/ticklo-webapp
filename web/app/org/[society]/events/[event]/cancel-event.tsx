"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { cancelEvent } from "@/app/org/_actions/events";
import { useActionTransition } from "@/lib/use-action-transition";

// ORG-11: confirm, then all ticket holders are emailed (EML-05)
export function CancelEventButton({ orgSlug, eventId, ticketCount }: { orgSlug: string; eventId: string; ticketCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useActionTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Cancel event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this event?</DialogTitle>
          <DialogDescription>
            All {ticketCount} ticket(s) become invalid and every ticket holder gets an email. TickLO has no refund system – you
            must return payments yourself. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await cancelEvent(orgSlug, eventId, { reason, confirm });
              if (res.ok) {
                toast.success(res.message ?? "Cancelled");
                setOpen(false);
                router.refresh();
              } else toast.error(res.error);
            });
          }}
        >
          <FormField id="cancel-reason" label="Reason (sent to attendees)" required>
            <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} minLength={5} required />
          </FormField>
          <FormField id="cancel-confirm" label='Type "CANCEL" to confirm' required>
            <Input id="cancel-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep event
            </Button>
            <SubmitButton pending={pending} pendingText="Cancelling…" variant="destructive" disabled={confirm !== "CANCEL" || reason.trim().length < 5}>
              Cancel event
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

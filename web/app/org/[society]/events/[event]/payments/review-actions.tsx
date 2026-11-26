"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { approveOrder, rejectOrder } from "@/app/org/_actions/manage";

const QUICK_REASONS = ["Amount does not match", "Payment not received in our account", "Screenshot is unclear", "Student card missing or not valid"];

export function ReviewActions({ orgSlug, orderId, refCode, duplicate }: { orgSlug: string; orderId: string; refCode: string; duplicate: boolean }) {
  const router = useRouter();
  const [approving, startApprove] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const approve = () =>
    startApprove(async () => {
      if (duplicate && !window.confirm(`${refCode} is flagged as a possible duplicate. Approve anyway?`)) return;
      const res = await approveOrder(orgSlug, orderId);
      if (res.ok) {
        toast.success(res.message ?? "Approved");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="brand" onClick={approve} disabled={approving || rejecting}>
        <Check /> {approving ? "Approving…" : "Approve"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="text-destructive" disabled={approving}>
            <X /> Reject
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {refCode}?</DialogTitle>
            <DialogDescription>The student gets this reason by email and can upload a new screenshot.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              startReject(async () => {
                const res = await rejectOrder(orgSlug, orderId, { reason });
                if (res.ok) {
                  toast.success(res.message ?? "Rejected");
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error);
              });
            }}
          >
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => (
                <Button key={r} type="button" size="sm" variant="secondary" onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <FormField id={`reason-${orderId}`} label="Reason" required>
              <Textarea id={`reason-${orderId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} minLength={3} required />
            </FormField>
            <DialogFooter>
              <SubmitButton pending={rejecting} pendingText="Rejecting…" variant="destructive" disabled={reason.trim().length < 3}>
                Reject payment
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

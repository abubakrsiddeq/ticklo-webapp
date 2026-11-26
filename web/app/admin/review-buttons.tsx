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
import type { ActionResult } from "@/lib/errors";

/** Approve / reject with a required reason for rejections (ADM-01, ADM-02). */
export function ReviewButtons({ name, review }: { name: string; review: (input: { approve: boolean; note: string }) => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const run = (approve: boolean) =>
    start(async () => {
      const res = await review({ approve, note });
      if (res.ok) {
        toast.success(res.message ?? "Done");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="brand" disabled={pending} onClick={() => run(true)}>
        <Check /> Approve
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="text-destructive" disabled={pending}>
            <X /> Reject
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {name}?</DialogTitle>
            <DialogDescription>The organizer gets this reason by email.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(false);
            }}
          >
            <FormField id="review-note" label="Reason" required>
              <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} required minLength={3} />
            </FormField>
            <DialogFooter>
              <SubmitButton pending={pending} variant="destructive" disabled={note.trim().length < 3}>
                Reject
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

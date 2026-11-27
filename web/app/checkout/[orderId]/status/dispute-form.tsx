"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { openDispute } from "../../actions";
import { useActionTransition } from "@/lib/use-action-transition";

export function DisputeForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useActionTransition();

  if (done) return <p className="rounded-lg bg-brand-soft p-3 text-sm text-navy" role="status">{done}</p>;
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="w-full">
        Paise bheje magar approve nahi hua? Report it
      </Button>
    );
  }
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await openDispute(orderId, { message });
          if (res.ok) setDone(res.message ?? "Reported.");
          else toast.error(res.error);
        });
      }}
    >
      <FormField id="dispute" label="What happened?" hint="Include the date, amount and account you paid into.">
        <Textarea id="dispute" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} minLength={10} maxLength={2000} required />
      </FormField>
      <SubmitButton pending={pending} pendingText="Sending…">Send to TickLO</SubmitButton>
    </form>
  );
}

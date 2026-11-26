"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { SubmitButton } from "@/components/submit-button";
import { applyAmbassador } from "./ambassador-actions";

/** AMB-11: "Become an ambassador" on the event page (only when the organizer opened applications). */
export function AmbassadorCta(props: {
  eventId: string;
  loggedIn: boolean;
  loginHref: string;
  status: "pending" | "approved" | "rejected" | "ambassador" | null;
  perk: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function apply() {
    start(async () => {
      const res = await applyAmbassador(props.eventId, message);
      if (res.ok) {
        toast.success(res.message ?? "Application sent");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const ambassador = props.status === "ambassador" || props.status === "approved";

  return (
    <section className="mt-4 rounded-3xl bg-navy p-5 text-white shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-navy">
          <Megaphone className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold">{ambassador ? "You are an ambassador" : "Become an ambassador"}</h2>
          <p className="mt-1 text-sm text-slate-300">
            {ambassador
              ? "Share your link, see your sales and your rank."
              : props.status === "pending"
                ? "Your application is waiting for the organizer."
                : props.status === "rejected"
                  ? "The organizer did not accept your application for this event."
                  : `Share your own link with friends and climb the leaderboard${props.perk ? ` – ${props.perk}` : ""}.`}
          </p>
        </div>
      </div>
      {ambassador ? (
        <Button asChild variant="brand" className="mt-4 w-full">
          <Link href={`/sell/${props.eventId}/promote`}>Open my ambassador page</Link>
        </Button>
      ) : props.status ? null : !props.loggedIn ? (
        <Button asChild variant="brand" className="mt-4 w-full">
          <Link href={props.loginHref}>Log in to apply</Link>
        </Button>
      ) : (
        <>
          <Button type="button" variant="brand" className="mt-4 w-full" onClick={() => setOpen(true)}>
            Apply
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Become an ambassador</DialogTitle>
                <DialogDescription>The organizer sees your name, phone and university. Once accepted you get your own link and code.</DialogDescription>
              </DialogHeader>
              <FormField id="amb_message" label="Why you? (optional)">
                <Textarea
                  id="amb_message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. I am the CR of BBA-5 and run two WhatsApp groups."
                />
              </FormField>
              <DialogFooter>
                <SubmitButton type="button" variant="brand" onClick={apply} pending={pending} pendingText="Sending…">
                  Send application
                </SubmitButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

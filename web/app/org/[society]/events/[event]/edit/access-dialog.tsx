"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { kindEmoji } from "@/lib/sessions";
import { setTicketTypeAccess } from "@/app/org/_actions/sessions";

export interface AccessSession {
  id: string;
  name: string;
  kind: string;
  pass_access: boolean;
}

/** FES-02: a pass, or only some sessions. Booked tickets can only get more access. */
export function AccessDialog(props: {
  orgSlug: string;
  ticketTypeId: string;
  name: string;
  sessions: AccessSession[];
  allSessions: boolean;
  sessionIds: string[];
  booked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(props.allSessions);
  const [picked, setPicked] = useState<string[]>(props.sessionIds);
  const [pending, start] = useTransition();
  const choosable = props.sessions.filter((s) => s.kind !== "competition");

  function save() {
    start(async () => {
      const res = await setTicketTypeAccess(props.orgSlug, props.ticketTypeId, all, picked);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <DoorOpen /> Opens
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What does “{props.name}” open?</DialogTitle>
            <DialogDescription>
              {props.booked ? "Tickets are already sold: you can give more access, not less." : "Choose a pass or the sessions this ticket is for."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
              <input type="radio" name="access" className="mt-1 size-4 accent-[#0B7D47]" checked={all} onChange={() => setAll(true)} />
              <span>
                <span className="font-medium text-navy">All-access pass</span>
                <span className="block text-xs text-muted-foreground">
                  Main entry + every session included in passes ({props.sessions.filter((s) => s.pass_access).map((s) => s.name).join(", ") || "none yet"}).
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-navy/10 p-3 text-sm">
              <input type="radio" name="access" className="mt-1 size-4 accent-[#0B7D47]" checked={!all} onChange={() => setAll(false)} />
              <span className="grid gap-2">
                <span className="font-medium text-navy">Only these sessions</span>
                {choosable.map((s) => (
                  <span key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={picked.includes(s.id)}
                      disabled={all}
                      onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                      aria-label={s.name}
                    />
                    {kindEmoji(s.kind)} {s.name}
                  </span>
                ))}
                {!choosable.length ? <span className="text-xs text-muted-foreground">Add sessions on the Schedule tab first.</span> : null}
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={save} disabled={pending || (!all && !picked.length)}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setScannerSessions } from "@/app/org/_actions/sessions";
import { useActionTransition } from "@/lib/use-action-transition";

/** FES-07: limit a volunteer to some sessions (nothing ticked = whole event incl. main entry). */
export function ScannerSessionsDialog(props: { orgSlug: string; eventId: string; userId: string; name: string; sessions: { id: string; name: string }[]; selected: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(props.selected);
  const [pending, start] = useActionTransition();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Sessions ${props.name} can scan`} onClick={() => setOpen(true)}>
        <SlidersHorizontal />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What can {props.name} scan?</DialogTitle>
            <DialogDescription>Nothing ticked = the whole event (main entry and every session). Ticked = only those sessions.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {props.sessions.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={picked.includes(s.id)} onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                {s.name}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="brand"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await setScannerSessions(props.orgSlug, props.eventId, props.userId, picked);
                  if (res.ok) {
                    toast.success(res.message ?? "Saved");
                    setOpen(false);
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

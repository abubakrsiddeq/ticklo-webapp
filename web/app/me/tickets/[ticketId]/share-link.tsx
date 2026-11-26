"use client";

import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** TKT-05: each ticket has its own link (opens only for the logged-in owner). */
export function TicketLinkButton({ path }: { path: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          if (navigator.share) await navigator.share({ title: "TickLO ticket", url });
          else {
            await navigator.clipboard.writeText(url);
            toast.success("Ticket link copied");
          }
        } catch {
          /* user cancelled share sheet */
        }
      }}
    >
      <Link2 /> Ticket link
    </Button>
  );
}

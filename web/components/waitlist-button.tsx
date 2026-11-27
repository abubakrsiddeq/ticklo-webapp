"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { joinWaitlist, leaveWaitlist } from "@/app/(public)/e/[society]/[event]/waitlist-actions";

export interface WaitlistEntry {
  id: string;
  status: string;
  line_position: number;
  offer_expires_at: string | null;
}

/** D-071: join / leave the waitlist of a full ticket or competition, or see the held place. */
export function WaitlistButton({
  ticketTypeId = null,
  sessionId = null,
  entry,
  loggedIn,
  loginHref,
  className,
}: {
  ticketTypeId?: string | null;
  sessionId?: string | null;
  entry?: WaitlistEntry | null;
  loggedIn: boolean;
  loginHref: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!loggedIn) {
    return (
      <Link href={loginHref} className={`inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong hover:underline ${className ?? ""}`}>
        <Bell className="size-3.5" aria-hidden /> Log in to join the waitlist
      </Link>
    );
  }
  if (entry?.status === "offered") {
    return (
      <p className={`rounded-lg bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-strong ${className ?? ""}`}>
        🎉 A place is held for you{entry.offer_expires_at ? ` until ${formatDateTime(entry.offer_expires_at)}` : ""} – book now
      </p>
    );
  }
  if (entry) {
    return (
      <span className={`flex flex-wrap items-center gap-2 text-xs ${className ?? ""}`}>
        <span className="font-semibold text-navy">🔔 You are #{entry.line_position} in line</span>
        <button
          type="button"
          disabled={pending}
          className="font-medium text-muted-foreground underline hover:text-navy"
          onClick={() =>
            start(async () => {
              const res = await leaveWaitlist(entry.id);
              if (res.ok) toast.success(res.message ?? "Left");
              else toast.error(res.error);
              router.refresh();
            })
          }
        >
          Leave
        </button>
      </span>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          const res = await joinWaitlist(ticketTypeId, sessionId);
          if (res.ok) toast.success(res.message ?? "Added to the waitlist");
          else toast.error(res.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Bell />} Join waitlist
    </Button>
  );
}

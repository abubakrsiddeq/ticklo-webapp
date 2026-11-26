"use client";

import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { Countdown } from "@/components/countdown";

/** PAY-02: timer for the 60 minute hold; refreshes the page when it ends. */
export function HoldTimer({ until }: { until: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-warning">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Timer className="size-5" aria-hidden /> Tickets held for you
      </span>
      <Countdown until={until} onExpire={() => router.refresh()} className="font-mono text-2xl font-bold tabular-nums" />
    </div>
  );
}

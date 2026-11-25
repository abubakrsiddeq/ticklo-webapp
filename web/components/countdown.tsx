"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/format";

/** Live countdown to `until` (PAY-02 hold timer). Calls onExpire once. */
export function Countdown({
  until,
  onExpire,
  className,
}: {
  until: string;
  onExpire?: () => void;
  className?: string;
}) {
  const target = new Date(until).getTime();
  const [left, setLeft] = useState(() => Math.max(0, Math.round((target - Date.now()) / 1000)));

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const s = Math.max(0, Math.round((target - Date.now()) / 1000));
      setLeft(s);
      if (s === 0 && !fired) {
        fired = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  return (
    <span className={className} role="timer" aria-live="off">
      {formatCountdown(left)}
    </span>
  );
}

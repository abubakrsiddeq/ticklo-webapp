"use client";

import { useEffect } from "react";
import { EVENT_DAY_LAST_KEY, type EventDayMode } from "@/lib/event-day";

/** D-086: the phone remembers its last job so the Event day page can point to it. */
export function RememberMode({ eventId, mode }: { eventId: string; mode: EventDayMode }) {
  useEffect(() => {
    try {
      localStorage.setItem(EVENT_DAY_LAST_KEY, `${eventId}:${mode}`);
    } catch {
      /* private mode */
    }
  }, [eventId, mode]);
  return null;
}

"use client";

import { useEffect } from "react";
import { REF_DAYS, refCookieName } from "@/lib/referrals";
import { trackReferralClick } from "./actions";

/**
 * AMB-03/AMB-04: someone opened an ambassador's link (?ref=ALI). Remember the
 * code for 7 days for this event (last link wins) and count the open once per
 * browser per day.
 */
export function RefCapture({ eventId, code }: { eventId: string; code: string }) {
  useEffect(() => {
    try {
      document.cookie = `${refCookieName(eventId)}=${encodeURIComponent(code)}; Max-Age=${REF_DAYS * 86400}; Path=/; SameSite=Lax`;
    } catch {
      // cookies blocked – the buyer can still type the code
    }
    const day = new Date().toISOString().slice(0, 10);
    const key = `tl_refclick_${eventId}_${code}`;
    let seen = false;
    try {
      seen = localStorage.getItem(key) === day;
      if (!seen) localStorage.setItem(key, day);
    } catch {
      // private mode – count anyway (the server limits per IP)
    }
    if (!seen) void trackReferralClick(eventId, code);
  }, [eventId, code]);
  return null;
}

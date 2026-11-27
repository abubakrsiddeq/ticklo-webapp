import { publicEnv } from "@/lib/env";

export const SITE_NAME = "TickLO";
export const TAGLINE = "TickLO se ticket lo, befikar raho!";

export function absoluteUrl(path = "/"): string {
  return `${publicEnv.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Only allow redirects to paths on this site (prevents open redirects,
 * AUTH-07). Returns the fallback for anything suspicious.
 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  if (next.startsWith("/auth/") || next.startsWith("/login") || next.startsWith("/signup") || next.startsWith("/confirm-email")) return fallback;
  return next;
}

export const eventPath = (orgSlug: string, eventSlug: string) => `/e/${orgSlug}/${eventSlug}`;
export const orgPath = (orgSlug: string) => `/s/${orgSlug}`;
export const dashboardPath = (orgSlug: string) => `/org/${orgSlug}`;
export const dashboardEventPath = (orgSlug: string, eventSlug: string) => `/org/${orgSlug}/events/${eventSlug}`;

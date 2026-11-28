import { publicEnv } from "@/lib/env";

export const SITE_NAME = "TickLO";
export const SUPPORT_EMAIL = "ticklopakistan@gmail.com";
export const TAGLINE = "TickLO se ticket lo, befikar raho!";

/** The company behind TickLO (About, Privacy, Terms). Facts from bkrtechsolutions.com. */
export const COMPANY = {
  name: "BKR Tech Solutions",
  legalName: "BKR Tech Solutions (SMC-Private) Limited",
  website: "https://bkrtechsolutions.com",
  secpCuin: "0332540",
  linkedin: "https://www.linkedin.com/company/bkrtechsolutions",
  founder: { name: "Abubakar Siddique", title: "Founder & CEO", linkedin: "https://www.linkedin.com/in/abubakrsiddeq" },
} as const;

/** Contact details shown on /contact, the footer and the legal pages. */
export const CONTACT = {
  supportEmail: SUPPORT_EMAIL,
  businessEmail: "info@bkrtechsolutions.com.pk",
  phoneDisplay: "+92 (320) 6068300",
  phoneHref: "tel:+923206068300",
  whatsapp: "https://wa.me/923206068300",
  phoneOwner: "Abubakar Siddique, Founder",
  address: "Bahria University, H-11 Campus, Islamabad, Pakistan",
  mapUrl: "https://maps.app.goo.gl/tPidKgtuvGmsbhdE8",
  mapEmbed: "https://maps.google.com/maps?q=Bahria%20University%20H-11%20Campus%20Islamabad&z=15&output=embed",
} as const;

/** Date shown as "Last updated" on the Privacy policy and Terms. Change it whenever they change. */
export const LEGAL_UPDATED = "28 November 2026";

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

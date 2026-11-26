import Link from "next/link";
import { ArrowRight, BadgeCheck, QrCode, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { TAGLINE } from "@/lib/site";

const COLUMNS = [
  {
    title: "Students",
    links: [
      { href: "/events", label: "Browse events" },
      { href: "/societies", label: "Societies" },
      { href: "/me/tickets", label: "My tickets" },
      { href: "/signup", label: "Create account" },
    ],
  },
  {
    title: "Societies",
    links: [
      { href: "/org/new", label: "Register a society" },
      { href: "/org", label: "Organizer dashboard" },
      { href: "/scan", label: "Gate scanner" },
    ],
  },
  {
    title: "TickLO",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "mailto:support@bkrtechsolutions.com", label: "Contact support" },
    ],
  },
];

export function SiteFooter({ showCta = true }: { showCta?: boolean }) {
  return (
    <footer className="no-print mt-auto pt-16">
      {showCta ? (
        <div className="relative z-10 mx-auto -mb-16 max-w-6xl px-4">
          <div className="bg-hero relative overflow-hidden rounded-3xl px-6 py-10 text-white shadow-lift sm:px-10">
            <div className="bg-grid-navy pointer-events-none absolute inset-0 opacity-60" aria-hidden />
            <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-sm font-semibold tracking-widest text-brand-light uppercase">For societies</p>
                <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Run your next event on TickLO – zero fees.</h2>
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-200">
                  <li className="flex items-center gap-1.5"><Wallet className="size-4 text-brand-light" aria-hidden /> Money goes straight to you</li>
                  <li className="flex items-center gap-1.5"><BadgeCheck className="size-4 text-brand-light" aria-hidden /> Duplicate-screenshot alerts</li>
                  <li className="flex items-center gap-1.5"><QrCode className="size-4 text-brand-light" aria-hidden /> Scan at the gate with any phone</li>
                </ul>
              </div>
              <Button asChild variant="brand" size="lg" className="rounded-full px-7">
                <Link href="/org/new">
                  Register your society <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`bg-navy text-slate-300 ${showCta ? "pt-28" : "pt-14"}`}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 pb-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 max-w-sm md:col-span-1">
            <Logo variant="dark" height={34} priority={false} />
            <p className="mt-4 text-base font-medium text-white">{TAGLINE}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Verified tickets for university society events across Pakistan. One QR per ticket, one entry per QR.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h3 className="text-sm font-semibold tracking-wide text-white">{c.title}</h3>
              <ul className="mt-4 grid gap-2.5 text-sm">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition-colors hover:text-brand-light">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} TickLO · A product by BKR Tech Solutions</p>
            <p className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-brand-light" aria-hidden /> Made in Pakistan for students
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarSearch,
  CircleCheck,
  CircleX,
  ExternalLink,
  Globe,
  GraduationCap,
  HeartHandshake,
  Mail,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY, CONTACT, TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "About us",
  description: "TickLO is the free, verified ticketing platform for university society events in Pakistan, built by BKR Tech Solutions.",
};

const BEFORE = [
  "Payment screenshots lost in WhatsApp groups",
  "Names ticked off by hand on printed lists",
  "Fake and reused screenshots slipping through",
  "Long queues and arguments at the gate",
];

const AFTER = [
  "Every payment proof in one review queue",
  "Duplicate screenshot and transaction ID alerts",
  "One QR per ticket, one entry per QR",
  "Any phone becomes a gate scanner",
];

const VALUES = [
  { icon: HeartHandshake, title: "Free for societies", text: "No setup cost, no fee per ticket, no commission. Societies keep every rupee they sell." },
  { icon: Wallet, title: "Money goes straight to you", text: "Buyers pay the society's own bank or wallet account. TickLO never touches the money." },
  { icon: QrCode, title: "One ticket, one entry", text: "Signed QR codes that cannot be faked, and a check-in that works once, even on two phones at once." },
  { icon: ShieldCheck, title: "Private by design", text: "Payment screenshots and student cards stay private and are deleted after the event." },
];

const STUDENT_STEPS = [
  { icon: CalendarSearch, text: "Find events from verified societies at your university." },
  { icon: Wallet, text: "Pay the society by bank, JazzCash or Easypaisa." },
  { icon: Upload, text: "Upload your screenshot. The society verifies it." },
  { icon: ScanLine, text: "Show your QR at the gate and walk right in." },
];

const SOCIETY_STEPS = [
  { icon: BadgeCheck, text: "Register your society. TickLO verifies it." },
  { icon: CalendarSearch, text: "Publish single events, festivals or competitions." },
  { icon: CircleCheck, text: "Approve payments with duplicate alerts built in." },
  { icon: Users, text: "Scan at the gate with your team and watch numbers live." },
];

const COMPANY_STATS = [
  { value: "120+", label: "Projects delivered" },
  { value: "60+", label: "Clients served" },
  { value: "25+", label: "Specialists" },
  { value: "2", label: "Offices: Islamabad and Oslo" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-20 px-4 pt-8 pb-16 sm:pt-12">
      {/* Hero */}
      <section className="bg-hero relative overflow-hidden rounded-3xl px-6 py-14 text-white shadow-lift sm:px-12 sm:py-20">
        <div className="bg-grid-navy pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -bottom-24 size-80 rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="text-sm font-semibold tracking-widest text-brand-light uppercase">About TickLO</p>
          <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
            Every campus event, <span className="text-brand-light">verified.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-200">
            TickLO is the free ticketing platform for university societies in Pakistan. We help societies sell tickets, verify
            payments and run the gate, so students can book with confidence and simply enjoy the event.
          </p>
          <p className="mt-4 font-heading text-lg font-semibold text-white">{TAGLINE}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="brand" size="lg" className="rounded-full px-7">
              <Link href="/events">
                Browse events <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/30 bg-white/10 px-7 text-white hover:bg-white/20 hover:text-white">
              <Link href="/org/new">Register your society</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Why we built it</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">Society events deserve better than screenshots and lists.</h2>
          <div className="mt-5 grid gap-4 leading-relaxed text-slate-600">
            <p>
              Across Pakistan, university societies run concerts, qawwali nights, festivals, workshops and competitions with
              huge energy. Behind the scenes, though, ticketing was a mess of WhatsApp messages, screenshots and printed lists.
            </p>
            <p>
              Organizers spent nights matching payments by hand. Fake screenshots got people in for free. Students waited in long
              queues while volunteers searched for names. TickLO was built to fix exactly that, with tools made for how
              payments really work in Pakistan.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06]">
            <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Before</p>
            <ul className="mt-4 grid gap-3 text-sm text-slate-600">
              {BEFORE.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CircleX className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-navy p-6 text-slate-200 shadow-lift">
            <p className="text-xs font-semibold tracking-widest text-brand-light uppercase">With TickLO</p>
            <ul className="mt-4 grid gap-3 text-sm">
              {AFTER.map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Values */}
      <section aria-labelledby="values">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">What we stand for</p>
          <h2 id="values" className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Built on trust, kept simple.
          </h2>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <li key={v.title} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06] transition-shadow hover:shadow-lift">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <v.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-navy">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="grid gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">How it works</p>
          <h2 id="how" className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Made for both sides of the gate.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { icon: GraduationCap, title: "For students", steps: STUDENT_STEPS, href: "/events", cta: "Find an event" },
            { icon: Building2, title: "For societies", steps: SOCIETY_STEPS, href: "/org/new", cta: "Register your society" },
          ].map((c) => (
            <div key={c.title} className="flex flex-col rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06] sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-brand-light">
                  <c.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-heading text-xl font-semibold text-navy">{c.title}</h3>
              </div>
              <ol className="mt-6 grid flex-1 gap-4">
                {c.steps.map((s, i) => (
                  <li key={s.text} className="flex items-start gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-sm font-semibold text-brand-strong">
                      {i + 1}
                    </span>
                    <span className="pt-1 text-slate-700">{s.text}</span>
                  </li>
                ))}
              </ol>
              <Link href={c.href} className="mt-6 inline-flex items-center gap-1.5 font-medium text-brand-strong hover:underline">
                {c.cta} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Company */}
      <section aria-labelledby="company" className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06] sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">The team behind TickLO</p>
            <h2 id="company" className="mt-2 text-3xl font-bold tracking-tight text-navy">
              Built by {COMPANY.name}
            </h2>
            <p className="mt-4 leading-relaxed text-slate-600">
              TickLO is a product of <strong className="font-semibold text-navy">{COMPANY.legalName}</strong>, a software
              development company with teams in Islamabad and Oslo. The company builds web and mobile apps, SaaS products and
              online stores for businesses around the world, and brings the same engineering standards to TickLO.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm">
              <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 font-medium text-brand-strong">
                <BadgeCheck className="size-4" aria-hidden /> SECP registered (CUIN {COMPANY.secpCuin})
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 font-medium text-brand-strong">
                <BadgeCheck className="size-4" aria-hidden /> PSEB registered
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                <MapPin className="size-4" aria-hidden /> Islamabad, Pakistan
              </li>
            </ul>
            <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {COMPANY_STATS.map((s) => (
                <div key={s.label} className="flex flex-col-reverse justify-end rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/[0.04]">
                  <dt className="mt-1 text-xs leading-snug text-slate-500">{s.label}</dt>
                  <dd className="font-heading text-2xl font-bold text-navy">{s.value}</dd>
                </div>
              ))}
            </dl>
            <a
              href={COMPANY.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 font-medium text-brand-strong hover:underline"
            >
              <Globe className="size-4" aria-hidden /> bkrtechsolutions.com <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>

          <div className="flex flex-col justify-between gap-6 rounded-2xl bg-navy p-6 text-slate-200 sm:p-8">
            <div>
              <p className="text-xs font-semibold tracking-widest text-brand-light uppercase">Founder</p>
              <div className="mt-4 flex items-center gap-4">
                <span
                  className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-light to-brand-strong font-heading text-xl font-bold text-navy"
                  aria-hidden
                >
                  AS
                </span>
                <div>
                  <p className="font-heading text-xl font-semibold text-white">{COMPANY.founder.name}</p>
                  <p className="text-sm text-slate-400">
                    {COMPANY.founder.title}, {COMPANY.name}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-slate-300">
                TickLO started from a simple idea: the people who organise campus events should spend their time on the event,
                not on chasing screenshots.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="brand" size="sm" className="rounded-full">
                <a href={COMPANY.founder.linkedin} target="_blank" rel="noopener noreferrer">
                  LinkedIn <ExternalLink />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <a href={`mailto:${CONTACT.businessEmail}`}>
                  <Mail /> Email
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-brand-soft p-8 ring-1 ring-brand/15 sm:flex-row sm:items-center sm:p-10">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">Want TickLO at your university?</h2>
          <p className="mt-2 max-w-xl text-slate-700">Tell us about your society or your next event. We will help you get started, for free.</p>
        </div>
        <Button asChild variant="default" size="lg" className="rounded-full bg-navy px-7 hover:bg-navy-soft">
          <Link href="/contact">
            Contact us <ArrowRight />
          </Link>
        </Button>
      </section>
    </div>
  );
}

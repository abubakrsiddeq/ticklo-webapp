import Link from "next/link";
import { SellerBanner } from "@/components/print/seller-banner";
import { ArrowRight, BadgeCheck, CalendarSearch, CreditCard, QrCode, ScanLine, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventGrid } from "@/components/event-card";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { LogoMark } from "@/components/logo";
import { listPublicEvents, listUniversities } from "@/lib/queries/public";
import { TAGLINE } from "@/lib/site";

function HeroTicket() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden>
      <div className="absolute -inset-6 rounded-[2.5rem] bg-brand-light/20 blur-3xl" />
      <div className="animate-float relative">
        <div className="ticket-notch overflow-hidden rounded-3xl bg-white text-navy shadow-lift">
          <div className="flex items-center justify-between bg-navy px-6 py-4 text-white">
            <LogoMark variant="dark" size={44} />
            <span className="rounded-full bg-brand-light/20 px-3 py-1 text-xs font-semibold text-brand-light">VALID</span>
          </div>
          <div className="grid gap-4 px-6 py-5">
            <div>
              <p className="text-xs font-semibold tracking-widest text-brand-strong uppercase">Campus pass</p>
              <p className="font-heading text-2xl font-bold">Winter Gala 2026</p>
              <p className="text-sm text-slate-500">Sat, 14 Dec · 6:00 PM PKT</p>
            </div>
            <div className="flex items-center gap-4 border-t border-dashed pt-4">
              <div className="flex size-24 items-center justify-center rounded-2xl bg-secondary ring-4 ring-brand/30">
                <QrCode className="size-16 text-navy" />
              </div>
              <div className="grid gap-1 text-sm">
                <span className="font-semibold">Ali Raza</span>
                <span className="text-slate-500">VIP · 1 ticket</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong">
                  <span className="size-1.5 rounded-full bg-brand" /> Works offline
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-2 -bottom-6 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-navy shadow-lift ring-1 ring-navy/5 sm:-right-8">
        <BadgeCheck className="size-5 text-brand-strong" /> Entry OK
      </div>
    </div>
  );
}

const STEPS = [
  { icon: CalendarSearch, title: "Pick your event", text: "Find society events at your university and choose your tickets." },
  { icon: CreditCard, title: "Pay the society", text: "Send the amount by bank or JazzCash/Easypaisa with your reference code." },
  { icon: Upload, title: "Upload the screenshot", text: "The organizer verifies it – your tickets appear in My tickets." },
  { icon: ScanLine, title: "Walk right in", text: "Show your QR at the gate – even offline. Each ticket enters only once." },
];

// EVT-01: upcoming published events, soonest first
export default async function HomePage() {
  const [{ events, total }, universities] = await Promise.all([listPublicEvents({ limit: 6 }), listUniversities()]);

  return (
    <>
      <SellerBanner className="mx-auto max-w-6xl px-3 pt-4 sm:px-4" />
      {/* Hero */}
      <section className="px-3 pt-4 sm:px-4">
        <div className="bg-hero relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] text-white">
          <div className="bg-grid-navy pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative grid items-center gap-12 px-6 py-14 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-medium text-slate-100 ring-1 ring-white/15">
                <ShieldCheck className="size-4 text-brand-light" aria-hidden /> Verified society events · Zero fees
              </p>
              <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Campus events, <span className="text-gradient-brand">tickets you can trust.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-300">
                {TAGLINE} Book university society events across Pakistan and enter with one scan.
              </p>
              <div className="mt-8 max-w-2xl">
                <EventFilters universities={universities} />
              </div>
              <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                {[
                  ["0 MB", "internet needed at the gate"],
                  ["Rs 0", "TickLO fees"],
                  ["1 tap", "gate check-in"],
                ].map(([v, l]) => (
                  <div key={l} className="flex items-baseline gap-2">
                    <dt className="font-heading text-2xl font-bold text-white">{v}</dt>
                    <dd className="text-slate-400">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="hidden lg:block">
              <HeroTicket />
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Happening soon</p>
            <h2 className="mt-1 text-3xl font-bold text-navy">Upcoming events</h2>
          </div>
          {events.length ? (
            <Button asChild variant="outline" className="shrink-0 rounded-full">
              <Link href="/events">
                {total > events.length ? `View all ${total}` : "Browse events"} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
        {events.length ? (
          <EventGrid events={events} />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No upcoming events yet"
            description="Societies are setting up. Check back soon – or register your society and host the first one!"
            action={
              <Button asChild variant="brand" className="rounded-full">
                <Link href="/org/new">Register your society</Link>
              </Button>
            }
          />
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">How it works</p>
          <h2 className="mt-1 text-3xl font-bold text-navy">Ticket in minutes, entry in seconds</h2>
        </div>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/[0.06]">
              <span className="absolute top-5 right-5 font-heading text-4xl font-bold text-slate-100" aria-hidden>
                0{i + 1}
              </span>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-5 font-heading text-lg font-semibold text-navy">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

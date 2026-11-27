import Link from "next/link";
import { SellerBanner } from "@/components/print/seller-banner";
import {
  ArrowRight,
  CalendarDays,
  CalendarSearch,
  CircleCheck,
  CreditCard,
  ScanLine,
  Sparkles,
  Ticket,
  Upload,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventGrid } from "@/components/event-card";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { LogoMark } from "@/components/logo";
import { listPublicEvents, listUniversities } from "@/lib/queries/public";
import { TAGLINE } from "@/lib/site";
import { cn } from "@/lib/utils";

/** A QR-looking glyph for the illustration (not a real code). */
function QrGlyph({ className }: { className?: string }) {
  const n = 21;
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const dx = x - fx, dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
        return ring !== 1;
      }
    }
    return null;
  };
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      const quiet = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (f ?? (!quiet && ((x * 7 + y * 13 + x * y) % 5 < 2))) cells.push([x, y]);
    }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} shapeRendering="crispEdges" aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Decorative ticket stack on the right of the hero (desktop only). */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30rem]" aria-hidden>
      {/* Layered tilted cards behind the ticket */}
      <div className="absolute inset-[12%] rotate-[14deg] rounded-[2.5rem] bg-gradient-to-br from-brand-light/80 via-brand to-brand-strong shadow-lift" />
      <div className="absolute top-[30%] -left-[2%] h-[52%] w-[46%] -rotate-[18deg] rounded-[2.25rem] bg-gradient-to-br from-navy-soft to-navy shadow-lift" />
      <div className="absolute top-[22%] -right-[4%] h-[56%] w-[30%] rotate-[10deg] rounded-[2.25rem] bg-white/50 shadow-lift ring-1 ring-white backdrop-blur-xl" />

      {/* The ticket */}
      <div className="animate-float-tilt absolute inset-x-[8%] top-[26%]">
        <div className="ticket-notch overflow-hidden rounded-3xl bg-white text-navy shadow-lift">
          <div className="flex items-center justify-between bg-navy px-6 py-4">
            <LogoMark variant="dark" size={44} />
            <span className="rounded-full bg-brand-light/15 px-3 py-1 text-xs font-bold tracking-wide text-brand-light ring-1 ring-brand-light/30">
              VALID
            </span>
          </div>
          <div className="grid gap-4 px-6 py-5">
            <div>
              <p className="text-xs font-bold tracking-widest text-brand-strong uppercase">Campus pass</p>
              <p className="mt-0.5 font-heading text-2xl font-bold">Winter Gala 2026</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <CalendarDays className="size-4" /> Sat, 14 Dec · 6:00 PM PKT
              </p>
            </div>
            <div className="flex items-center gap-4 border-t border-dashed border-navy/15 pt-4">
              <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-white ring-4 ring-brand-soft">
                <QrGlyph className="size-16 text-navy" />
              </div>
              <div className="grid gap-1 text-sm">
                <span className="font-heading text-base font-bold">Ali Raza</span>
                <span className="text-slate-500">VIP · 1 ticket</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong">
                  <span className="size-1.5 rounded-full bg-brand" /> Works offline
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* "Available" sticker with a hand-drawn arrow */}
      <div className="absolute top-[4%] left-[8%] -rotate-6 rounded-full bg-white/90 px-4 py-2 font-heading text-base font-bold text-navy shadow-pill ring-1 ring-white backdrop-blur">
        Available <Ticket className="ml-1 inline size-4 -rotate-12 text-brand-strong" />
      </div>
      <svg className="absolute top-[10%] left-[44%] h-20 w-12 text-navy" viewBox="0 0 48 80" fill="none">
        <path d="M6 4c22 4 34 22 26 52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M24 50l8 10 8-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* Sparkle strokes */}
      <svg className="absolute top-[12%] right-[2%] size-16 text-brand-strong" viewBox="0 0 64 64" fill="none">
        <path d="M14 6l-4 18M40 10L26 28M56 30l-18 6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>

      {/* Entry OK chip */}
      <div className="absolute right-[2%] bottom-[12%] flex items-center gap-2 rounded-full bg-white px-5 py-3 font-heading text-base font-bold text-navy shadow-lift ring-1 ring-navy/5">
        <CircleCheck className="size-6 text-brand-strong" /> Entry OK
      </div>
    </div>
  );
}

const STATS = [
  { icon: WifiOff, value: "0 MB", label: "Internet needed at the gate" },
  { icon: Ticket, value: "Rs 0", label: "TickLO fees" },
  { icon: ScanLine, value: "1 tap", label: "Gate check-in" },
];

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
      {/* Hero – pulled up under the floating header so the soft background runs behind it */}
      <div className="relative isolate -mt-[4.75rem] overflow-x-clip pt-[4.75rem]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -bottom-24 -z-10 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
          aria-hidden
        >
          <div className="absolute top-24 -left-48 size-[30rem] rounded-full bg-brand-light/25 blur-3xl" />
          <div className="absolute -right-40 bottom-0 size-[34rem] rounded-full bg-brand-light/20 blur-3xl" />
          <div className="absolute top-0 left-1/3 h-80 w-[44rem] rounded-full bg-white/80 blur-3xl" />
        </div>
        <SellerBanner className="mx-auto max-w-6xl px-3 pt-4 sm:px-4" />
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-14 lg:pb-10">
          <div>
            <p className="inline-flex items-center gap-2.5 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-navy shadow-sm ring-1 ring-white backdrop-blur">
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:hidden" />
                <span className="relative size-2.5 rounded-full bg-brand" />
              </span>
              Verified society events · Zero fees
            </p>
            <h1 className="mt-6 text-5xl leading-[1.02] font-bold tracking-tight text-navy sm:text-6xl lg:text-7xl">
              Campus events,{" "}
              <span className="bg-gradient-to-r from-brand-strong to-brand bg-clip-text text-transparent">tickets you can</span> trust.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl">
              {TAGLINE} Book university society events across Pakistan – and enter with one scan.
            </p>
            <div className="mt-8 max-w-2xl">
              <EventFilters universities={universities} className="p-2 shadow-lift ring-white" />
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-5">
              {STATS.map(({ icon: Icon, value, label }, i) => (
                <div key={label} className={cn("flex items-start gap-3", i > 0 && "sm:border-l sm:border-navy/10 sm:pl-8")}>
                  <Icon className="mt-1 size-7 shrink-0 text-navy" aria-hidden />
                  <div className="flex flex-col-reverse">
                    <dt className="max-w-[9rem] text-sm leading-snug text-slate-500">{label}</dt>
                    <dd className="font-heading text-2xl font-bold text-navy">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
          <div className="hidden lg:block">
            <HeroVisual />
          </div>
        </section>
      </div>

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

import Link from "next/link";
import { ArrowRight, CalendarSearch, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventGrid } from "@/components/event-card";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { listPublicEvents, listUniversities } from "@/lib/queries/public";
import { TAGLINE } from "@/lib/site";

// EVT-01: upcoming published events, soonest first
export default async function HomePage() {
  const [{ events, total }, universities] = await Promise.all([listPublicEvents({ limit: 9 }), listUniversities()]);

  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-emerald-200">
              <ShieldCheck className="size-4" aria-hidden /> Verified society events
            </p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              University events, <span className="text-brand">one tap</span> away.
            </h1>
            <p className="mt-3 text-lg text-slate-200">{TAGLINE}</p>
          </div>
          <div className="max-w-3xl rounded-xl bg-white p-3 text-foreground shadow-lg">
            <EventFilters universities={universities} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-5 flex items-end justify-between gap-3">
          <h2 className="text-2xl font-bold text-navy">Upcoming events</h2>
          {total > events.length ? (
            <Button asChild variant="ghost">
              <Link href="/events">
                See all {total} <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
        {events.length ? (
          <EventGrid events={events} />
        ) : (
          <EmptyState
            icon={CalendarSearch}
            title="No upcoming events yet"
            description="Societies are setting up. Check back soon – or register your society and host the first one!"
            action={
              <Button asChild variant="brand">
                <Link href="/org/new">Register your society</Link>
              </Button>
            }
          />
        )}
      </section>

      <section className="border-t bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3">
          {[
            { icon: Smartphone, title: "Book in a minute", text: "Pick tickets, send the amount to the society, upload the screenshot. Done." },
            { icon: QrCode, title: "Live QR ticket", text: "Your QR changes every 30 seconds, so screenshots can't be copied or resold." },
            { icon: ShieldCheck, title: "For societies", text: "Verify payments, track sales and scan tickets at the gate with any phone." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-1 size-6 shrink-0 text-brand-strong" aria-hidden />
              <div>
                <h3 className="font-semibold text-navy">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

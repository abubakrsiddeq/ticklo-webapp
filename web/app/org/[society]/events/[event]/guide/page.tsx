import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, DoorOpen, IdCard, Store, XCircle } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { requireOrgEvent } from "@/lib/auth";
import { absoluteUrl } from "@/lib/site";
import { formatEventRange } from "@/lib/format";
import { GUIDE_STEPS, GUIDE_TIPS, MODE_TEXT, type EventDayMode } from "@/lib/event-day";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Event day guide" };

/**
 * D-086: a one-page guide to print and stick at the gate or the ticket desk.
 * The QR opens that job's screen; the steps and colours match the screen itself.
 */
export default async function EventDayGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ society: string; event: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { society, event: eventSlug } = await params;
  const sp = await searchParams;
  const mode: EventDayMode = sp.mode === "desk" ? "desk" : "gate";
  const { org, event } = await requireOrgEvent(society, eventSlug, `/org/${society}/events/${eventSlug}/guide?mode=${mode}`);
  const base = `/org/${org.slug}/events/${event.slug}`;
  const url = absoluteUrl(mode === "gate" ? `/scan/${event.id}` : `/sell/${event.id}`);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const gate = mode === "gate";
  const t = MODE_TEXT[mode];
  const Icon = gate ? DoorOpen : Store;

  const colours = gate
    ? [
        { tone: "bg-green-600 text-white", icon: CheckCircle2, title: "Green: Entry OK", body: "Let them in." },
        { tone: "bg-red-600 text-white", icon: XCircle, title: "Red: stop", body: "Do not let them in. Read the reason on the screen." },
        { tone: "bg-white text-green-800 ring-2 ring-green-700", icon: IdCard, title: "Check student card", body: "Ask for the card before they go in." },
      ]
    : [
        { tone: "bg-amber-400 text-navy", icon: CheckCircle2, title: "Amber: Sold", body: "Give the ticket. Entry is at the gate." },
        { tone: "bg-red-600 text-white", icon: XCircle, title: "Red: do not sell", body: "Already sold, returned, lost or another seller's ticket." },
      ];

  return (
    <div className="grid gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-secondary p-1 text-sm font-semibold">
          <Link href={`${base}/guide?mode=gate`} className={cn("rounded-full px-4 py-2", gate ? "bg-green-600 text-white" : "text-navy")}>
            Gate guide
          </Link>
          <Link href={`${base}/guide?mode=desk`} className={cn("rounded-full px-4 py-2", !gate ? "bg-amber-400 text-navy" : "text-navy")}>
            Desk guide
          </Link>
        </div>
        <div className="flex gap-2">
          <Link href={base} className="inline-flex items-center px-3 text-sm text-muted-foreground hover:underline">
            Back to overview
          </Link>
          <PrintButton label="Print this page" />
        </div>
      </div>

      {/* The sheet. In print it covers the whole page (header and tabs stay hidden). */}
      <article className="mx-auto grid w-full max-w-[720px] gap-6 rounded-2xl bg-white p-6 text-navy shadow-card ring-1 ring-navy/10 [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:fixed print:inset-0 print:z-[100] print:max-w-none print:rounded-none print:p-10 print:shadow-none print:ring-0">
        <header className={cn("flex items-center gap-4 rounded-2xl p-5", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
          <Icon className="size-14 shrink-0" aria-hidden />
          <div>
            <p className="font-heading text-4xl leading-none font-bold uppercase">{t.place}</p>
            <p className="mt-1 text-lg font-semibold">{t.job}</p>
          </div>
        </header>

        <div className="flex flex-col items-center gap-5 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
          <img src={qr} alt={`QR code that opens the ${gate ? "gate" : "desk"} screen`} className="size-44 shrink-0 rounded-xl ring-1 ring-navy/10" />
          <div className="grid gap-1">
            <p className="text-sm text-muted-foreground">{event.name}</p>
            <p className="text-sm text-muted-foreground">{formatEventRange(event.starts_at, event.ends_at)}</p>
            <p className="mt-2 text-xl font-bold">Open the screen</p>
            <p>Point your phone camera at this QR code and log in to TickLO with the account the organizer added.</p>
            <p className="font-mono text-xs break-all text-muted-foreground">{url}</p>
          </div>
        </div>

        <ol className="grid gap-4">
          {GUIDE_STEPS[mode].map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-xl font-bold", gate ? "bg-green-600 text-white" : "bg-amber-400 text-navy")}>
                {i + 1}
              </span>
              <span>
                <span className="block text-xl font-bold">{s.title}</span>
                <span className="text-base">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className={cn("grid gap-3", gate ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {colours.map((c) => (
            <div key={c.title} className={cn("grid justify-items-center gap-1 rounded-xl p-4 text-center", c.tone)}>
              <c.icon className="size-9" aria-hidden />
              <p className="text-lg font-bold">{c.title}</p>
              <p className="text-sm">{c.body}</p>
            </div>
          ))}
        </div>

        <ul className="grid gap-1.5 rounded-xl bg-secondary p-4 text-base">
          {GUIDE_TIPS[mode].map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>

        <p className="text-center text-xs text-muted-foreground">TickLO · {org.name}</p>
      </article>
    </div>
  );
}

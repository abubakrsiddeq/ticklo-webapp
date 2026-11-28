import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, DoorOpen } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime, formatTime } from "@/lib/format";
import { kindEmoji } from "@/lib/sessions";
import { serverNow } from "@/lib/time";
import { ModeStrip } from "@/components/event-day/mode-strip";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scan tickets", robots: { index: false } };

interface ScanSessions {
  event_entry: boolean;
  sessions: { id: string; name: string; kind: string; starts_at: string; ends_at: string; venue: string | null }[];
}

export default async function ScanEventPage({ params, searchParams }: { params: Promise<{ event: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { event: eventId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/scan/${eventId}`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) redirect("/event-day");
  const supabase = await createClient();
  const { data: access } = await supabase.rpc("my_scan_sessions", { p_event_id: eventId });
  const a = (access as unknown as ScanSessions | null) ?? { event_entry: false, sessions: [] };
  if (!a.event_entry && !a.sessions.length) redirect("/not-allowed");
  const [{ data: event }, { data: hasPrinted }] = await Promise.all([
    supabase.from("events").select("id, name, venue, starts_at, ends_at").eq("id", eventId).maybeSingle(),
    supabase.rpc("event_has_printed", { p_event_id: eventId }),
  ]);
  if (!event) redirect("/event-day");

  // D-044: choose main entry or a session (only when there is a choice)
  const options = (a.event_entry ? 1 : 0) + a.sessions.length;
  const picked = sp.session ? a.sessions.find((x) => x.id === sp.session) : null;
  const wantsEntry = sp.session === "entry" && a.event_entry;
  const autoSession = !a.event_entry && a.sessions.length === 1 ? a.sessions[0] : null;
  const session = picked ?? autoSession;

  if (!session && !wantsEntry && (sp.pick || options > 1 || !a.event_entry)) {
    const now = serverNow();
    const sorted = [...a.sessions].sort((x, y) => {
      // happening now / next first
      const live = (s: (typeof a.sessions)[number]) => (new Date(s.ends_at).getTime() < now ? 1 : 0);
      return live(x) - live(y) || x.starts_at.localeCompare(y.starts_at);
    });
    return (
      <>
        <ModeStrip mode="gate" />
        <div className="mx-auto w-full max-w-lg px-4 py-6">
          <p className="text-sm text-slate-300">{event.name}</p>
          <h1 className="mb-1 font-heading text-2xl font-bold">Which door are you at?</h1>
          <p className="mb-4 text-sm text-slate-300">The scanner only lets in tickets that are valid for this door.</p>
          <ul className="grid gap-3">
            {a.event_entry ? (
              <li>
                <Link href={`/scan/${eventId}?session=entry`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 text-navy hover:bg-slate-100">
                  <span className="flex items-center gap-3">
                    <DoorOpen className="size-6 text-brand-strong" aria-hidden />
                    <span>
                      <span className="block font-semibold">Main gate</span>
                      <span className="text-sm text-slate-600">Everyone with a ticket · once per ticket · {event.venue}</span>
                    </span>
                  </span>
                  <ChevronRight className="size-5" aria-hidden />
                </Link>
              </li>
            ) : null}
            {sorted.map((s) => {
              const over = new Date(s.ends_at).getTime() < now;
              const happening = !over && new Date(s.starts_at).getTime() <= now;
              return (
                <li key={s.id}>
                  <Link
                    href={`/scan/${eventId}?session=${s.id}`}
                    className={`flex items-center justify-between gap-3 rounded-xl bg-white p-4 text-navy hover:bg-slate-100 ${over ? "opacity-60" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {kindEmoji(s.kind)} {s.name}
                        {happening ? <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 align-middle text-xs font-semibold text-white">Now</span> : null}
                      </span>
                      <span className="block text-sm text-slate-600">Only tickets that include this session</span>
                      <span className="text-sm text-slate-600">
                        {formatShortDateTime(s.starts_at)}–{formatTime(s.ends_at)}
                        {s.venue ? ` · ${s.venue}` : ""}
                        {over ? " · ended" : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-center text-sm">
            <Link href="/event-day?list=1" className="font-semibold text-brand-light hover:underline">
              Back to Event day
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <Scanner
      key={session?.id ?? "entry"}
      eventId={event.id}
      eventName={event.name}
      scannerName={user.profile.full_name ?? user.email}
      hasPrinted={Boolean(hasPrinted)}
      session={session ? { id: session.id, name: session.name } : null}
      canSwitch={options > 1}
    />
  );
}

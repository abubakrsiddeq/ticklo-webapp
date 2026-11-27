import Link from "next/link";
import { ArrowUpRight, Clock, MapPin } from "lucide-react";
import { Poster } from "@/components/poster";
import { formatDate, formatTime } from "@/lib/format";
import { eventPath } from "@/lib/site";
import { kindEmoji, kindLabel } from "@/lib/sessions";
import type { SessionCardData } from "@/lib/queries/public";

/** D-070: a workshop / competition / night inside a festival, on the Events page. */
export function SessionCard({ s }: { s: SessionCardData }) {
  const ev = s.events;
  const org = ev.organizations;
  const uni = org.universities?.short_name ?? org.universities?.name;
  return (
    <Link
      href={`${eventPath(org.slug, ev.slug)}/s/${s.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/[0.06] transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative">
        <Poster src={s.poster_url ?? ev.poster_url} name={s.name} fit="contain" className="aspect-square w-full" imageClassName="transition duration-500 group-hover:scale-[1.03]" />
        <span className="absolute top-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy shadow-card">
          {kindEmoji(s.kind)} {kindLabel(s.kind)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-brand-strong uppercase">
            🎪 {ev.name}
            {uni ? <span className="text-slate-400"> · {uni}</span> : null}
          </p>
          <h3 className="mt-1 line-clamp-2 font-heading text-lg leading-snug font-semibold text-navy">{s.name}</h3>
        </div>
        <div className="grid gap-1.5 text-sm text-slate-600">
          <span className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-slate-400" aria-hidden />
            {formatDate(s.starts_at)}, {formatTime(s.starts_at)}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{s.venue ?? ev.venue}</span>
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-navy/10 pt-4">
          <span className="text-sm text-slate-500">Part of {org.name}&apos;s festival</span>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-navy transition group-hover:bg-brand-strong group-hover:text-white" aria-hidden>
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function SessionGrid({ sessions }: { sessions: SessionCardData[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} />
      ))}
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { SocietyCardData } from "@/lib/queries/public";
import { orgPath } from "@/lib/site";

/** Societies directory card (D-046): logo, name, university, upcoming events. */
export function SocietyCard({ society: s }: { society: SocietyCardData }) {
  const uni = s.universities;
  return (
    <Link
      href={orgPath(s.slug)}
      className="group flex h-full flex-col gap-3 rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-navy">
          {s.logo_url ? (
            <Image src={s.logo_url} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-heading text-xl font-bold text-white">{s.name[0]}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold text-navy group-hover:text-brand-strong">{s.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {s.type === "department" ? "Department" : "Society"}
            {uni ? ` · ${uni.short_name ?? uni.name}` : ""}
          </p>
        </div>
      </div>
      {s.about ? <p className="line-clamp-3 text-sm text-slate-600">{s.about}</p> : null}
      <div className="mt-auto flex items-center justify-between pt-1 text-sm">
        {s.upcomingCount ? (
          <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 font-medium text-brand-strong">
            <CalendarDays className="size-4" aria-hidden /> {s.upcomingCount} upcoming {s.upcomingCount === 1 ? "event" : "events"}
          </span>
        ) : (
          <span className="text-muted-foreground">No upcoming events</span>
        )}
        <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}

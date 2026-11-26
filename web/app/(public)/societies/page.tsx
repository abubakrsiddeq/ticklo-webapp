import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventFilters } from "@/components/event-filters";
import { EmptyState } from "@/components/empty-state";
import { SocietyCard } from "@/components/society-card";
import { listPublicSocieties, listUniversities } from "@/lib/queries/public";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Societies", description: "Verified university societies on TickLO – find their events." };

const PAGE_SIZE = 24;

/** D-046: directory of verified societies, next to Events in the header. */
export default async function SocietiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const active = sp.show === "active";
  const page = Math.min(20, Math.max(1, Number(sp.page ?? 1) || 1));
  const uni = sp.uni && /^[0-9a-f-]{36}$/i.test(sp.uni) ? sp.uni : undefined;
  const [{ societies, total }, universities] = await Promise.all([
    listPublicSocieties({ q: sp.q, universityId: uni, active, limit: PAGE_SIZE * page, offset: 0 }),
    listUniversities(),
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, uni, show: active ? "active" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/societies?${s}` : "/societies";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm font-semibold tracking-widest text-brand-strong uppercase">Discover</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight text-navy">Societies on TickLO</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Every society here is verified by TickLO. Open a society to see its upcoming and past events.</p>
      <div className="mt-6 mb-5">
        <EventFilters
          universities={universities}
          q={sp.q}
          uni={uni}
          action="/societies"
          placeholder="Search societies…"
          hidden={active ? { show: "active" } : undefined}
        />
      </div>
      <div className="mb-8 inline-flex gap-1 rounded-full bg-white p-1 shadow-card ring-1 ring-navy/[0.06]" role="tablist" aria-label="Which societies">
        {[
          { label: "All societies", href: qs({ show: undefined, page: undefined }), on: !active },
          { label: "With upcoming events", href: qs({ show: "active", page: undefined }), on: active },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            role="tab"
            aria-selected={t.on}
            className={cn(
              "inline-flex h-10 items-center rounded-full px-5 text-sm font-medium transition-colors",
              t.on ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:text-navy",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {societies.length ? (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {societies.map((s) => (
              <li key={s.id}>
                <SocietyCard society={s} />
              </li>
            ))}
          </ul>
          {total > page * PAGE_SIZE ? (
            <div className="mt-8 flex justify-center">
              <Button asChild variant="outline" className="rounded-full px-6">
                <Link href={qs({ page: String(page + 1) })} scroll={false}>
                  Show more
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Users}
          title="No societies found"
          description={sp.q || uni || active ? "Try a different search or university." : "Societies appear here once TickLO approves them."}
        />
      )}
      <div className="mt-12 flex flex-col items-start justify-between gap-3 rounded-3xl bg-navy p-6 text-white sm:flex-row sm:items-center">
        <div>
          <p className="font-heading text-xl font-bold">Run a society?</p>
          <p className="text-sm text-slate-300">Sell tickets, check people in at the gate and see your sales live – free on TickLO.</p>
        </div>
        <Button asChild variant="brand" className="rounded-full px-6">
          <Link href="/org/new">Register your society</Link>
        </Button>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Camera, Globe, Users } from "lucide-react";
import { EventGrid } from "@/components/event-card";
import { EmptyState } from "@/components/empty-state";
import { getSocietyPage } from "@/lib/queries/public";
import { absoluteUrl, orgPath } from "@/lib/site";

type Params = { society: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const data = await getSocietyPage((await params).society);
  if (!data) return { title: "Society not found" };
  return {
    title: data.org.name,
    description: data.org.about?.slice(0, 160) ?? `Events by ${data.org.name} on TickLO`,
    alternates: { canonical: absoluteUrl(orgPath(data.org.slug)) },
    openGraph: { title: data.org.name, images: [{ url: data.org.logo_url ?? "/brand/ticklo-og.png" }] },
  };
}

const ICONS = { instagram: Camera, facebook: Users, website: Globe } as const;
const LABELS = { instagram: "Instagram", facebook: "Facebook", website: "Website" } as const;

// EVT-07: logo, about, upcoming and past events
export default async function SocietyPage({ params }: { params: Promise<Params> }) {
  const data = await getSocietyPage((await params).society);
  if (!data) notFound();
  const { org, upcoming, past } = data;
  const links = Object.entries((org.social_links ?? {}) as Record<string, string>).filter(([k, v]) => k in ICONS && v);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-navy">
          {org.logo_url ? (
            <Image src={org.logo_url} alt={`${org.name} logo`} fill sizes="80px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-heading text-3xl font-bold text-white">{org.name[0]}</span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-navy">{org.name}</h1>
          <p className="text-muted-foreground">
            {org.type === "department" ? "Department" : "Society"}
            {org.universities ? ` · ${org.universities.name}` : ""}
          </p>
          {links.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map(([k, v]) => {
                const Icon = ICONS[k as keyof typeof ICONS];
                return (
                  <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-navy ring-1 ring-border hover:bg-secondary">
                    <Icon className="size-4" aria-hidden /> {LABELS[k as keyof typeof LABELS]}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>
      {org.about ? <p className="mb-8 max-w-3xl whitespace-pre-line text-slate-700">{org.about}</p> : null}

      <h2 className="mb-4 text-xl font-semibold text-navy">Upcoming events</h2>
      {upcoming.length ? <EventGrid events={upcoming} /> : <EmptyState title="No upcoming events" description="Follow the society on social media for announcements." />}

      {past.length ? (
        <>
          <h2 className="mb-4 mt-10 text-xl font-semibold text-navy">Past events</h2>
          <EventGrid events={past} />
        </>
      ) : null}
    </div>
  );
}

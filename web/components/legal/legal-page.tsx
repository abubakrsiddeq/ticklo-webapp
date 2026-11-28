import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, ChevronDown, Mail, MessageCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY, CONTACT, LEGAL_UPDATED } from "@/lib/site";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Body text styles for legal sections (no typography plugin in this project). */
const PROSE =
  "grid gap-3 text-[0.97rem] leading-relaxed text-slate-700 " +
  "[&_a]:font-medium [&_a]:text-brand-strong [&_a]:underline [&_a]:decoration-brand/30 [&_a]:underline-offset-2 hover:[&_a]:decoration-brand " +
  "[&_h3]:mt-2 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-navy " +
  "[&_ul]:grid [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:marker:text-brand " +
  "[&_ol]:grid [&_ol]:gap-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:marker:font-semibold [&_ol]:marker:text-navy " +
  "[&_strong]:font-semibold [&_strong]:text-navy";

/**
 * Shared layout for the Privacy policy and Terms of use: hero, "At a glance" summary,
 * numbered sections with a sticky contents list on desktop (folded list on phones),
 * and a contact card at the end.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  icon: Icon,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  icon: LucideIcon;
  summary: string[];
  sections: LegalSection[];
}) {
  const toc = (
    <ol className="grid gap-0.5 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="flex gap-3 rounded-lg px-3 py-2 text-slate-600 transition-colors hover:bg-white hover:text-navy"
          >
            <span className="w-5 shrink-0 font-mono text-xs leading-5 text-slate-400 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span>{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:pt-12">
      <header className="relative overflow-hidden rounded-3xl bg-white px-6 py-10 shadow-card ring-1 ring-navy/[0.06] sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand-soft blur-2xl" aria-hidden />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold tracking-widest text-brand-strong uppercase">
            <Icon className="size-3.5" aria-hidden /> {eyebrow}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-navy sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{intro}</p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
            <CalendarCheck className="size-4 text-brand-strong" aria-hidden /> Last updated {LEGAL_UPDATED}
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-28">
            <p className="mb-2 px-3 text-xs font-semibold tracking-widest text-slate-500 uppercase">On this page</p>
            {toc}
          </nav>
        </aside>

        <article className="grid max-w-3xl gap-10">
          <details className="group rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 font-medium text-navy [&::-webkit-details-marker]:hidden">
              On this page
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <nav aria-label="On this page" className="border-t px-2 py-2">
              {toc}
            </nav>
          </details>

          <section aria-labelledby="glance" className="rounded-2xl bg-navy p-6 text-slate-200 sm:p-8">
            <h2 id="glance" className="font-heading text-lg font-semibold text-white">
              At a glance
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {summary.map((s) => (
                <li key={s} className="flex gap-3 text-sm leading-relaxed">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-light" aria-hidden />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-slate-400">This summary helps you find your way. The full text below is what applies.</p>
          </section>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm font-semibold text-brand-strong tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h2 id={`${s.id}-h`} className="text-2xl font-bold tracking-tight text-navy">
                  {s.title}
                </h2>
              </div>
              <div className={`mt-4 ${PROSE}`}>{s.body}</div>
            </section>
          ))}

          <section className="rounded-2xl bg-brand-soft p-6 ring-1 ring-brand/15 sm:p-8">
            <h2 className="font-heading text-xl font-semibold text-navy">Questions about this page?</h2>
            <p className="mt-2 text-slate-700">
              Write to us and a real person from the TickLO team will reply. TickLO is run by {COMPANY.legalName}, Islamabad.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="brand" className="rounded-full px-5">
                <a href={`mailto:${CONTACT.supportEmail}`}>
                  <Mail /> {CONTACT.supportEmail}
                </a>
              </Button>
              <Button asChild variant="outline" className="rounded-full bg-white px-5">
                <Link href="/contact">
                  <MessageCircle /> Contact page
                </Link>
              </Button>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}

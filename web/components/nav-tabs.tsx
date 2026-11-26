"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Segmented pill navigation used by dashboards. */
export function NavTabs({ items, exact = [] }: { items: { href: string; label: string; match?: string[] }[]; exact?: string[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print mb-8 overflow-x-auto" aria-label="Section">
      <ul className="inline-flex min-w-max gap-1 rounded-full bg-white p-1 shadow-card ring-1 ring-navy/[0.06]">
        {items.map((i) => {
          const active =
            i.match?.some((m) => pathname === m || pathname.startsWith(`${m}/`)) ||
            (exact.includes(i.href) ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:bg-secondary hover:text-navy",
                )}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavTabs({ items, exact = [] }: { items: { href: string; label: string }[]; exact?: string[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print -mx-4 mb-6 overflow-x-auto border-b px-4" aria-label="Section">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => {
          const active = exact.includes(i.href) ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium",
                  active ? "border-brand text-navy" : "border-transparent text-muted-foreground hover:text-navy",
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

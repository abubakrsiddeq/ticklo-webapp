"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Centre links inside the pill header (desktop). */
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="hidden h-14 items-center gap-0.5 rounded-full bg-white/75 px-2 shadow-pill ring-1 ring-white backdrop-blur-xl md:flex"
    >
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-10 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors lg:px-4 lg:text-[15px]",
              active ? "text-brand-strong" : "text-navy/75 hover:bg-secondary/70 hover:text-navy",
            )}
          >
            {i.label}
            {active ? <span className="absolute inset-x-2 -bottom-2 h-[3px] rounded-full bg-brand-strong" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile menu (sheet) with the same links + auth actions. */
export function MobileMenu({ items, loggedIn }: { items: NavItem[]; loggedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[86vw] max-w-sm gap-0 p-0" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between border-b p-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Logo height={28} href="/" />
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </SheetHeader>
        <nav className="grid gap-1 p-3" aria-label="Mobile">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex min-h-12 items-center rounded-2xl px-4 text-base font-medium",
                isActive(pathname, i.href) ? "bg-brand-soft text-brand-strong" : "text-navy hover:bg-secondary",
              )}
            >
              {i.label}
            </Link>
          ))}
        </nav>
        {!loggedIn ? (
          <div className="mt-auto grid gap-2 border-t p-4">
            <Button asChild variant="outline" size="lg" className="rounded-full" onClick={() => setOpen(false)}>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild variant="brand" size="lg" className="rounded-full" onClick={() => setOpen(false)}>
              <Link href="/signup">Create free account</Link>
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

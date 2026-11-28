"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  CalendarDays,
  ChevronRight,
  Compass,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanLine,
  Sparkles,
  Store,
  Ticket,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
      className="hidden h-14 items-center gap-1 rounded-full bg-white/75 px-1.5 shadow-pill ring-1 ring-white backdrop-blur-xl md:flex"
    >
      {items.map((i) => {
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors lg:px-5 lg:text-[15px]",
              active
                ? "bg-brand-strong text-white shadow-[0_6px_16px_-6px_rgb(11_125_71/0.6)]"
                : "text-navy/70 hover:bg-secondary/80 hover:text-navy",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

function iconFor(href: string): LucideIcon {
  if (href.startsWith("/events")) return CalendarDays;
  if (href.startsWith("/societies")) return Users;
  if (href.startsWith("/me/tickets")) return Ticket;
  if (href === "/org/new") return Sparkles;
  if (href.startsWith("/org")) return LayoutDashboard;
  if (href.startsWith("/scan")) return ScanLine;
  if (href.startsWith("/sell")) return Store;
  return Compass;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "U";

export interface MobileMenuUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

/*
 * Open / closed is shared by every MobileMenu on the page. The header first renders
 * a quick version (public links) while the signed-in part loads; when the full
 * version replaces it, a menu that is already open stays open and just gets the
 * rest of the links.
 */
let menuOpen = false;
const listeners = new Set<() => void>();
function setMenuOpen(v: boolean) {
  menuOpen = v;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function useMenuOpen(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => menuOpen, () => false), setMenuOpen];
}

/** Mobile menu: a glass panel with the same links (icons, active = green pill), the account and auth actions. */
export function MobileMenu({ items, user, loading = false }: { items: NavItem[]; user: MobileMenuUser | null; loading?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useMenuOpen();
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-navy/30 backdrop-blur-sm"
        className="w-[88vw] max-w-sm gap-0 overflow-hidden rounded-l-[2rem] border-0 bg-background p-0 shadow-2xl sm:max-w-sm"
      >
        {/* Soft brand glow */}
        <div className="pointer-events-none absolute -top-28 -right-24 size-72 rounded-full bg-brand-light/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-28 size-72 rounded-full bg-brand-light/15 blur-3xl" aria-hidden />

        <div className="relative flex h-full flex-col overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Site navigation</SheetDescription>
            <Logo height={30} href="/" />
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="flex size-11 items-center justify-center rounded-full bg-white text-navy shadow-pill ring-1 ring-navy/[0.06] transition active:scale-95"
            >
              <X className="size-5" />
            </button>
          </div>

          {loading ? (
            <div className="mx-4 flex items-center gap-3 rounded-3xl bg-white/80 p-3 shadow-card ring-1 ring-white" aria-hidden>
              <span className="size-12 animate-pulse rounded-full bg-secondary" />
              <span className="grid flex-1 gap-2">
                <span className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
                <span className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
              </span>
            </div>
          ) : user ? (
            <Link
              href="/me/profile"
              onClick={close}
              className="mx-4 flex items-center gap-3 rounded-3xl bg-white/80 p-3 shadow-card ring-1 ring-white backdrop-blur"
            >
              <Avatar className="size-12 ring-2 ring-brand-soft">
                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-navy text-sm font-semibold text-white">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-base font-bold text-navy">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-navy" aria-hidden>
                <UserRound className="size-4" />
              </span>
            </Link>
          ) : null}

          <p className="px-6 pt-6 pb-2 text-[11px] font-bold tracking-[0.18em] text-slate-400 uppercase">Menu</p>
          {/* Rows show at once with the panel (D-085: the old one-by-one entrance read as slow loading). */}
          <nav className="grid gap-1.5 px-3" aria-label="Mobile">
            {items.map((i) => {
              const active = isActive(pathname, i.href);
              const Icon = iconFor(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-14 items-center gap-3 rounded-2xl px-2.5 text-base font-semibold transition-colors",
                    active
                      ? "bg-brand-strong text-white shadow-[0_10px_24px_-10px_rgb(11_125_71/0.7)]"
                      : "text-navy hover:bg-white/80 active:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active ? "bg-white/15 text-white" : "bg-white text-brand-strong shadow-sm ring-1 ring-navy/[0.06]",
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex-1">{i.label}</span>
                  <ChevronRight
                    className={cn("size-4 transition group-hover:translate-x-0.5", active ? "text-white/80" : "text-slate-300")}
                    aria-hidden
                  />
                </Link>
              );
            })}
            {loading
              ? [0, 1].map((k) => (
                  <div key={k} className="flex min-h-14 items-center gap-3 px-2.5" aria-hidden>
                    <span className="size-10 shrink-0 animate-pulse rounded-xl bg-white" />
                    <span className="h-4 w-1/2 animate-pulse rounded bg-white" />
                  </div>
                ))
              : null}
          </nav>

          <div className="mt-auto p-4 pt-8">
            {loading ? (
              <div className="h-13 w-full animate-pulse rounded-2xl bg-white" aria-hidden />
            ) : user ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-red-600 shadow-sm ring-1 ring-navy/[0.06] transition active:scale-[0.98]"
                >
                  <LogOut className="size-4" aria-hidden /> Log out
                </button>
              </form>
            ) : (
              <div
                className="bg-hero relative overflow-hidden rounded-3xl p-5 text-white shadow-lift"
              >
                <div className="bg-grid-navy pointer-events-none absolute inset-0" aria-hidden />
                <div className="relative">
                  <p className="text-xs font-bold tracking-widest text-brand-light uppercase">Ticket lo, befikar raho</p>
                  <p className="mt-1.5 font-heading text-lg leading-snug font-bold">All your tickets in one place.</p>
                  <p className="mt-1 text-sm text-slate-300">Create a free account to book society events.</p>
                  <div className="mt-4 grid gap-2">
                    <Button asChild variant="brand" size="lg" className="h-12 rounded-full" onClick={close}>
                      <Link href="/signup">Create free account</Link>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="lg"
                      className="h-12 rounded-full bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15 hover:text-white"
                      onClick={close}
                    >
                      <Link href="/login">Log in</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

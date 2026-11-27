import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { UserMenu, type UserMenuOrg } from "@/components/user-menu";
import { HeaderNav, MobileMenu, type NavItem } from "@/components/header-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

async function loadMenuData(userId: string) {
  const supabase = await createClient();
  const [{ data: memberships }, { data: scanEvents }, { data: sellEvents }, { data: campus }, { count: managed }] = await Promise.all([
    supabase.from("organization_members").select("role, organizations!inner ( slug, name, status )").eq("user_id", userId),
    supabase.rpc("my_scan_events"),
    supabase.rpc("my_sell_events"),
    supabase.from("campus_ambassadors").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("session_managers").select("session_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const orgs: UserMenuOrg[] = (memberships ?? [])
    .filter((m) => m.role !== "scanner")
    .map((m) => ({ slug: m.organizations.slug, name: m.organizations.name, role: m.role }));
  // Sellers of printed tickets get a "Sell" link (D-042)
  // D-043: ambassadors (event or TickLO campus) get "My ambassador page"
  const isAmbassador = Boolean(campus) || (sellEvents ?? []).some((e) => e.ref_code);
  // D-044: session managers get "My sessions"
  return { orgs, canScan: (scanEvents ?? []).length > 0, canSell: (sellEvents ?? []).length > 0, isAmbassador, managesSessions: (managed ?? 0) > 0 };
}

const glass = "rounded-full bg-white/75 shadow-pill ring-1 ring-white backdrop-blur-xl";

/**
 * Floating header, sticky on scroll: logo, a glass pill with the links (active one
 * underlined in green) and a glass pill for the account. A blurred band behind it
 * fades out downwards so content scrolling under it stays readable. Streams in: the
 * shell shows at once and the signed-in part fills in, so it never holds a page back (D-038).
 */
export function SiteHeader() {
  return (
    <Suspense fallback={<SiteHeaderShell />}>
      <SiteHeaderContent />
    </Suspense>
  );
}

function HeaderFrame({ nav, right }: { nav: React.ReactNode; right: React.ReactNode }) {
  return (
    <header className="no-print sticky top-0 z-50 px-3 pt-3 sm:px-4">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-background/50 backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
        <Logo height={34} />
        {nav}
        <div className={`flex h-14 items-center gap-1 p-1.5 ${glass}`}>{right}</div>
      </div>
    </header>
  );
}

/** Same header without the user parts – shown while the header loads and in loading.tsx skeletons. */
export function SiteHeaderShell() {
  return (
    <HeaderFrame
      nav={
        <HeaderNav
          items={[
            { href: "/events", label: "Events" },
            { href: "/societies", label: "Societies" },
          ]}
        />
      }
      right={<span className="size-10 animate-pulse rounded-full bg-secondary" aria-hidden />}
    />
  );
}

async function SiteHeaderContent() {
  const session = isSupabaseConfigured ? await getSession() : null;
  // Profile and menu data in parallel (the user id comes from the verified JWT).
  const [user, menu] = session ? await Promise.all([getCurrentUser(), loadMenuData(session.id)]) : [null, null];

  const items: NavItem[] = [
    { href: "/events", label: "Events" },
    { href: "/societies", label: "Societies" },
    ...(user ? [{ href: "/me/tickets", label: "My tickets" }] : []),
    menu?.orgs.length
      ? { href: menu.orgs.length === 1 ? `/org/${menu.orgs[0].slug}` : "/org", label: "Dashboard" }
      : { href: "/org/new", label: "Register your society", shortLabel: "Register society" },
    ...(menu?.canScan ? [{ href: "/scan", label: "Scan" }] : []),
    ...(menu?.canSell ? [{ href: "/sell", label: "Sell" }] : []),
  ];

  return (
    <HeaderFrame
      nav={<HeaderNav items={items} />}
      right={
        <>
          {user && menu ? (
            <UserMenu
              name={user.profile.full_name ?? user.email}
              email={user.email}
              avatarUrl={user.profile.avatar_url}
              isAdmin={user.profile.is_admin}
              orgs={menu.orgs}
              canScan={menu.canScan}
              canSell={menu.canSell}
              isAmbassador={menu.isAmbassador}
              managesSessions={menu.managesSessions}
            />
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden h-11 rounded-full px-4 sm:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild variant="brand" className="hidden h-11 rounded-full px-5 sm:inline-flex">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <MobileMenu
            items={items}
            user={user ? { name: user.profile.full_name ?? user.email, email: user.email, avatarUrl: user.profile.avatar_url } : null}
          />
        </>
      }
    />
  );
}

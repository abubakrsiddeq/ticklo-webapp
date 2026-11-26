import Link from "next/link";
import { Logo } from "@/components/logo";
import { UserMenu, type UserMenuOrg } from "@/components/user-menu";
import { HeaderNav, MobileMenu, type NavItem } from "@/components/header-nav";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

async function loadMenuData(userId: string) {
  const supabase = await createClient();
  const [{ data: memberships }, { data: scanEvents }] = await Promise.all([
    supabase.from("organization_members").select("role, organizations!inner ( slug, name, status )").eq("user_id", userId),
    supabase.rpc("my_scan_events"),
  ]);
  const orgs: UserMenuOrg[] = (memberships ?? [])
    .filter((m) => m.role !== "scanner")
    .map((m) => ({ slug: m.organizations.slug, name: m.organizations.name, role: m.role }));
  return { orgs, canScan: (scanEvents ?? []).length > 0 };
}

/** Floating pill header (glass), sticky on scroll. */
export async function SiteHeader() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null;
  const menu = user ? await loadMenuData(user.id) : null;

  const items: NavItem[] = [
    { href: "/events", label: "Events" },
    ...(user ? [{ href: "/me/tickets", label: "My tickets" }] : []),
    menu?.orgs.length
      ? { href: menu.orgs.length === 1 ? `/org/${menu.orgs[0].slug}` : "/org", label: "Dashboard" }
      : { href: "/org/new", label: "For societies" },
    ...(menu?.canScan ? [{ href: "/scan", label: "Scan" }] : []),
  ];

  return (
    <header className="no-print sticky top-0 z-50 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full bg-white/85 pr-2 pl-5 shadow-pill ring-1 ring-navy/[0.06] backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
        <Logo height={30} />
        <HeaderNav items={items} />
        <div className="flex items-center gap-1.5">
          {user && menu ? (
            <UserMenu
              name={user.profile.full_name ?? user.email}
              email={user.email}
              avatarUrl={user.profile.avatar_url}
              isAdmin={user.profile.is_admin}
              orgs={menu.orgs}
              canScan={menu.canScan}
            />
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden rounded-full sm:inline-flex">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild variant="brand" className="hidden rounded-full px-5 sm:inline-flex">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <MobileMenu items={items} loggedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}

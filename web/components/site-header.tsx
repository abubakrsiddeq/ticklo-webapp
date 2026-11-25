import Link from "next/link";
import { Logo } from "@/components/logo";
import { UserMenu, type UserMenuOrg } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

async function loadMenuData(userId: string) {
  const supabase = await createClient();
  const [{ data: memberships }, { data: scanEvents }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role, organizations!inner ( slug, name, status )")
      .eq("user_id", userId),
    supabase.rpc("my_scan_events"),
  ]);
  const orgs: UserMenuOrg[] = (memberships ?? [])
    .filter((m) => m.role !== "scanner")
    .map((m) => ({ slug: m.organizations.slug, name: m.organizations.name, role: m.role }));
  return { orgs, canScan: (scanEvents ?? []).length > 0 };
}

export async function SiteHeader() {
  const user = isSupabaseConfigured ? await getCurrentUser() : null;
  const menu = user ? await loadMenuData(user.id) : null;

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/events">Events</Link>
          </Button>
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
              <Button asChild variant="ghost">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild variant="brand">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { NavTabs } from "@/components/nav-tabs";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · TickLO" }, robots: { index: false } };

// Admin panel: TickLO team accounts only (profiles.is_admin)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">TickLO admin</p>
        <NavTabs
          exact={["/admin"]}
          items={[
            { href: "/admin", label: "Overview" },
            { href: "/admin/approvals", label: "Approvals" },
            { href: "/admin/orders", label: "Orders & disputes" },
            { href: "/admin/fraud", label: "Fraud" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/universities", label: "Universities" },
            { href: "/admin/logs", label: "Logs" },
          ]}
        />
        {children}
      </main>
    </>
  );
}

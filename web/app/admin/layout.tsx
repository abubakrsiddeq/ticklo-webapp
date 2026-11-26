import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { NavTabs } from "@/components/nav-tabs";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · TickLO" }, robots: { index: false } };

// Admin panel: TickLO team accounts only (profiles.is_admin)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="mb-1 text-sm font-semibold tracking-widest text-brand-strong uppercase">TickLO admin</p>
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-navy">Control centre</h1>
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
      <SiteFooter showCta={false} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My societies" };

export default async function MySocietiesPage() {
  const user = await requireUser("/org");
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations!inner ( slug, name, status )")
    .eq("user_id", user.id);
  const orgs = (data ?? []).filter((m) => m.role !== "scanner");
  if (orgs.length === 1) redirect(`/org/${orgs[0].organizations.slug}`);

  return (
    <>
      <PageHeader
        title="My societies"
        actions={
          <Button asChild variant="brand">
            <Link href="/org/new">
              <Plus /> Register a society
            </Link>
          </Button>
        }
      />
      {orgs.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {orgs.map((m) => (
            <Link key={m.organizations.slug} href={`/org/${m.organizations.slug}`} className="flex items-center justify-between rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4 hover:bg-secondary/60">
              <div>
                <p className="font-semibold text-navy">{m.organizations.name}</p>
                <p className="text-sm capitalize text-muted-foreground">{m.role}</p>
              </div>
              <StatusBadge status={m.organizations.status} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Users} title="You don't run a society on TickLO yet" description="Register your society to start selling tickets." />
      )}
    </>
  );
}

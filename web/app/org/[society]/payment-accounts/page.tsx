import type { Metadata } from "next";
import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountLabel } from "@/lib/payments/accounts";
import { formatDate } from "@/lib/format";
import { AccountForm } from "./account-form";
import { AccountList } from "./account-list";

export const metadata: Metadata = { title: "Payment accounts" };

// ORG-02 (owner only) + links to reports (ORG-12)
export default async function PaymentAccountsPage({ params }: { params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org } = await requireOrgOwner(society, `/org/${society}/payment-accounts`);
  const supabase = await createClient();
  const [{ data: accounts }, { data: events }] = await Promise.all([
    supabase.from("payment_accounts").select("*").eq("org_id", org.id).order("created_at"),
    supabase.from("events").select("slug, name, starts_at, status").eq("org_id", org.id).in("status", ["published", "cancelled"]).order("starts_at", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment accounts</CardTitle>
          <CardDescription>
            Students send money directly to these accounts – TickLO never holds your money and charges no fee. Choose per event which
            accounts are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <AccountList
            orgSlug={org.slug}
            accounts={(accounts ?? []).map((a) => ({
              id: a.id,
              kind: a.kind,
              label: accountLabel(a),
              bank_name: a.bank_name,
              account_title: a.account_title,
              account_number: a.account_number,
              iban: a.iban,
              is_active: a.is_active,
            }))}
          />
          <div className="rounded-lg border border-dashed p-4">
            <h3 className="mb-3 font-semibold text-navy">Add an account</h3>
            <AccountForm orgSlug={org.slug} accountId={null} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Approved orders and money collected per account, for each event.</CardDescription>
        </CardHeader>
        <CardContent>
          {events?.length ? (
            <ul className="divide-y">
              {events.map((e) => (
                <li key={e.slug}>
                  <Link href={`/org/${org.slug}/events/${e.slug}/report`} className="flex min-h-12 items-center justify-between gap-2 py-2 hover:underline">
                    <span className="flex items-center gap-2">
                      <FileBarChart className="size-4 text-brand-strong" aria-hidden /> {e.name}
                    </span>
                    <span className="text-sm text-muted-foreground">{formatDate(e.starts_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Reports appear once you have published events.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

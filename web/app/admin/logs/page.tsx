import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatShortDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Logs" };

// ADM-08 audit log (who, what, when) + email log (failed emails visible to admins)
export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("/admin/logs");
  const sp = await searchParams;
  const tab = sp.tab === "emails" ? "emails" : "audit";
  const onlyFailed = sp.failed === "1";
  const supabase = await createClient();

  const tabs = (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist">
      {[
        { key: "audit", label: "Audit log", href: "/admin/logs" },
        { key: "emails", label: "Emails", href: "/admin/logs?tab=emails" },
      ].map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={tab === t.key}
          className={cn("inline-flex h-11 items-center rounded-full px-4 text-sm font-medium", tab === t.key ? "bg-navy text-white" : "bg-white text-navy ring-1 ring-border")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "emails") {
    let q = supabase.from("email_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (onlyFailed) q = q.eq("status", "failed");
    const { data: emails } = await q;
    return (
      <div>
        {tabs}
        <p className="mb-2 text-sm">
          <Link href={onlyFailed ? "/admin/logs?tab=emails" : "/admin/logs?tab=emails&failed=1"} className="text-brand-strong underline">
            {onlyFailed ? "Show all emails" : "Show only failed"}
          </Link>
        </p>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(emails ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{formatShortDateTime(e.created_at)}</td>
                  <td className="px-3 py-2">{e.to_email}</td>
                  <td className="px-3 py-2">
                    {e.template}
                    <div className="max-w-xs truncate text-xs text-muted-foreground">{e.subject}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-muted-foreground">{e.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const { data: audit } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
  const actorIds = [...new Set((audit ?? []).map((a) => a.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? a.id]));

  return (
    <div>
      {tabs}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-secondary/60 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">What</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(audit ?? []).map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 whitespace-nowrap">{formatShortDateTime(a.created_at)}</td>
                <td className="px-3 py-2">{a.actor_id ? names.get(a.actor_id) ?? "–" : "system"}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-3 py-2 text-xs">
                  {a.target_type === "order" && a.target_id ? (
                    <Link href={`/admin/orders/${a.target_id}`} className="underline">
                      order
                    </Link>
                  ) : (
                    a.target_type
                  )}
                </td>
                <td className="max-w-sm truncate px-3 py-2 font-mono text-xs text-muted-foreground">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

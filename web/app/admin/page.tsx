import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, MailWarning, MessageSquareWarning, Ticket, Users, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

interface Overview {
  events_this_week: number;
  tickets_this_week: number;
  revenue_this_week_paisa: number;
  pending_societies: number;
  pending_events: number;
  open_disputes: number;
  duplicate_flags: number;
  failed_emails_7d: number;
  users: number;
}

function Tile({ icon: Icon, label, value, href, alert }: { icon: typeof Ticket; label: string; value: string | number; href?: string; alert?: boolean }) {
  const body = (
    <div className={`flex h-full flex-col gap-1 rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4 ${alert ? "border-amber-300 bg-amber-50" : ""}`}>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <span className="font-heading text-2xl font-bold text-navy tabular-nums">{value}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// ADM-09 overview + quick links to everything that needs attention
export default async function AdminOverviewPage() {
  await requireAdmin("/admin");
  const supabase = await createClient();
  const [{ data }, { data: audit }, { data: failed }, { data: deletions }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.from("audit_log").select("id, action, target_type, target_id, created_at, details").order("created_at", { ascending: false }).limit(8),
    supabase.from("email_log").select("id, to_email, template, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(5),
    supabase.from("profiles").select("id, full_name, email, deletion_requested_at").not("deletion_requested_at", "is", null).order("deletion_requested_at").limit(10),
  ]);
  const o = (data ?? {}) as Partial<Overview>;

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-navy">Needs attention</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile icon={Building2} label="Societies to review" value={o.pending_societies ?? 0} href="/admin/approvals" alert={(o.pending_societies ?? 0) > 0} />
          <Tile icon={CalendarClock} label="Events to review" value={o.pending_events ?? 0} href="/admin/approvals" alert={(o.pending_events ?? 0) > 0} />
          <Tile icon={MessageSquareWarning} label="Open disputes" value={o.open_disputes ?? 0} href="/admin/orders" alert={(o.open_disputes ?? 0) > 0} />
          <Tile icon={AlertTriangle} label="Duplicate flags (pending)" value={o.duplicate_flags ?? 0} href="/admin/fraud" alert={(o.duplicate_flags ?? 0) > 0} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold text-navy">This week</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile icon={CalendarClock} label="Events" value={o.events_this_week ?? 0} />
          <Tile icon={Ticket} label="Tickets issued" value={o.tickets_this_week ?? 0} />
          <Tile icon={Wallet} label="Revenue (to societies)" value={formatPKR(o.revenue_this_week_paisa ?? 0)} />
          <Tile icon={Users} label="Users (total)" value={o.users ?? 0} href="/admin/users" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-navy">
              <MailWarning className="size-4" aria-hidden /> Failed emails ({o.failed_emails_7d ?? 0} in 7 days)
            </h2>
            <Link href="/admin/logs?tab=emails" className="text-sm text-brand-strong hover:underline">All</Link>
          </div>
          {failed?.length ? (
            <ul className="divide-y text-sm">
              {failed.map((f) => (
                <li key={f.id} className="py-2">
                  <span className="font-medium">{f.template}</span> → {f.to_email}
                  <div className="truncate text-xs text-muted-foreground">{formatShortDateTime(f.created_at)} · {f.error}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No failed emails.</p>
          )}
        </section>
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-navy">Recent admin activity</h2>
            <Link href="/admin/logs" className="text-sm text-brand-strong hover:underline">Audit log</Link>
          </div>
          <ul className="divide-y text-sm">
            {(audit ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-2">
                <span className="font-mono text-xs">{a.action}</span>
                <span className="text-xs text-muted-foreground">{formatShortDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {deletions?.length ? (
        <section className="rounded-2xl bg-white shadow-card ring-1 ring-navy/[0.06] p-4">
          <h2 className="mb-2 font-semibold text-navy">Account deletion requests (AUTH-08)</h2>
          <ul className="divide-y text-sm">
            {deletions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {d.full_name ?? "–"} · {d.email}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status="pending" label="Requested" /> {d.deletion_requested_at ? formatShortDateTime(d.deletion_requested_at) : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Process in the Supabase dashboard (Authentication → Users → Delete) after checking open orders.</p>
        </section>
      ) : null}
    </div>
  );
}

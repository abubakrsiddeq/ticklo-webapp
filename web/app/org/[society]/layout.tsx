import Link from "next/link";
import Image from "next/image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NavTabs } from "@/components/nav-tabs";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton } from "@/components/action-button";
import { requireOrgStaff } from "@/lib/auth";
import { resubmitOrganization } from "../_actions/org";

export default async function SocietyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ society: string }> }) {
  const { society } = await params;
  const { org, isOwner, viaAdmin } = await requireOrgStaff(society, `/org/${society}`);
  const base = `/org/${org.slug}`;
  const tabs = [
    { href: base, label: "Dashboard", match: [`${base}/events`] },
    ...(isOwner ? [{ href: `${base}/team`, label: "Team" }, { href: `${base}/payment-accounts`, label: "Payment accounts & reports" }] : []),
    { href: `${base}/settings`, label: "Society profile" },
    { href: `${base}/history`, label: "History" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06] sm:p-5">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl bg-navy">
          {org.logo_url ? (
            <Image src={org.logo_url} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-heading text-xl font-bold text-white">{org.name[0]}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-brand-strong uppercase">Organizer dashboard</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-heading text-xl font-bold text-navy sm:text-2xl">{org.name}</h1>
            <StatusBadge status={org.status} />
          </div>
        </div>
        {org.status === "approved" ? (
          <Link href={`/s/${org.slug}`} className="ml-auto hidden h-10 items-center rounded-full bg-secondary px-4 text-sm font-medium text-navy hover:bg-brand-soft hover:text-brand-strong sm:inline-flex">
            Public page →
          </Link>
        ) : null}
      </div>

      {viaAdmin ? (
        <Alert className="mb-4 border-blue-200 bg-blue-50">
          <AlertTitle>You are working in this society as TickLO admin</AlertTitle>
          <AlertDescription>
            You can change everything an owner can. Changes are saved under your name in the audit log.{" "}
            <Link href={`/admin/societies/${org.id}`} className="underline">
              Back to admin
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {org.status === "pending" ? (
        <Alert className="mb-4">
          <AlertTitle>Waiting for TickLO approval</AlertTitle>
          <AlertDescription>
            You can set up payment accounts, your team and draft events now. Events can be submitted once your society is approved.
          </AlertDescription>
        </Alert>
      ) : null}
      {org.status === "rejected" ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Society not approved</AlertTitle>
          <AlertDescription className="grid gap-2">
            <span>
              Reason: {org.review_note ?? "Not given"} ·{" "}
              <Link href={`${base}/history`} className="underline">
                See history
              </Link>
            </span>
            {isOwner ? (
              <span>
                Update your details in Society profile, then{" "}
                <ActionButton size="sm" variant="outline" action={resubmitOrganization.bind(null, org.slug)}>
                  Send for review again
                </ActionButton>
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {org.status === "suspended" ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Society suspended</AlertTitle>
          <AlertDescription>
            {org.suspended_reason ? `Reason: ${org.suspended_reason}. ` : ""}
            Ticket sales are stopped and nothing can be changed. Tickets already sold still work at the gate. Contact TickLO support.
          </AlertDescription>
        </Alert>
      ) : null}

      <NavTabs items={tabs} exact={[base]} />
      {children}
    </div>
  );
}

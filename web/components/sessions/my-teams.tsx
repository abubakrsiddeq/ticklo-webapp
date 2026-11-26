import Link from "next/link";
import { Trophy } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { formatDateTime, formatPKR } from "@/lib/format";
import { payTeam, withdrawTeam } from "@/app/me/tickets/team-actions";

export interface MyTeam {
  id: string;
  team_name: string;
  member_count: number;
  status: string;
  reject_reason: string | null;
  session_name: string;
  session_starts_at: string;
  event_name: string;
  event_slug: string;
  org_slug: string;
  order_id: string | null;
  order_status: string | null;
  hold_expires_at: string | null;
  fee_paisa: number | null;
  fee_mode: string;
}

function view(t: MyTeam, now: number): { text: string; tone: string; pay: boolean; withdraw: boolean; orderHref: string | null } {
  if (t.status === "pending") return { text: "Waiting for the organizer to accept your team", tone: "text-warning", pay: false, withdraw: true, orderHref: null };
  if (t.status === "rejected") return { text: `Not accepted${t.reject_reason ? `: ${t.reject_reason}` : ""}`, tone: "text-destructive", pay: false, withdraw: false, orderHref: null };
  if (t.status === "withdrawn") return { text: "Withdrawn", tone: "text-muted-foreground", pay: false, withdraw: false, orderHref: null };
  const holding = t.order_status === "awaiting_payment" && t.hold_expires_at && new Date(t.hold_expires_at).getTime() > now;
  if (t.order_status === "approved") return { text: "Registered ✓ – your entry pass is below", tone: "text-brand-strong", pay: false, withdraw: false, orderHref: `/checkout/${t.order_id}/status` };
  if (t.order_status === "under_review") return { text: "Payment sent – being checked", tone: "text-navy", pay: false, withdraw: false, orderHref: `/checkout/${t.order_id}/status` };
  if (t.order_status === "rejected") return { text: "Payment not approved – upload again", tone: "text-destructive", pay: false, withdraw: false, orderHref: `/checkout/${t.order_id}/status` };
  if (holding) return { text: "Accepted – pay to confirm your place", tone: "text-brand-strong", pay: false, withdraw: true, orderHref: `/checkout/${t.order_id}` };
  return { text: "Accepted – pay to confirm your place", tone: "text-brand-strong", pay: true, withdraw: true, orderHref: null };
}

/** FES-10/FES-11: the buyer's competition registrations on My tickets. */
export function MyTeams({ teams, now }: { teams: MyTeam[]; now: number }) {
  if (!teams.length) return null;
  return (
    <section id="teams" className="grid gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold text-navy">
        <Trophy className="size-5 text-brand-strong" aria-hidden /> My competitions
      </h2>
      <ul className="grid gap-3">
        {teams.map((t) => {
          const v = view(t, now);
          const fee = t.fee_paisa ? (t.fee_mode === "per_member" ? t.fee_paisa * t.member_count : t.fee_paisa) : 0;
          return (
            <li key={t.id} className="grid gap-2 rounded-2xl bg-white p-4 shadow-card ring-1 ring-navy/[0.06]">
              <div>
                <p className="font-semibold text-navy">
                  {t.team_name} · {t.session_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  <Link href={`/e/${t.org_slug}/${t.event_slug}`} className="hover:underline">
                    {t.event_name}
                  </Link>{" "}
                  · {formatDateTime(t.session_starts_at)} · {t.member_count} {t.member_count === 1 ? "member" : "members"} · {formatPKR(fee, { freeLabel: "Free" })}
                </p>
                <p className={`text-sm font-medium ${v.tone}`}>{v.text}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {v.pay ? (
                  <ActionButton variant="brand" size="sm" action={payTeam.bind(null, t.id)}>
                    {fee ? "Pay now" : "Confirm place"}
                  </ActionButton>
                ) : null}
                {v.orderHref ? (
                  <Link href={v.orderHref} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium text-navy hover:bg-secondary">
                    Open
                  </Link>
                ) : null}
                {v.withdraw ? (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    action={withdrawTeam.bind(null, t.id)}
                    confirm={{ title: `Withdraw ${t.team_name}?`, description: "Your place is given up.", confirmLabel: "Withdraw" }}
                  >
                    Withdraw
                  </ActionButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

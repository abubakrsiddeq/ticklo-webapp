import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errorCode } from "@/lib/errors";
import { formatDate, formatTime } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { serverNow } from "@/lib/time";
import { ambassadorPath, discountLabel, type DiscountType, type Milestone } from "@/lib/referrals";
import { SellTabs } from "../sell-tabs";
import { PromoteScreen, type PromoteData } from "./promote-screen";

export const metadata: Metadata = { title: "My ambassador page", robots: { index: false } };

interface Stats {
  me: {
    seller_id: string;
    name: string;
    ref_code: string;
    settled_at: string | null;
    clicks: number;
    pending_tickets: number;
    online_tickets: number;
    paper_sold: number;
    credited_tickets: number;
    credited_revenue_paisa: number;
    reward_paisa: number;
    paid_paisa: number;
    rank: number;
  };
  ambassadors: number;
  board: { rank: number; name: string; tickets: number; me: boolean }[];
  settings: {
    reward_type: DiscountType;
    reward_value: number;
    discount_type: DiscountType;
    discount_value: number;
    credit_on: "approved" | "checked_in";
    leaderboard: boolean;
    milestones: Milestone[];
  };
  payouts: { amount_paisa: number; note: string | null; created_at: string }[];
  event: { id: string; name: string; slug: string; starts_at: string; ends_at: string; status: string; poster_url: string | null; org_name: string; org_slug: string };
  has_printed: boolean;
}

/** AMB-05/AMB-06: the ambassador's own screen – link, code, QR, numbers, rank, milestones, rewards. */
export default async function PromotePage({ params }: { params: Promise<{ event: string }> }) {
  const { event: eventId } = await params;
  await requireUser(`/sell/${eventId}/promote`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) redirect("/sell");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_ambassador_stats", { p_event_id: eventId });
  if (error) {
    // organizers without a seller row land on the scanner; everybody else is not allowed
    if (errorCode(error) === "FORBIDDEN") redirect(`/sell/${eventId}`);
    throw error;
  }
  const s = data as unknown as Stats;
  const link = absoluteUrl(ambassadorPath(s.event.org_slug, s.event.slug, s.me.ref_code));
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const live = s.event.status === "published" && new Date(s.event.ends_at).getTime() > serverNow();

  const view: PromoteData = {
    eventId: s.event.id,
    eventName: s.event.name,
    orgName: s.event.org_name,
    when: `${formatDate(s.event.starts_at)} · ${formatTime(s.event.starts_at)} PKT`,
    live,
    closed: Boolean(s.me.settled_at),
    name: s.me.name,
    code: s.me.ref_code,
    link,
    qr,
    clicks: Number(s.me.clicks),
    pending: Number(s.me.pending_tickets),
    online: Number(s.me.online_tickets),
    paper: Number(s.me.paper_sold),
    credited: Number(s.me.credited_tickets),
    revenue: Number(s.me.credited_revenue_paisa),
    reward: Number(s.me.reward_paisa),
    paid: Number(s.me.paid_paisa),
    rank: Number(s.me.rank),
    ambassadors: s.ambassadors,
    board: s.settings.leaderboard ? s.board : null,
    rewardType: s.settings.reward_type,
    rewardValue: s.settings.reward_value,
    discount: discountLabel(s.settings.discount_type, s.settings.discount_value),
    creditOn: s.settings.credit_on,
    milestones: s.settings.milestones ?? [],
    payouts: (s.payouts ?? []).map((p) => ({ ...p, amount_paisa: Number(p.amount_paisa) })),
  };

  return (
    <>
      {s.has_printed && !view.closed ? <SellTabs eventId={eventId} active="promote" /> : null}
      <PromoteScreen data={view} />
    </>
  );
}

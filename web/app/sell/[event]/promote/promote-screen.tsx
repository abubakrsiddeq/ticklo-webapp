"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Gift, Lock, MessageCircle, QrCode, Share2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatPKR, formatShortDateTime } from "@/lib/format";
import { milestoneProgress, rewardDue, rewardLabel, shareMessage, whatsappShareUrl, type DiscountType, type Milestone } from "@/lib/referrals";
import { successFeedback } from "@/lib/scan/feedback";
import { cn } from "@/lib/utils";

export interface PromoteData {
  eventId: string;
  eventName: string;
  orgName: string;
  when: string;
  live: boolean;
  closed: boolean;
  name: string;
  code: string;
  link: string;
  qr: string;
  clicks: number;
  pending: number;
  online: number;
  paper: number;
  credited: number;
  revenue: number;
  reward: number;
  paid: number;
  rank: number;
  ambassadors: number;
  board: { rank: number; name: string; tickets: number; me: boolean }[] | null;
  rewardType: DiscountType;
  rewardValue: number;
  discount: string | null;
  creditOn: "approved" | "checked_in";
  milestones: Milestone[];
  payouts: { amount_paisa: number; note: string | null; created_at: string }[];
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-3 text-center", accent ? "bg-brand text-navy" : "bg-white/10")}>
      <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
      <p className={cn("text-xs", accent ? "text-navy/80" : "text-slate-300")}>{label}</p>
    </div>
  );
}

/** AMB-05: live numbers (refreshes every 30 s and cheers when a new ticket counts). */
export function PromoteScreen({ data: d }: { data: PromoteData }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const prev = useRef(d.credited);

  useEffect(() => {
    if (d.credited > prev.current) {
      const n = d.credited - prev.current;
      successFeedback();
      toast.success(`🎉 ${n} new ${n === 1 ? "ticket" : "tickets"} counted for you!`);
    }
    prev.current = d.credited;
  }, [d.credited]);

  const message = shareMessage({ eventName: d.eventName, when: d.when, url: d.link, code: d.code, discount: d.discount });
  const ms = milestoneProgress(d.milestones, d.credited);
  const due = rewardDue(d.reward, d.paid);
  const reward = rewardLabel(d.rewardType, d.rewardValue);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(d.link);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = d.link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  async function shareNative() {
    if (navigator.share) {
      try {
        await navigator.share({ title: d.eventName, text: message.replace(d.link, "").trim(), url: d.link });
        return;
      } catch {
        // cancelled – fall through to nothing
        return;
      }
    }
    window.open(whatsappShareUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pb-10">
      {d.live && !d.closed ? <AutoRefresh seconds={30} /> : null}
      <div>
        <p className="truncate font-semibold">{d.eventName}</p>
        <p className="text-xs text-slate-300">
          Ambassador: {d.name} · {d.orgName}
        </p>
      </div>

      {d.closed ? (
        <p className="flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-sm text-slate-200">
          <Lock className="size-4 shrink-0" aria-hidden /> The organizer closed your account – your link no longer brings new bookings.
        </p>
      ) : !d.live ? (
        <p className="rounded-2xl bg-white/10 p-3 text-sm text-slate-200">This event is over. Here are your final numbers.</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {d.board ? (
          <Stat value={d.credited ? `#${d.rank}` : "–"} label={`rank of ${d.ambassadors}`} accent />
        ) : (
          <Stat value={formatPKR(d.revenue)} label="you brought" accent />
        )}
        <Stat value={String(d.credited)} label={d.creditOn === "checked_in" ? "came in" : "tickets"} />
        <Stat value={String(d.clicks)} label="link opens" />
      </div>
      <p className="-mt-2 text-center text-xs text-slate-300">
        {d.online} online{d.paper ? ` · ${d.paper} paper` : ""}
        {d.pending ? ` · ${d.pending} waiting for payment check` : ""}
        {d.creditOn === "checked_in" ? " · counts when scanned at the gate" : ""}
      </p>

      {/* Share */}
      {d.live && !d.closed ? (
        <section className="grid gap-3 rounded-3xl bg-white p-4 text-navy">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your code</p>
              <p className="font-mono text-3xl font-bold tracking-wider">{d.code}</p>
            </div>
            {d.discount ? <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">Friends get {d.discount}</span> : null}
          </div>
          <Button asChild size="lg" className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
            <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Share on WhatsApp
            </a>
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={copyLink}>
              {copied ? <Check className="text-brand-strong" /> : <Copy />} {copied ? "Copied" : "Link"}
            </Button>
            <Button variant="outline" onClick={shareNative}>
              <Share2 /> Share
            </Button>
            <Button variant="outline" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
              <QrCode /> QR
            </Button>
          </div>
          {showQr ? (
            <div className="grid justify-items-center gap-2 pt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.qr} alt={`QR code for ${d.name}'s link`} className="size-56 rounded-xl ring-1 ring-navy/10" />
              <a href={d.qr} download={`ticklo-${d.code}.png`} className="text-sm font-medium text-brand-strong hover:underline">
                Download QR (for posters &amp; stalls)
              </a>
            </div>
          ) : null}
          <p className="truncate text-center font-mono text-xs text-muted-foreground">{d.link}</p>
        </section>
      ) : null}

      {/* Milestones */}
      {d.milestones.length ? (
        <section className="grid gap-2 rounded-3xl bg-white/10 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Gift className="size-4 text-brand-light" aria-hidden /> Rewards
          </p>
          {ms.next ? (
            <>
              <div className="h-3 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.round(ms.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next reward">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(4, ms.progress * 100)}%` }} />
              </div>
              <p className="text-sm text-slate-200">
                {ms.left} more {ms.left === 1 ? "ticket" : "tickets"} → <strong>{ms.next.reward}</strong>
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-200">All rewards unlocked – shabash! 🎉</p>
          )}
          <ul className="grid gap-1 text-sm">
            {d.milestones.map((m) => {
              const done = d.credited >= m.tickets;
              return (
                <li key={m.tickets} className={cn("flex items-center justify-between gap-2", done ? "text-brand-light" : "text-slate-300")}>
                  <span className="flex items-center gap-2">
                    {done ? <Check className="size-4" aria-hidden /> : <span className="size-4" aria-hidden />}
                    {m.reward}
                  </span>
                  <span className="tabular-nums">{m.tickets}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Money */}
      {reward || d.paid ? (
        <section className="grid gap-1 rounded-3xl bg-white/10 p-4 text-sm">
          <p className="mb-1 font-semibold">{reward ? `Reward: ${reward}` : "Rewards"}</p>
          <div className="flex justify-between">
            <span className="text-slate-300">Earned</span>
            <span className="font-semibold tabular-nums">{formatPKR(d.reward)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">Given by {d.orgName}</span>
            <span className="tabular-nums">{formatPKR(d.paid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">Still to get</span>
            <span className="font-semibold tabular-nums text-brand-light">{formatPKR(due)}</span>
          </div>
          {d.payouts.length ? (
            <ul className="mt-2 grid gap-1 border-t border-white/10 pt-2 text-xs text-slate-300">
              {d.payouts.map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {formatShortDateTime(p.created_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="tabular-nums">{p.amount_paisa ? formatPKR(p.amount_paisa) : "Gift"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-slate-400">The society gives rewards – TickLO only keeps the count.</p>
        </section>
      ) : null}

      {/* Leaderboard */}
      {d.board ? (
        <section className="grid gap-2 rounded-3xl bg-white/10 p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Trophy className="size-4 text-brand-light" aria-hidden /> Leaderboard
          </p>
          {d.board.length ? (
            <ol className="grid gap-1">
              {d.board.map((b) => (
                <li
                  key={`${b.rank}-${b.name}`}
                  className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm", b.me ? "bg-brand text-navy font-semibold" : "")}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 tabular-nums">{b.rank}.</span>
                    {b.name}
                    {b.me ? " (you)" : ""}
                  </span>
                  <span className="tabular-nums">{b.tickets}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-300">No tickets yet – be the first!</p>
          )}
        </section>
      ) : null}

      <section className="grid gap-1 text-xs text-slate-400">
        <p>How it counts: everyone who opens your link (it is remembered for 7 days) or types your code at checkout is yours.</p>
        <p>
          {d.creditOn === "checked_in"
            ? "A ticket counts when it is scanned at the gate."
            : "A ticket counts when the organizer approves the payment."}{" "}
          Your own bookings never count.
        </p>
      </section>
    </div>
  );
}

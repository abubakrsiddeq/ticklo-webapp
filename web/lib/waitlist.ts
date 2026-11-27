import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/emails/send";
import { absoluteUrl, eventPath } from "@/lib/site";
import { formatDateTime } from "@/lib/format";
import WaitlistOfferEmail from "@/emails/waitlist-offer";

/**
 * D-071: offer free places to the next people on waitlists (2-hour holds) and email them.
 * Called right after places open (cancel, withdraw, decline, payment rejected, more places)
 * and every few minutes by cron. Never throws – a failed run is retried by the next one.
 */
export async function runWaitlist(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data: ids, error } = await admin.rpc("waitlist_process");
    if (error) {
      console.error("waitlist_process failed", error.message);
      return 0;
    }
    const offered = (ids ?? []) as string[];
    if (!offered.length) return 0;
    const { data: rows } = await admin
      .from("waitlist_entries")
      .select(
        `id, offer_expires_at, ticket_type_id, session_id,
         profiles!waitlist_entries_user_id_fkey ( full_name, email ),
         ticket_types ( name ), event_sessions ( name, slug ),
         events!inner ( name, slug, organizations!inner ( slug ) )`,
      )
      .in("id", offered);
    for (const r of rows ?? []) {
      const to = r.profiles?.email;
      if (!to || !r.offer_expires_at) continue;
      const base = eventPath(r.events.organizations.slug, r.events.slug);
      const url = r.session_id
        ? absoluteUrl(`${base}/register/${r.session_id}`)
        : absoluteUrl(`${base}?ticket=${r.ticket_type_id}#tickets`);
      const target = r.event_sessions?.name ?? r.ticket_types?.name ?? r.events.name;
      await sendEmail({
        to,
        subject: `A place opened: ${target} – book by ${formatDateTime(r.offer_expires_at)}`,
        template: "waitlist-offer",
        related: { type: "waitlist", id: r.id },
        react: WaitlistOfferEmail({
          name: (r.profiles?.full_name ?? "there").split(" ")[0],
          target,
          eventName: r.events.name,
          until: formatDateTime(r.offer_expires_at),
          url,
        }),
      });
    }
    return offered.length;
  } catch (e) {
    console.error("runWaitlist failed", e);
    return 0;
  }
}

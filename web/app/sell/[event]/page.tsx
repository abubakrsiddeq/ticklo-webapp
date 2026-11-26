import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SellScreen } from "./sell-screen";
import { SellTabs } from "./sell-tabs";

export const metadata: Metadata = { title: "Sell printed tickets", robots: { index: false } };

export default async function SellEventPage({ params }: { params: Promise<{ event: string }> }) {
  const { event: eventId } = await params;
  const user = await requireUser(`/sell/${eventId}`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) redirect("/sell");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_sell_printed", { p_event_id: eventId, p_user_id: user.id });
  if (!allowed) redirect("/not-allowed");
  const [{ data: event }, { data: stock }, { data: sellEvents }, { data: me }] = await Promise.all([
    supabase.from("events").select("id, name").eq("id", eventId).maybeSingle(),
    supabase.rpc("my_print_stock", { p_event_id: eventId }),
    supabase.rpc("my_sell_events"),
    supabase.from("print_sellers").select("id").eq("event_id", eventId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!event) redirect("/sell");
  // D-043: no paper tickets for this event → the ambassador screen is all there is
  const hasPrinted = (sellEvents ?? []).some((e) => e.event_id === eventId && e.has_printed);
  if (!hasPrinted && me) redirect(`/sell/${eventId}/promote`);
  return (
    <>
      {me ? <SellTabs eventId={event.id} active="sell" /> : null}
      <SellScreen eventId={event.id} eventName={event.name} sellerName={user.profile.full_name ?? user.email} initialStock={stock ?? []} />
    </>
  );
}

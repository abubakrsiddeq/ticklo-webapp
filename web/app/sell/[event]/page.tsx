import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SellScreen } from "./sell-screen";

export const metadata: Metadata = { title: "Sell printed tickets", robots: { index: false } };

export default async function SellEventPage({ params }: { params: Promise<{ event: string }> }) {
  const { event: eventId } = await params;
  const user = await requireUser(`/sell/${eventId}`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) redirect("/sell");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_sell_printed", { p_event_id: eventId, p_user_id: user.id });
  if (!allowed) redirect("/not-allowed");
  const [{ data: event }, { data: stock }] = await Promise.all([
    supabase.from("events").select("id, name").eq("id", eventId).maybeSingle(),
    supabase.rpc("my_print_stock", { p_event_id: eventId }),
  ]);
  if (!event) redirect("/sell");
  return <SellScreen eventId={event.id} eventName={event.name} sellerName={user.profile.full_name ?? user.email} initialStock={stock ?? []} />;
}

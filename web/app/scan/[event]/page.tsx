import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Scan tickets", robots: { index: false } };

export default async function ScanEventPage({ params }: { params: Promise<{ event: string }> }) {
  const { event: eventId } = await params;
  const user = await requireUser(`/scan/${eventId}`);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) redirect("/scan");
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_scan_event", { p_event_id: eventId, p_user_id: user.id });
  if (!allowed) redirect("/not-allowed");
  const [{ data: event }, { data: hasPrinted }] = await Promise.all([
    supabase.from("events").select("id, name, venue, starts_at, ends_at").eq("id", eventId).maybeSingle(),
    supabase.rpc("event_has_printed", { p_event_id: eventId }),
  ]);
  if (!event) redirect("/scan");
  return <Scanner eventId={event.id} eventName={event.name} scannerName={user.profile.full_name ?? user.email} hasPrinted={Boolean(hasPrinted)} />;
}

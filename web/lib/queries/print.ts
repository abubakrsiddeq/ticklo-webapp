import "server-only";
import { createClient } from "@/lib/supabase/server";
import { serialLabel } from "@/lib/print/design";

/** PRT-10: printed batches of an event with their counts, plus places left per ticket type. */
export async function getPrintOverview(eventId: string) {
  const supabase = await createClient();
  const [{ data: batches }, { data: tickets }, { data: types }, { data: avail }] = await Promise.all([
    supabase
      .from("print_batches")
      .select("id, label, prefix, first_serial, quantity, created_at, download_count, last_downloaded_at, ticket_type_id, ticket_types!inner ( name, price_paisa )")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase.from("tickets").select("batch_id, status").eq("event_id", eventId).eq("source", "printed"),
    supabase.from("ticket_types").select("id, name, price_paisa, quantity, sort_order").eq("event_id", eventId).order("sort_order"),
    supabase.rpc("event_availability", { p_event_id: eventId }),
  ]);
  const counts = new Map<string, { valid: number; used: number; voided: number }>();
  for (const t of tickets ?? []) {
    if (!t.batch_id) continue;
    const c = counts.get(t.batch_id) ?? { valid: 0, used: 0, voided: 0 };
    if (t.status === "checked_in") c.used++;
    else if (t.status === "cancelled") c.voided++;
    else c.valid++;
    counts.set(t.batch_id, c);
  }
  const remaining = new Map((avail ?? []).map((a) => [a.ticket_type_id, a.remaining]));
  return {
    batches: (batches ?? []).map((b) => ({
      ...b,
      firstLabel: serialLabel(b.prefix, b.first_serial),
      lastLabel: serialLabel(b.prefix, b.first_serial + b.quantity - 1),
      counts: counts.get(b.id) ?? { valid: 0, used: 0, voided: 0 },
    })),
    types: (types ?? []).map((t) => ({ ...t, remaining: remaining.get(t.id) ?? 0 })),
  };
}

export type PrintOverview = Awaited<ReturnType<typeof getPrintOverview>>;

export async function getPrintBatch(eventId: string, batchId: string) {
  const supabase = await createClient();
  const [{ data: batch }, { data: tickets }] = await Promise.all([
    supabase
      .from("print_batches")
      .select("*, ticket_types!inner ( id, name, price_paisa, requires_student_card )")
      .eq("id", batchId)
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("tickets")
      .select("id, code, serial_no, status, holder_name, holder_phone, checked_in_at, checked_in_by, cancelled_at")
      .eq("batch_id", batchId)
      .order("serial_no"),
  ]);
  if (!batch) return null;
  const scannerIds = [...new Set((tickets ?? []).map((t) => t.checked_in_by).filter((x): x is string => Boolean(x)))];
  const { data: people } = scannerIds.length ? await supabase.from("profiles").select("id, full_name").in("id", scannerIds) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Team member"]));
  return {
    batch,
    tickets: (tickets ?? []).map((t) => ({
      ...t,
      serial: serialLabel(batch.prefix, t.serial_no ?? 0),
      buyer: t.holder_name === "Printed ticket" ? null : t.holder_name,
      checkedInByName: t.checked_in_by ? (names.get(t.checked_in_by) ?? "Team member") : null,
    })),
  };
}

export type PrintBatchDetail = NonNullable<Awaited<ReturnType<typeof getPrintBatch>>>;

/** The next serial number of an event (printed batches continue the numbering). */
export async function nextSerial(eventId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("serial_no")
    .eq("event_id", eventId)
    .not("serial_no", "is", null)
    .order("serial_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.serial_no ?? 0) + 1;
}

export async function listOrgTemplates(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ticket_templates")
    .select("id, name, category, design, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

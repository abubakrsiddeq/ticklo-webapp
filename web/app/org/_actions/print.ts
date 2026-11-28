"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { readUpload, uploadPublicImage } from "@/lib/storage";
import { optionalPhone, PHONE_HINT } from "@/lib/phone";
import { designProblems, designSchema, serialLabel, withoutTexts, type TicketDesign } from "@/lib/print/design";
import { ticketQrToken } from "@/lib/qr";
import type { Json } from "@/lib/database.types";
import { fetchAll } from "@/lib/queries/fetch-all";

// Printed tickets (PRT-02 .. PRT-08). Every write goes through a Postgres
// function that checks the organizer again; these actions add input checks
// and friendly errors.

const uuid = z.string().uuid();

async function staffContext(orgSlug: string) {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return null;
  return access;
}

function revalidatePrint(orgSlug: string) {
  revalidatePath(`/org/${orgSlug}`, "layout");
}

function checkDesign(design: unknown): { ok: true; design: z.infer<typeof designSchema> } | { ok: false; error: string } {
  const parsed = designSchema.safeParse(design);
  if (!parsed.success) return { ok: false, error: "The ticket design is damaged. Reload the editor and try again." };
  const problems = designProblems(parsed.data);
  if (problems.length) return { ok: false, error: problems[0].message };
  return { ok: true, design: parsed.data };
}

const batchSchema = z.object({
  eventId: uuid,
  ticketTypeId: uuid,
  quantity: z.coerce.number().int().min(1, "At least 1 ticket").max(2000, "At most 2000 tickets per batch"),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, "1–6 letters or numbers, e.g. QWL"),
  label: z.string().trim().max(80).optional(),
  templateKey: z.string().max(60).optional(),
  design: z.unknown(),
});

export async function createPrintBatch(orgSlug: string, input: z.input<typeof batchSchema>): Promise<ActionResult<{ batchId: string }>> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please check the form.", fieldErrors: fe };
  }
  const d = checkDesign(parsed.data.design);
  if (!d.ok) return { ok: false, error: d.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_print_batch", {
    p_event_id: parsed.data.eventId,
    p_ticket_type_id: parsed.data.ticketTypeId,
    p_quantity: parsed.data.quantity,
    p_prefix: parsed.data.prefix,
    p_design: d.design as unknown as Json,
    p_template_key: parsed.data.templateKey ?? null,
    p_label: parsed.data.label || null,
  });
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  const res = data as unknown as { batch_id: string };
  return ok({ batchId: res.batch_id });
}

export async function updatePrintBatchDesign(orgSlug: string, batchId: string, design: unknown): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(batchId).success) return { ok: false, error: "Not allowed." };
  const d = checkDesign(design);
  if (!d.ok) return { ok: false, error: d.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_print_batch_design", { p_batch_id: batchId, p_design: d.design as unknown as Json });
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  return ok(undefined, "Design saved. Download the PDF again to print the new version.");
}

const voidSchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
  reason: z.string().trim().min(3, "Please give a reason").max(300),
});

export async function voidPrintedTickets(orgSlug: string, batchId: string, form: FormData): Promise<ActionResult<{ voided: number }>> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(batchId).success) return { ok: false, error: "Not allowed." };
  const parsed = voidSchema.safeParse({ from: form.get("from"), to: form.get("to") || form.get("from"), reason: form.get("reason") });
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { ok: false, error: "Please check the form.", fieldErrors: fe };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_printed_tickets", {
    p_batch_id: batchId,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
    p_reason: parsed.data.reason,
  });
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  const n = Number(data ?? 0);
  return ok({ voided: n }, n === 1 ? "1 ticket voided." : `${n} tickets voided.`);
}

const buyerSchema = z.object({
  name: z.string().trim().max(80, "Name must be 80 characters or fewer"),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .refine((v) => optionalPhone(v) !== false, PHONE_HINT)
    .transform((v) => optionalPhone(v) || undefined),
});

export async function setPrintedTicketBuyer(orgSlug: string, ticketId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(ticketId).success) return { ok: false, error: "Not allowed." };
  const parsed = buyerSchema.safeParse({ name: form.get("name") ?? "", phone: form.get("phone") ?? undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the buyer's name and phone." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_printed_ticket_buyer", {
    p_ticket_id: ticketId,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || null,
  });
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  return ok(undefined, parsed.data.name ? "Buyer saved." : "Buyer removed.");
}

export interface PrintTicketData {
  serial: string;
  code: string;
  token: string;
}

/**
 * Signed QR tokens for the PDF (PRT-06). Voided tickets are left out. Every
 * call is counted and logged – a second download means more paper copies.
 */
export async function getPrintData(
  orgSlug: string,
  batchId: string,
  layout: string,
): Promise<ActionResult<{ tickets: PrintTicketData[]; design: unknown }>> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(batchId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const [{ data: batch }, { data: rows, error }] = await Promise.all([
    supabase.from("print_batches").select("id, prefix, design, events!inner ( org_id )").eq("id", batchId).maybeSingle(),
    fetchAll((from, to) =>
      supabase.from("tickets").select("id, code, serial_no, status").eq("batch_id", batchId).neq("status", "cancelled").order("serial_no").range(from, to),
    ),
  ]);
  if (error) return fail(error);
  if (!batch || batch.events.org_id !== access.org.id) return { ok: false, error: "Batch not found." };
  const tickets: PrintTicketData[] = [];
  for (const r of rows ?? []) {
    const token = ticketQrToken(r.id);
    if (!token) return { ok: false, error: "QR codes are not set up on the server (QR_SIGNING_SECRET). Contact TickLO support." };
    tickets.push({ serial: serialLabel(batch.prefix, r.serial_no ?? 0), code: r.code, token });
  }
  if (!tickets.length) return { ok: false, error: "All tickets of this batch are voided – nothing to print." };
  const { error: logError } = await supabase.rpc("record_print_download", { p_batch_id: batchId, p_layout: layout.slice(0, 40) });
  if (logError) return fail(logError);
  revalidatePrint(orgSlug);
  return ok({ tickets, design: batch.design });
}

const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(60),
  category: z.string().trim().min(1).max(30).default("custom"),
});

export async function saveTicketTemplate(orgSlug: string, input: { name: string; category?: string; design: unknown }): Promise<ActionResult<{ id: string }>> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the name." };
  const d = designSchema.safeParse(input.design);
  if (!d.success) return { ok: false, error: "The ticket design is damaged. Reload the editor and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_templates")
    .insert({ org_id: access.org.id, name: parsed.data.name, category: parsed.data.category, design: withoutTexts(d.data as TicketDesign) as unknown as Json, created_by: access.user!.id })
    .select("id")
    .single();
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  return ok({ id: data.id }, "Saved to My templates.");
}

export async function deleteTicketTemplate(orgSlug: string, templateId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(templateId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_templates").delete().eq("id", templateId).eq("org_id", access.org.id);
  if (error) return fail(error);
  revalidatePrint(orgSlug);
  return ok(undefined, "Template deleted.");
}

/** Image for the ticket editor (logo, sponsor, photo). Stored with the society's posters. */
export async function uploadTicketImage(orgSlug: string, form: FormData): Promise<ActionResult<{ url: string }>> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const file = await readUpload(form.get("file"), { label: "Image", required: true });
  if (file.error || !file.file) return { ok: false, error: file.error ?? "Choose an image." };
  try {
    const url = await uploadPublicImage("posters", `${access.org.id}/tickets`, file.file, 2400, { keepTransparency: true });
    return ok({ url });
  } catch (e) {
    return fail(e);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, friendlyError, type ActionResult } from "@/lib/errors";
import type { TablesUpdate } from "@/lib/database.types";
import { fromPKTInputValue, rupeesToPaisa } from "@/lib/format";
import type { Json } from "@/lib/database.types";
import { runWaitlist } from "@/lib/waitlist";
import { readUpload, uploadPublicImage } from "@/lib/storage";
import { avoidReserved, slugify, withSuffix } from "@/lib/slug";
import { fieldErrors, formToObject } from "@/lib/validation/common";
import { cancelEventSchema, eventSchema, ticketTypeSchema } from "@/lib/validation/event";
import { notifyEventCancelled } from "@/lib/emails/notify";
import { FESTIVAL_CAPACITY, FESTIVAL_MAX_PER_ORDER } from "@/lib/sessions";

const uuid = z.string().uuid();

async function staffContext(orgSlug: string) {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return null;
  return access;
}

async function eventOfOrg(orgId: string, eventId: string) {
  if (!uuid.safeParse(eventId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id, slug, status, org_id, name").eq("id", eventId).eq("org_id", orgId).maybeSingle();
  return data;
}

function revalidateEvent(orgSlug: string, eventSlug: string) {
  revalidatePath(`/org/${orgSlug}`, "layout");
  revalidatePath(`/e/${orgSlug}/${eventSlug}`);
  revalidatePath("/");
  revalidatePath("/events");
}

/** D-069: the ticket form sent by the event form (JSON). Postgres checks it again. */
function ticketFormFrom(form: FormData): Json | null {
  const raw = form.get("ticket_form");
  if (typeof raw !== "string" || raw.length > 60000) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

function eventFields(data: z.infer<typeof eventSchema>) {
  return {
    name: data.name,
    description: data.description || null,
    venue: data.venue,
    starts_at: fromPKTInputValue(data.starts_at)!,
    ends_at: fromPKTInputValue(data.ends_at)!,
    capacity: data.format === "festival" ? FESTIVAL_CAPACITY : Number(data.capacity),
    visibility: data.visibility,
    max_tickets_per_order: data.format === "festival" ? FESTIVAL_MAX_PER_ORDER : Number(data.max_tickets_per_order),
    format: data.format,
    attendee_names: data.format === "festival" ? "off" : (data.attendee_names ?? "off"),
    attendee_university: data.format === "festival" ? "off" : (data.attendee_university ?? "off"),
  };
}

/** ORG-04: create an event as a draft, then add ticket types on the edit page. */
export async function createEvent(orgSlug: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const parsed = eventSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  if (new Date(fromPKTInputValue(parsed.data.starts_at)!).getTime() < Date.now()) {
    return { ok: false, error: "The start time is in the past.", fieldErrors: { starts_at: "Choose a future date and time" } };
  }
  const poster = await readUpload(form.get("poster"), { label: "Poster" });
  if (poster.error) return { ok: false, error: poster.error, fieldErrors: { poster: poster.error } };

  let posterUrl: string | null = null;
  try {
    if (poster.file) posterUrl = await uploadPublicImage("posters", access.org.id, poster.file);
  } catch (e) {
    return fail(e);
  }

  const supabase = await createClient();
  let slug = avoidReserved(slugify(parsed.data.name, 70), 80);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase
      .from("events")
      .insert({ ...eventFields(parsed.data), org_id: access.org.id, slug, poster_url: posterUrl, created_by: access.user!.id })
      .select("id, slug")
      .single();
    if (!error && data) {
      const ticketForm = parsed.data.format === "festival" ? null : ticketFormFrom(form);
      if (ticketForm) {
        const { error: formError } = await supabase.rpc("set_ticket_form", { p_event_id: data.id, p_session_id: null, p_fields: ticketForm });
        if (formError) console.error("ticket form not saved", formError.message);
      }
      // Show all active accounts by default (ORG-02 – organizer can change it)
      const { data: accounts } = await supabase.from("payment_accounts").select("id").eq("org_id", access.org.id).eq("is_active", true);
      if (accounts?.length) {
        await supabase.from("event_payment_accounts").insert(accounts.map((a) => ({ event_id: data.id, payment_account_id: a.id })));
      }
      revalidatePath(`/org/${orgSlug}`, "layout");
      // FES-15: the next step depends on the kind of event
      const base = `/org/${orgSlug}/events/${data.slug}`;
      redirect(
        parsed.data.format === "festival"
          ? `${base}/schedule?created=1`
          : parsed.data.format === "competition"
            ? `${base}/schedule?created=1&add=competition`
            : `${base}/edit?created=1`,
      );
    }
    if (error?.code !== "23505") return fail(error);
    slug = withSuffix(slugify(parsed.data.name, 70), 80);
  }
  return { ok: false, error: "Could not create a unique link. Try a slightly different name." };
}

/** ORG-04 edit. Published events can be edited (no re-approval in v1 – see DECISIONS). */
export async function updateEvent(orgSlug: string, eventId: string, form: FormData): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.status === "cancelled") return { ok: false, error: "Cancelled events cannot be edited." };
  const parsed = eventSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const poster = await readUpload(form.get("poster"), { label: "Poster" });
  if (poster.error) return { ok: false, error: poster.error, fieldErrors: { poster: poster.error } };

  const update: TablesUpdate<"events"> = eventFields(parsed.data);
  const supabase = await createClient();
  if (parsed.data.format === "single") {
    const { count } = await supabase.from("event_sessions").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    if (count) return { ok: false, error: "This event has sessions. Delete them on the Schedule tab first, or keep it a festival.", fieldErrors: { format: "Has sessions" } };
  }
  try {
    if (poster.file) update.poster_url = await uploadPublicImage("posters", access.org.id, poster.file);
  } catch (e) {
    return fail(e);
  }
  if (form.get("remove_poster") === "on" && !poster.file) update.poster_url = null;

  const { error } = await supabase.from("events").update(update).eq("id", event.id);
  if (error) return fail(error);
  const ticketForm = parsed.data.format === "festival" ? null : ticketFormFrom(form);
  if (ticketForm) {
    const { error: formError } = await supabase.rpc("set_ticket_form", { p_event_id: event.id, p_session_id: null, p_fields: ticketForm });
    if (formError) return fail(formError, { ticket_form: "Check the details on each ticket" });
  }
  revalidateEvent(orgSlug, event.slug);
  return { ok: true, message: "Event saved." };
}

/** ORG-05: add or edit a ticket type. ORG-07 rules are enforced by a DB trigger. */
export async function saveTicketType(
  orgSlug: string,
  eventId: string,
  ticketTypeId: string | null,
  input: unknown,
  ticketAccess: { all: boolean; sessionIds: string[] } | null = null,
): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = ticketTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const row = {
    name: d.name,
    description: d.description || null,
    price_paisa: rupeesToPaisa(d.price),
    quantity: Number(d.quantity),
    sale_starts_at: fromPKTInputValue(d.sale_starts_at),
    sale_ends_at: fromPKTInputValue(d.sale_ends_at),
    requires_student_card: d.requires_student_card,
    early_price_paisa: d.early_price ? rupeesToPaisa(d.early_price) : null,
    early_until: d.early_price ? fromPKTInputValue(d.early_until) : null,
  };
  const supabase = await createClient();
  let id = ticketTypeId;
  if (ticketTypeId) {
    if (!uuid.safeParse(ticketTypeId).success) return { ok: false, error: "Ticket type not found." };
    const { error } = await supabase.from("ticket_types").update(row).eq("id", ticketTypeId).eq("event_id", event.id);
    if (error) return fail(error);
  } else {
    const { count } = await supabase.from("ticket_types").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    const { data: created, error } = await supabase.from("ticket_types").insert({ ...row, event_id: event.id, sort_order: (count ?? 0) + 1 }).select("id").single();
    if (error || !created) return fail(error);
    id = created.id;
  }
  // FES-15: what the ticket opens (festivals), set in the same form
  if (ticketAccess && id) {
    const { error } = await supabase.rpc("set_ticket_type_access", {
      p_ticket_type_id: id,
      p_all: ticketAccess.all,
      p_session_ids: ticketAccess.sessionIds.filter((x) => uuid.safeParse(x).success),
    });
    if (error) {
      revalidateEvent(orgSlug, event.slug);
      return { ok: false, error: `Ticket saved, but what it opens was not: ${friendlyError(error)}` };
    }
  }
  revalidateEvent(orgSlug, event.slug);
  await runWaitlist(); // D-071: more tickets may have been added
  return { ok: true, message: "Ticket type saved." };
}

export async function deleteTicketType(orgSlug: string, eventId: string, ticketTypeId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event || !uuid.safeParse(ticketTypeId).success) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_types").delete().eq("id", ticketTypeId).eq("event_id", event.id);
  if (error) return fail(error);
  revalidateEvent(orgSlug, event.slug);
  return { ok: true, message: "Ticket type deleted." };
}

/** ORG-02: choose which of the society's accounts are shown for this event. */
export async function setEventAccounts(orgSlug: string, eventId: string, accountIds: string[]): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const ids = accountIds.filter((id) => uuid.safeParse(id).success);
  const supabase = await createClient();
  const { data: current } = await supabase.from("event_payment_accounts").select("payment_account_id").eq("event_id", event.id);
  const have = new Set((current ?? []).map((c) => c.payment_account_id));
  const want = new Set(ids);
  const toAdd = ids.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  if (toAdd.length) {
    const { error } = await supabase.from("event_payment_accounts").insert(toAdd.map((id) => ({ event_id: event.id, payment_account_id: id })));
    if (error) return fail(error);
  }
  if (toRemove.length) {
    const { error } = await supabase.from("event_payment_accounts").delete().eq("event_id", event.id).in("payment_account_id", toRemove);
    if (error) return fail(error);
  }
  revalidateEvent(orgSlug, event.slug);
  return { ok: true, message: "Payment accounts updated." };
}

/** ORG-06: send for admin approval. */
export async function submitEvent(orgSlug: string, eventId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_event", { p_event_id: event.id });
  if (error) return fail(error);
  revalidateEvent(orgSlug, event.slug);
  return { ok: true, message: "Submitted! TickLO will review your event soon." };
}

/** ORG-11 / EVT-06 / EML-05 */
export async function cancelEvent(orgSlug: string, eventId: string, input: unknown): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const parsed = cancelEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_event", { p_event_id: event.id, p_reason: parsed.data.reason });
  if (error) return fail(error);
  const result = data as { recipients: { email: string; name: string }[] };
  await notifyEventCancelled(event.id, result.recipients ?? [], parsed.data.reason);
  revalidateEvent(orgSlug, event.slug);
  return { ok: true, message: `Event cancelled. ${result.recipients?.length ?? 0} ticket holder(s) emailed.` };
}

/** Drafts / rejected events without bookings can be deleted. */
export async function deleteDraftEvent(orgSlug: string, eventId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  const event = await eventOfOrg(access.org.id, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (!["draft", "rejected"].includes(event.status)) return { ok: false, error: "Only drafts can be deleted." };
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", event.id);
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  redirect(`/org/${orgSlug}?deleted=1`);
}

/** ORG-14 (Could): copy an event with its ticket types into a new draft. */
export async function duplicateEvent(orgSlug: string, eventId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access) return { ok: false, error: "Not allowed." };
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const supabase = await createClient();
  const { data: src } = await supabase.from("events").select("*").eq("id", eventId).eq("org_id", access.org.id).maybeSingle();
  if (!src) return { ok: false, error: "Event not found." };
  const { data: types } = await supabase.from("ticket_types").select("*").eq("event_id", src.id).order("sort_order");
  const { data: accounts } = await supabase.from("event_payment_accounts").select("payment_account_id").eq("event_id", src.id);

  // Same times one week later, shown as a draft for the organizer to adjust.
  const week = 7 * 24 * 3600 * 1000;
  const start = Math.max(new Date(src.starts_at).getTime(), Date.now()) + week;
  const duration = new Date(src.ends_at).getTime() - new Date(src.starts_at).getTime();
  const { data: copy, error } = await supabase
    .from("events")
    .insert({
      org_id: access.org.id,
      slug: withSuffix(slugify(`${src.name} copy`, 70), 80),
      name: `${src.name} (copy)`.slice(0, 150),
      description: src.description,
      poster_url: src.poster_url,
      venue: src.venue,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + duration).toISOString(),
      capacity: src.capacity,
      visibility: src.visibility,
      max_tickets_per_order: src.max_tickets_per_order,
      format: src.format,
      attendee_names: src.attendee_names,
      attendee_university: src.attendee_university,
      created_by: access.user!.id,
    })
    .select("id, slug")
    .single();
  if (error || !copy) return fail(error);
  if (types?.length) {
    const { error: tErr } = await supabase.from("ticket_types").insert(
      types.map((t) => ({
        event_id: copy.id,
        name: t.name,
        description: t.description,
        price_paisa: t.price_paisa,
        quantity: t.quantity,
        requires_student_card: t.requires_student_card,
        sort_order: t.sort_order,
      })),
    );
    if (tErr) return fail(tErr);
  }
  if (accounts?.length) {
    await supabase.from("event_payment_accounts").insert(accounts.map((a) => ({ event_id: copy.id, payment_account_id: a.payment_account_id })));
  }
  // D-044: copy the schedule (same offset from the start) and what each ticket opens
  const { error: sErr } = await supabase.rpc("duplicate_event_sessions", { p_from_event: src.id, p_to_event: copy.id });
  if (sErr) console.error("duplicate sessions failed", sErr.message);
  revalidatePath(`/org/${orgSlug}`, "layout");
  redirect(`/org/${orgSlug}/events/${copy.slug}/edit?duplicated=1`);
}

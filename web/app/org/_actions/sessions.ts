"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { fromPKTInputValue, rupeesToPaisa } from "@/lib/format";
import type { Json } from "@/lib/database.types";

// Festival sessions (D-044). Every write is a Postgres function that checks the
// organizer again; these actions only parse forms.

const uuid = z.string().uuid();

async function staffContext(orgSlug: string) {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return null;
  return access;
}

const refresh = (orgSlug: string) => revalidatePath(`/org/${orgSlug}`, "layout");

export interface SessionFormValues {
  name: string;
  kind: string;
  description: string;
  venue: string;
  starts_at: string; // datetime-local in PKT
  ends_at: string;
  capacity: string;
  pass_access: boolean;
  questions: { label: string; type: string; options: string[]; required: boolean }[];
  team_min: string;
  team_max: string;
  fee_mode: string;
  fee: string; // rupees
  needs_approval: boolean;
  registration_ends_at: string;
}

export async function saveSession(orgSlug: string, eventId: string, sessionId: string | null, v: SessionFormValues): Promise<ActionResult<{ id: string }>> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success) return { ok: false, error: "Not allowed." };
  if (sessionId && !uuid.safeParse(sessionId).success) return { ok: false, error: "Session not found." };
  const errs: Record<string, string> = {};
  const starts = fromPKTInputValue(v.starts_at);
  const ends = fromPKTInputValue(v.ends_at);
  if (!v.name.trim()) errs.name = "Required";
  if (!starts) errs.starts_at = "Choose the start";
  if (!ends) errs.ends_at = "Choose the end";
  if (starts && ends && ends <= starts) errs.ends_at = "Must be after the start";
  const capacity = v.capacity.trim();
  if (capacity && !/^\d{1,6}$/.test(capacity)) errs.capacity = "Whole number";
  const competition = v.kind === "competition";
  if (competition && !capacity) errs.capacity = "How many teams?";
  const fee = competition ? rupeesToPaisa(v.fee.trim() || "0") : 0;
  if (competition && !Number.isFinite(fee)) errs.fee = "Rupees";
  const regEnds = v.registration_ends_at ? fromPKTInputValue(v.registration_ends_at) : null;
  if (v.registration_ends_at && !regEnds) errs.registration_ends_at = "Check the date";
  if (Object.keys(errs).length) return { ok: false, error: "Please check the form.", fieldErrors: errs };

  const data = {
    name: v.name.trim(),
    kind: v.kind,
    description: v.description,
    venue: v.venue,
    starts_at: starts,
    ends_at: ends,
    capacity: capacity || null,
    pass_access: competition ? false : v.pass_access,
    questions: v.questions
      .filter((q) => q.label.trim())
      .map((q) => ({ label: q.label.trim(), type: q.type, options: q.type === "select" ? q.options.map((o) => o.trim()).filter(Boolean) : [], required: q.required })),
    team_min: competition ? v.team_min || "1" : "1",
    team_max: competition ? v.team_max || v.team_min || "1" : "1",
    fee_mode: v.fee_mode === "per_member" ? "per_member" : "per_team",
    fee_paisa: fee,
    needs_approval: competition && v.needs_approval,
    registration_ends_at: regEnds,
  };
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_session", {
    p_event_id: eventId,
    p_session_id: sessionId,
    p_data: data as unknown as Json,
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok({ id: String(id) }, sessionId ? "Session saved." : "Session added.");
}

export async function deleteSession(orgSlug: string, sessionId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sessionId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_session", { p_session_id: sessionId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Session deleted.");
}

export async function setTicketTypeAccess(orgSlug: string, ticketTypeId: string, all: boolean, sessionIds: string[]): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(ticketTypeId).success) return { ok: false, error: "Not allowed." };
  const ids = sessionIds.filter((s) => uuid.safeParse(s).success);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ticket_type_access", { p_ticket_type_id: ticketTypeId, p_all: all, p_session_ids: ids });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Access saved.");
}

export async function addSessionManager(orgSlug: string, sessionId: string, userId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sessionId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_session_manager", { p_session_id: sessionId, p_user_id: userId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Manager added.");
}

export async function removeSessionManager(orgSlug: string, sessionId: string, userId: string): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(sessionId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_session_manager", { p_session_id: sessionId, p_user_id: userId });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, "Manager removed.");
}

export async function setScannerSessions(orgSlug: string, eventId: string, userId: string, sessionIds: string[]): Promise<ActionResult> {
  const access = await staffContext(orgSlug);
  if (!access || !uuid.safeParse(eventId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not allowed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_scanner_sessions", {
    p_event_id: eventId,
    p_user_id: userId,
    p_session_ids: sessionIds.filter((s) => uuid.safeParse(s).success),
  });
  if (error) return fail(error);
  refresh(orgSlug);
  return ok(undefined, sessionIds.length ? "Scanner limited to the chosen sessions." : "Scanner can scan the whole event.");
}

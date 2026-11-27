import "server-only";
import { asQuestions } from "@/lib/sessions";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { serverNow } from "@/lib/time";

export interface SessionResult {
  place: number;
  label: string;
  name: string;
  registration_id?: string;
}

const EVENT_CARD_SELECT = `
  id, slug, name, poster_url, venue, starts_at, ends_at, status, visibility, format,
  organizations!inner ( id, slug, name, logo_url, university_id, universities ( id, name, short_name, city ) ),
  ticket_types ( price_paisa )
` as const;

/** Remove characters that have meaning in PostgREST filters. */
function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface EventListFilters {
  q?: string;
  universityId?: string;
  past?: boolean;
  limit?: number;
  offset?: number;
  /** D-070: only festivals / competition events */
  format?: "festival" | "competition";
}

/** EVT-01/EVT-02/EVT-09: public, published events; soonest first (or most recent past). */
export async function listPublicEvents(filters: EventListFilters = {}) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const limit = filters.limit ?? 24;
  const offset = filters.offset ?? 0;
  let query = supabase
    .from("events")
    .select(EVENT_CARD_SELECT, { count: "exact" })
    .in("status", ["published", "cancelled"])
    .eq("visibility", "public")
    .eq("organizations.status", "approved");

  query = filters.past
    ? query.lt("ends_at", nowIso).order("starts_at", { ascending: false })
    : query.gte("ends_at", nowIso).order("starts_at", { ascending: true });

  const q = cleanSearch(filters.q);
  if (q) query = query.ilike("name", `%${q}%`);
  if (filters.universityId) query = query.eq("organizations.university_id", filters.universityId);
  if (filters.format) query = query.eq("format", filters.format);

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) console.error("listPublicEvents", error.message);
  return { events: data ?? [], total: count ?? 0 };
}

export type EventCardData = Awaited<ReturnType<typeof listPublicEvents>>["events"][number];

/**
 * D-070: sessions inside festivals that their organizer lists on the Events page
 * (upcoming, public, approved societies). Search also matches the festival's name.
 */
export async function listPublicSessions(filters: { q?: string; universityId?: string; kinds?: string[]; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("event_sessions")
    .select(
      `id, slug, name, kind, starts_at, ends_at, venue, poster_url,
       events!inner ( slug, name, poster_url, venue, status, visibility, format,
         organizations!inner ( slug, name, status, university_id, universities ( short_name, name ) ) )`,
    )
    .eq("listed", true)
    .eq("events.status", "published")
    .eq("events.visibility", "public")
    .eq("events.organizations.status", "approved")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(filters.limit ?? 12);
  if (filters.kinds?.length) query = query.in("kind", filters.kinds);
  const q = cleanSearch(filters.q);
  if (q) query = query.ilike("name", `%${q}%`);
  if (filters.universityId) query = query.eq("events.organizations.university_id", filters.universityId);
  const { data, error } = await query;
  if (error) console.error("listPublicSessions", error.message);
  return data ?? [];
}

export type SessionCardData = Awaited<ReturnType<typeof listPublicSessions>>[number];

/** Approved universities only (public lists and filters). */
export const listUniversities = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("universities").select("id, name, short_name, city").eq("status", "approved").order("name");
  return data ?? [];
});

/**
 * Choices for profile/society forms (D-057): approved universities plus any pending
 * request this user can see (their own, or the one their society is linked to).
 */
export const listUniversityChoices = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("universities").select("id, name, short_name, city, status").order("name");
  return data ?? [];
});

export interface SocietyListFilters {
  q?: string;
  universityId?: string;
  active?: boolean; // only societies with upcoming public events
  limit?: number;
  offset?: number;
}

/** Societies directory (D-046): approved societies, with their upcoming public events count. */
export async function listPublicSocieties(filters: SocietyListFilters = {}) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const limit = filters.limit ?? 24;
  const offset = filters.offset ?? 0;
  let query = supabase
    .from("organizations")
    .select(
      `id, slug, name, logo_url, about, type, universities ( name, short_name, city ),
       upcoming:events${filters.active ? "!inner" : ""} ( id )`,
      { count: "exact" },
    )
    .eq("status", "approved")
    .in("upcoming.status", ["published"])
    .eq("upcoming.visibility", "public")
    .gte("upcoming.ends_at", nowIso)
    .order("name", { ascending: true });
  const q = cleanSearch(filters.q);
  if (q) query = query.ilike("name", `%${q}%`);
  if (filters.universityId) query = query.eq("university_id", filters.universityId);
  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) console.error("listPublicSocieties", error.message);
  return {
    societies: (data ?? []).map(({ upcoming, ...o }) => ({ ...o, upcomingCount: Array.isArray(upcoming) ? upcoming.length : 0 })),
    total: count ?? 0,
  };
}

export type SocietyCardData = Awaited<ReturnType<typeof listPublicSocieties>>["societies"][number];

/** EVT-03: everything the public event page needs. Works for link-only events too. */
export const getEventPage = cache(async (orgSlug: string, eventSlug: string) => {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, name, logo_url, about, status, universities ( name, short_name, city )")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) return null;
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("org_id", org.id)
    .eq("slug", eventSlug)
    .maybeSingle();
  if (!event) return null;
  const [{ data: types }, { data: availability }, { data: sessions }, { data: access }] = await Promise.all([
    supabase.from("ticket_types").select("*").eq("event_id", event.id).order("sort_order").order("created_at"),
    supabase.rpc("event_availability", { p_event_id: event.id }),
    supabase.rpc("event_schedule", { p_event_id: event.id }),
    supabase.from("ticket_type_sessions").select("ticket_type_id, session_id, ticket_types!inner ( event_id )").eq("ticket_types.event_id", event.id),
  ]);
  const remaining = new Map((availability ?? []).map((a) => [a.ticket_type_id, a.remaining]));
  return {
    org,
    event,
    ticketTypes: (types ?? []).map((t) => ({
      ...t,
      remaining: remaining.get(t.id) ?? 0,
      session_ids: (access ?? []).filter((a) => a.ticket_type_id === t.id).map((a) => a.session_id),
    })),
    // D-044: festival sessions (empty for a simple event)
    sessions: (sessions ?? []).map((x) => ({
      ...x,
      questions: asQuestions(x.questions),
      results: (Array.isArray(x.results) ? x.results : []) as unknown as SessionResult[],
    })),
  };
});

/** EVT-07: society page with upcoming and past public events. */
export const getSocietyPage = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, slug, name, logo_url, about, type, social_links, status, universities ( name, short_name, city )")
    .eq("slug", slug)
    .maybeSingle();
  if (!org || org.status !== "approved") return null;
  const { data: events } = await supabase
    .from("events")
    .select(EVENT_CARD_SELECT)
    .eq("org_id", org.id)
    .in("status", ["published", "cancelled"])
    .eq("visibility", "public")
    .order("starts_at", { ascending: true });
  const now = serverNow();
  const all = events ?? [];
  return {
    org,
    upcoming: all.filter((e) => new Date(e.ends_at).getTime() >= now),
    past: all.filter((e) => new Date(e.ends_at).getTime() < now).reverse(),
  };
});

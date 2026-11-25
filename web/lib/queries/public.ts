import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { serverNow } from "@/lib/time";

const EVENT_CARD_SELECT = `
  id, slug, name, poster_url, venue, starts_at, ends_at, status, visibility,
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

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) console.error("listPublicEvents", error.message);
  return { events: data ?? [], total: count ?? 0 };
}

export type EventCardData = Awaited<ReturnType<typeof listPublicEvents>>["events"][number];

export const listUniversities = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("universities").select("id, name, short_name, city").order("name");
  return data ?? [];
});

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
  const [{ data: types }, { data: availability }] = await Promise.all([
    supabase.from("ticket_types").select("*").eq("event_id", event.id).order("sort_order").order("created_at"),
    supabase.rpc("event_availability", { p_event_id: event.id }),
  ]);
  const remaining = new Map((availability ?? []).map((a) => [a.ticket_type_id, a.remaining]));
  return {
    org,
    event,
    ticketTypes: (types ?? []).map((t) => ({ ...t, remaining: remaining.get(t.id) ?? 0 })),
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

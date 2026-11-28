import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Enums, Tables } from "@/lib/database.types";

// Data Access Layer: every protected page and action checks access on the
// server through these helpers (doc: "har page server pe check karega").

export type Profile = Tables<"profiles">;
export type OrgRole = Enums<"org_role">;

export interface CurrentUser {
  id: string;
  email: string;
  profile: Profile;
}

/**
 * Who is signed in, from the session cookie. The JWT is verified locally with
 * the project's public signing key (ES256 / JWKS, cached in memory), so this
 * costs no network round trip – the Supabase project is far away (D-038).
 * proxy.ts refreshes an expired token before the page renders.
 */
export const getSession = cache(async (): Promise<{ id: string; email: string } | null> => {
  await cookies(); // always per-request, even when env vars are missing at build time
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  return { id: sub, email: typeof data.claims.email === "string" ? data.claims.email : "" };
});

/** The signed-in user with profile, or null. Cached for one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.id).maybeSingle();
  if (!profile) return null;
  return { id: session.id, email: session.email || profile.email || "", profile };
});

const loginUrl = (next: string) => `/login?next=${encodeURIComponent(next)}`;

/** Redirects to /login (and back to `next` afterwards – AUTH-07). */
export async function requireUser(next: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginUrl(next));
  if (user.profile.is_suspended) redirect("/auth/signout?reason=suspended");
  return user;
}

export async function requireAdmin(next = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(next);
  if (!user.profile.is_admin) redirect("/not-allowed");
  return user;
}

export interface OrgAccess {
  org: Tables<"organizations">;
  role: OrgRole | null;
  user: CurrentUser | null;
  /** D-084: a TickLO admin working in a society they do not own (acts as owner). */
  viaAdmin: boolean;
}

export const getOrgAccess = cache(async (slug: string): Promise<OrgAccess | null> => {
  const supabase = await createClient();
  const session = await getSession();
  // Society, profile and membership in parallel (one round trip instead of three).
  const [{ data: org }, user, membership] = await Promise.all([
    supabase.from("organizations").select("*").eq("slug", slug).maybeSingle(),
    session ? getCurrentUser() : Promise.resolve(null),
    session
      ? supabase
          .from("organization_members")
          .select("role, organizations!inner ( slug )")
          .eq("user_id", session.id)
          .eq("organizations.slug", slug)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);
  if (!org) return null;
  if (!user) return { org, role: null, user: null, viaAdmin: false };
  // D-084: admins act as owner of every society that is not deleted (the
  // database does the same in org_role_of). A deleted society has no members.
  if (org.deleted_at) return { org, role: null, user, viaAdmin: false };
  const isAdmin = user.profile.is_admin && !user.profile.is_suspended;
  const real = membership?.role ?? null;
  if (isAdmin) return { org, role: "owner", user, viaAdmin: real !== "owner" };
  return { org, role: real, user, viaAdmin: false };
});

/** Organizer (owner or member) of the society. */
export async function requireOrgStaff(slug: string, next: string) {
  const user = await requireUser(next);
  const access = await getOrgAccess(slug);
  if (!access) notFound();
  if (access.org.deleted_at && user.profile.is_admin) redirect(`/admin/societies/${access.org.id}`);
  if (access.role !== "owner" && access.role !== "member") redirect("/not-allowed");
  return { user, org: access.org, role: access.role, isOwner: access.role === "owner", viaAdmin: access.viaAdmin };
}

/** Owner only: team and payment accounts (Users & roles table). */
export async function requireOrgOwner(slug: string, next: string) {
  const ctx = await requireOrgStaff(slug, next);
  if (!ctx.isOwner) redirect("/not-allowed");
  return ctx;
}

/** An event of the society by slug (any status, organizers only). */
export async function requireOrgEvent(orgSlug: string, eventSlug: string, next: string) {
  const supabase = await createClient();
  // The event query runs alongside the access check; RLS hides it from non-organizers anyway.
  const [ctx, { data: row }] = await Promise.all([
    requireOrgStaff(orgSlug, next),
    supabase.from("events").select("*, organizations!inner ( slug )").eq("organizations.slug", orgSlug).eq("slug", eventSlug).maybeSingle(),
  ]);
  if (!row || row.org_id !== ctx.org.id) notFound();
  const { organizations: _org, ...event } = row;
  void _org;
  return { ...ctx, event };
}

import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
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

/** The signed-in user with profile, or null. Cached for one request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { id: user.id, email: user.email ?? profile.email ?? "", profile };
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
}

export const getOrgAccess = cache(async (slug: string): Promise<OrgAccess | null> => {
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("*").eq("slug", slug).maybeSingle();
  if (!org) return null;
  const user = await getCurrentUser();
  if (!user) return { org, role: null, user: null };
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  return { org, role: membership?.role ?? null, user };
});

/** Organizer (owner or member) of the society. */
export async function requireOrgStaff(slug: string, next: string) {
  const user = await requireUser(next);
  const access = await getOrgAccess(slug);
  if (!access) notFound();
  if (access.role !== "owner" && access.role !== "member") redirect("/not-allowed");
  return { user, org: access.org, role: access.role, isOwner: access.role === "owner" };
}

/** Owner only: team and payment accounts (Users & roles table). */
export async function requireOrgOwner(slug: string, next: string) {
  const ctx = await requireOrgStaff(slug, next);
  if (!ctx.isOwner) redirect("/not-allowed");
  return ctx;
}

/** An event of the society by slug (any status, organizers only). */
export async function requireOrgEvent(orgSlug: string, eventSlug: string, next: string) {
  const ctx = await requireOrgStaff(orgSlug, next);
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("slug", eventSlug)
    .maybeSingle();
  if (!event) notFound();
  return { ...ctx, event };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getOrgAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { errorCode, fail, type ActionResult } from "@/lib/errors";
import type { TablesUpdate } from "@/lib/database.types";
import { readUpload, uploadPrivate, uploadPublicImage } from "@/lib/storage";
import { avoidReserved, slugify, withSuffix } from "@/lib/slug";
import { fieldErrors, formToObject } from "@/lib/validation/common";
import { orgSchema, socialLinksFrom } from "@/lib/validation/org";

/** ORG-01: register a society (pending until an admin approves). */
export async function createOrganization(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const parsed = orgSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };

  const logo = await readUpload(form.get("logo"), { label: "Logo" });
  const proof = await readUpload(form.get("proof"), { label: "Proof document", required: true, allowPdf: true });
  const errs: Record<string, string> = {};
  if (logo.error) errs.logo = logo.error;
  if (proof.error) errs.proof = proof.error;
  if (Object.keys(errs).length) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: errs };

  let logoUrl: string | null = null;
  let proofPath: string | null = null;
  try {
    if (logo.file) logoUrl = await uploadPublicImage("logos", user.id, logo.file, 600);
    if (proof.file) proofPath = await uploadPrivate("org-proofs", user.id, proof.file);
  } catch (e) {
    return fail(e);
  }

  const supabase = await createClient();
  let slug = avoidReserved(slugify(parsed.data.name));
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_slug: slug,
      p_university_id: parsed.data.university_id || null,
      p_type: parsed.data.type,
      p_about: parsed.data.about,
      p_logo_url: logoUrl,
      p_social_links: socialLinksFrom(parsed.data),
      p_proof_path: proofPath,
    });
    if (!error) {
      revalidatePath("/", "layout");
      redirect(`/org/${slug}?created=1`);
    }
    if (errorCode(error) !== "SLUG_TAKEN") return fail(error);
    slug = withSuffix(slugify(parsed.data.name));
  }
  return { ok: false, error: "Could not create a unique link for this name. Try a slightly different name." };
}

/** Organizers (owner/member) can edit the society profile. */
export async function updateOrganization(orgSlug: string, form: FormData): Promise<ActionResult> {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || (access.role !== "owner" && access.role !== "member")) return { ok: false, error: "Not allowed." };
  const parsed = orgSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };

  const logo = await readUpload(form.get("logo"), { label: "Logo" });
  const proof = await readUpload(form.get("proof"), { label: "Proof document", allowPdf: true });
  if (logo.error || proof.error) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { ...(logo.error ? { logo: logo.error } : {}), ...(proof.error ? { proof: proof.error } : {}) } };
  }
  const update: TablesUpdate<"organizations"> = {
    name: parsed.data.name,
    university_id: parsed.data.university_id || null,
    type: parsed.data.type,
    about: parsed.data.about || null,
    social_links: socialLinksFrom(parsed.data),
  };
  try {
    if (logo.file) update.logo_url = await uploadPublicImage("logos", access.org.id, logo.file, 600);
    if (proof.file) update.proof_path = await uploadPrivate("org-proofs", access.user.id, proof.file);
  } catch (e) {
    return fail(e);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(update).eq("id", access.org.id);
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  revalidatePath(`/s/${orgSlug}`);
  return { ok: true, message: "Society details saved." };
}

export async function resubmitOrganization(orgSlug: string): Promise<ActionResult> {
  const access = await getOrgAccess(orgSlug);
  if (!access?.user || access.role !== "owner") return { ok: false, error: "Only the owner can resubmit." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_organization", { p_org_id: access.org.id });
  if (error) return fail(error);
  revalidatePath(`/org/${orgSlug}`, "layout");
  return { ok: true, message: "Sent to TickLO for review again." };
}

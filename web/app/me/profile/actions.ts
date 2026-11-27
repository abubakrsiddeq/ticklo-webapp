"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { readUpload, uploadPublicImage } from "@/lib/storage";
import { fieldErrors, formToObject } from "@/lib/validation/common";
import { profileSchema } from "@/lib/validation/profile";
import { resolveUniversityId } from "@/lib/universities";

/** AUTH-04 */
export async function updateProfile(form: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const parsed = profileSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };

  const photo = await readUpload(form.get("avatar"), { label: "Profile photo" });
  if (photo.error) return { ok: false, error: photo.error, fieldErrors: { avatar: photo.error } };

  let avatarUrl: string | undefined;
  if (photo.file) {
    try {
      avatarUrl = await uploadPublicImage("avatars", user.id, photo.file, 400);
    } catch (e) {
      return fail(e);
    }
  }

  const supabase = await createClient();
  const uni = await resolveUniversityId(supabase, parsed.data);
  if (uni.error) return fail(uni.error, { new_university_name: "Check the name and city" });
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: normalizePhone(parsed.data.phone),
      university_id: uni.id,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", user.id);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  if (parsed.data.university_id === "other") {
    return { ok: true, message: "Profile saved. TickLO will check your university and add it soon." };
  }
  return { ok: true, message: "Profile saved." };
}

/** AUTH-08 */
export async function requestDeletion(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return fail(error);
  revalidatePath("/me/profile");
  return { ok: true, message: "Request received. TickLO will delete your account and email you." };
}

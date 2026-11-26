#!/usr/bin/env node
/**
 * Create (or promote) a TickLO admin account in the Supabase project from
 * web/.env.local. Safe to run again: an existing account is updated.
 *
 *   cd web && node scripts/create-admin.mjs <email> <password> "<full name>" [phone]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [email, password, fullName, phoneRaw] = process.argv.slice(2);
if (!email || !password || !fullName) {
  console.error('Usage: node scripts/create-admin.mjs <email> <password> "<full name>" [phone]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

// 03xx-xxxxxxx / 923xx… / +923xx… → +923xxxxxxxxx (same format as lib/phone.ts)
function normalizePhone(v) {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) return `+92${d.slice(1)}`;
  if (/^923\d{9}$/.test(d)) return `+${d}`;
  if (/^3\d{9}$/.test(d)) return `+92${d}`;
  throw new Error(`Phone number not recognised: ${v}`);
}
const phone = normalizePhone(phoneRaw);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizedEmail = email.trim().toLowerCase();
let userId;
const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: normalizedEmail,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (created?.user) {
  userId = created.user.id;
  console.log(`Created login for ${normalizedEmail}`);
} else {
  const { data: existing } = await admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle();
  if (!existing) throw new Error(`Could not create user: ${createError?.message}`);
  userId = existing.id;
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  console.log(`Account already existed – password and name updated for ${normalizedEmail}`);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({ is_admin: true, is_suspended: false, full_name: fullName, ...(phone ? { phone } : {}) })
  .eq("id", userId);
if (profileError) throw profileError;

const { data: profile } = await admin.from("profiles").select("id, email, full_name, phone, is_admin").eq("id", userId).single();
console.log("Admin ready:", profile);

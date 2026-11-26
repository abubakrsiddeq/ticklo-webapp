#!/usr/bin/env node
/**
 * End-to-end smoke test against a real (staging) Supabase project that has the
 * migrations + seed.sql loaded. Uses the seed accounts (password TickLO@12345).
 *
 *   cd web && node scripts/smoke-remote.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY from web/.env.local. Creates a few orders and
 * deletes them again at the end. NEVER run against production.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "TickLO@12345";
const GALA = "40000000-0000-4000-8000-000000000001";
const FREE = "50000000-0000-4000-8000-000000000001";
const VIP = "50000000-0000-4000-8000-000000000003";
const BANK = "30000000-0000-4000-8000-000000000001";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
let passed = 0;
let failed = 0;
const created = [];

function check(name, ok, info = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "✅" : "❌"} ${name}${info ? ` – ${info}` : ""}`);
}

async function login(email) {
  const c = createClient(URL_, ANON, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, user: data.user };
}

async function main() {
  // Public read (anon)
  const anon = createClient(URL_, ANON, opts);
  const { data: pub } = await anon.from("events").select("name, status");
  const names = (pub ?? []).map((e) => e.name);
  check("anon sees published events only", names.includes("Winter Gala 2026") && !names.includes("Acoustic Night"), names.join(", "));
  const { data: avail } = await anon.rpc("event_availability", { p_event_id: GALA });
  check("anon can read remaining tickets (EVT-03)", (avail ?? []).length === 3);

  // Login with seeded accounts (Auth)
  const student = await login("student@ticklo.test");
  const scanner = await login("scanner@ticklo.test");
  const organizer = await login("organizer@ticklo.test");
  check("seed accounts can log in (Supabase Auth)", Boolean(student.user && scanner.user && organizer.user));

  // Free ticket → issued at once (PAY-12)
  const { data: free, error: freeErr } = await student.c.rpc("create_order", {
    p_event_id: GALA,
    p_items: [{ ticket_type_id: FREE, quantity: 1 }],
  });
  check("free order approved instantly", !freeErr && free?.status === "approved", freeErr?.message ?? free?.ref_code);
  if (free?.order_id) created.push(free.order_id);
  const { data: tickets } = await student.c.from("tickets").select("id, status").eq("order_id", free?.order_id ?? "");
  check("student sees own ticket", (tickets ?? []).length === 1);
  const ticketId = tickets?.[0]?.id;

  // Rotating QR token (Edge Function ticket-token)
  const { data: tok, error: tokErr } = await student.c.functions.invoke("ticket-token", { body: { ticket_id: ticketId } });
  check("ticket-token returns a signed QR token", !tokErr && tok?.status === "valid" && /^T1\./.test(tok?.token ?? ""), tokErr?.message ?? `refresh_in=${tok?.refresh_in}`);
  const { data: tokOther } = await scanner.c.functions.invoke("ticket-token", { body: { ticket_id: ticketId } }).catch(() => ({ data: null }));
  check("ticket-token refuses someone else's ticket", !tokOther?.token);

  // Scan (Edge Function scan-verify → atomic check-in)
  const scan = (c, token) => c.functions.invoke("scan-verify", { body: { token, event_id: GALA, device: "smoke-test" } });
  const s1 = await scan(scanner.c, tok?.token);
  check("first scan → Entry OK", s1.data?.result === "ok", s1.error?.message ?? `${s1.data?.result} ${s1.data?.holder_name ?? ""}`);
  const s2 = await scan(scanner.c, tok?.token);
  check("second scan → Already used", s2.data?.result === "already_used", s2.data?.result);
  const s3 = await scan(student.c, tok?.token);
  check("student cannot scan", s3.data?.result === "not_allowed", s3.data?.result);
  const s4 = await scan(scanner.c, "T1.forged.token.xx");
  check("forged QR → invalid", s4.data?.result === "invalid", s4.data?.result);
  const { data: tokUsed } = await student.c.functions.invoke("ticket-token", { body: { ticket_id: ticketId } });
  check("used ticket shows checked_in (TKT-04)", tokUsed?.status === "checked_in");

  // Paid order → payment screen data → proof → organizer approves
  const { data: paid, error: paidErr } = await student.c.rpc("create_order", {
    p_event_id: GALA,
    p_items: [{ ticket_type_id: VIP, quantity: 2 }],
  });
  check("paid order on 60-minute hold", !paidErr && paid?.status === "awaiting_payment", paidErr?.message ?? paid?.ref_code);
  if (paid?.order_id) created.push(paid.order_id);
  const { data: accounts } = await student.c.from("event_payment_accounts").select("payment_accounts ( account_title )").eq("event_id", GALA);
  check("student sees the society's payment accounts (PAY-03)", (accounts ?? []).length === 2);

  const direct = await student.c.rpc("submit_payment_proof", {
    p_user_id: student.user.id, p_order_id: paid?.order_id, p_screenshot_path: "x", p_image_hash: "0".repeat(64),
    p_transaction_id: "TXN1", p_sender_name: "Ali", p_student_card_path: null, p_payment_account_id: null,
  });
  check("browser cannot call submit_payment_proof", Boolean(direct.error));

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const path = `${GALA}/${paid?.order_id}/smoke.png`;
  const up = await admin.storage.from("payment-proofs").upload(path, png, { contentType: "image/png", upsert: true });
  check("upload to private bucket", !up.error, up.error?.message);
  const { data: pubUrl } = admin.storage.from("payment-proofs").getPublicUrl(path);
  const pubRes = await fetch(pubUrl.publicUrl);
  check("private screenshot is not public", pubRes.status >= 400, `HTTP ${pubRes.status}`);
  const proof = await admin.rpc("submit_payment_proof", {
    p_user_id: student.user.id, p_order_id: paid?.order_id, p_screenshot_path: path,
    p_image_hash: createHash("sha256").update(png).digest("hex"), p_transaction_id: "SMOKE-TXN-001",
    p_sender_name: "Ali Raza", p_student_card_path: null, p_payment_account_id: BANK,
  });
  check("proof submitted → under review", !proof.error, proof.error?.message);

  const { error: forbid } = await student.c.rpc("approve_order", { p_order_id: paid?.order_id });
  check("student cannot approve", Boolean(forbid) && /FORBIDDEN/.test(forbid.message));
  const a1 = await organizer.c.rpc("approve_order", { p_order_id: paid?.order_id });
  const a2 = await organizer.c.rpc("approve_order", { p_order_id: paid?.order_id });
  check("organizer approves; second click creates nothing", a1.data?.tickets_created === 2 && a2.data?.already_approved === true, a1.error?.message ?? "");
  const { data: signed } = await admin.storage.from("payment-proofs").createSignedUrl(path, 60);
  const signedRes = signed ? await fetch(signed.signedUrl) : { status: 0 };
  check("organizer view uses a short-lived signed URL", signedRes.status === 200);

  const { data: stats, error: statsErr } = await organizer.c.rpc("event_stats", { p_event_id: GALA });
  check("live dashboard stats (ORG-08)", !statsErr && stats?.checked_in >= 1, statsErr?.message ?? `sold=${stats?.total_tickets} in=${stats?.checked_in}`);
  const { data: scanStats } = await scanner.c.rpc("event_stats", { p_event_id: GALA });
  check("scanner gets only the live count (SCN-08)", scanStats && Object.keys(scanStats).length === 2);
  const { data: others } = await scanner.c.from("orders").select("id");
  check("scanner cannot read orders (privacy)", (others ?? []).length === 0);
}

async function cleanup() {
  for (const id of created) {
    const { data: t } = await admin.from("tickets").select("id").eq("order_id", id);
    const ids = (t ?? []).map((x) => x.id);
    if (ids.length) await admin.from("checkins").delete().in("ticket_id", ids);
    await admin.from("tickets").delete().eq("order_id", id);
    await admin.from("payment_proofs").delete().eq("order_id", id);
    await admin.from("orders").delete().eq("id", id);
  }
  await admin.from("checkins").delete().eq("device", "smoke-test");
  await admin.storage.from("payment-proofs").remove(created.map((id) => `${GALA}/${id}/smoke.png`));
  await admin.from("audit_log").delete().in("target_id", created);
}

main()
  .catch((e) => {
    failed++;
    console.error("❌ crashed:", e.message);
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e.message));
    console.log(`\n${passed} passed, ${failed} failed (test orders cleaned up)`);
    process.exit(failed ? 1 : 0);
  });

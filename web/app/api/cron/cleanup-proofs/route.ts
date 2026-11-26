import { isCronAuthorized, unauthorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeFiles } from "@/lib/storage";

/**
 * NFR-15: delete payment screenshots and student card photos a fixed number of
 * days after the event ended. The period is not decided yet (open question),
 * so this does nothing until PROOF_RETENTION_DAYS is set.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return unauthorized();
  const days = Number(process.env.PROOF_RETENTION_DAYS ?? "");
  if (!Number.isFinite(days) || days < 1) return Response.json({ ok: true, skipped: "PROOF_RETENTION_DAYS not set" });

  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("payment_proofs")
    .select("id, screenshot_path, student_card_path, events!inner ( ends_at )")
    .lt("events.ends_at", cutoff)
    .or("screenshot_path.not.is.null,student_card_path.not.is.null")
    .limit(200);
  if (error) {
    console.error("cleanup query failed", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  const shots = (rows ?? []).map((r) => r.screenshot_path).filter((p): p is string => Boolean(p));
  const cards = (rows ?? []).map((r) => r.student_card_path).filter((p): p is string => Boolean(p));
  await removeFiles("payment-proofs", shots);
  await removeFiles("student-cards", cards);
  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length) {
    await admin.from("payment_proofs").update({ screenshot_path: null, student_card_path: null }).in("id", ids);
  }
  return Response.json({ ok: true, proofs: ids.length, files: shots.length + cards.length });
}

export const GET = handle;
export const POST = handle;

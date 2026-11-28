import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import { readUpload, uploadPrivate, removeFiles } from "@/lib/storage";
import { fieldErrors, formToObject } from "@/lib/validation/common";
import { paymentProofSchema } from "@/lib/validation/payments";
import { after } from "next/server";
import { notifyNewProof } from "@/lib/emails/notify";
import { notifyAdminsDuplicateProof } from "@/lib/emails/admin-alerts";
import type { PaymentProvider, ProofResult, ProofSubmission } from "./types";

/**
 * Manual bank/wallet transfer (PAY-03 .. PAY-09).
 *
 * The server – not the browser – reads the screenshot, checks its real type
 * and size, computes the SHA-256 image hash used for duplicate detection
 * (PAY-09), stores it in a private bucket, and calls the service-role-only
 * SQL function `submit_payment_proof`.
 */
async function submitProof({ userId, orderId, form }: ProofSubmission): Promise<ProofResult> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, event_id, status, total_paisa, requires_student_card")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== userId) return { ok: false, error: "Order not found." };

  const parsed = paymentProofSchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const paid = order.total_paisa > 0;

  const errors: Record<string, string> = {};
  if (paid && input.transaction_id.length < 4) errors.transaction_id = "Enter the transaction ID from your bank app.";
  if (paid && input.sender_name.length < 2) errors.sender_name = "Enter the name of the account you paid from.";

  const shot = await readUpload(form.get("screenshot"), { label: "Payment screenshot", required: paid });
  if (shot.error) errors.screenshot = shot.error;
  const card = await readUpload(form.get("student_card"), {
    label: "Student card photo",
    required: order.requires_student_card,
  });
  if (card.error) errors.student_card = card.error;

  // Which account did the student pay into? Required when several are shown.
  const { data: links } = await admin
    .from("event_payment_accounts")
    .select("payment_account_id")
    .eq("event_id", order.event_id);
  const accountIds = (links ?? []).map((l) => l.payment_account_id);
  let accountId: string | null = input.payment_account_id || null;
  if (paid && !accountId && accountIds.length === 1) accountId = accountIds[0];
  if (paid && accountIds.length > 1 && !accountId) errors.payment_account_id = "Choose the account you sent money to.";
  if (accountId && !accountIds.includes(accountId)) errors.payment_account_id = "Choose one of the accounts shown.";

  if (Object.keys(errors).length) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: errors };

  const folder = `${order.event_id}/${order.id}`;
  const uploaded: { bucket: "payment-proofs" | "student-cards"; path: string }[] = [];
  try {
    const screenshotPath = shot.file ? await uploadPrivate("payment-proofs", folder, shot.file) : null;
    if (screenshotPath) uploaded.push({ bucket: "payment-proofs", path: screenshotPath });
    const cardPath = card.file ? await uploadPrivate("student-cards", folder, card.file) : null;
    if (cardPath) uploaded.push({ bucket: "student-cards", path: cardPath });

    const { data, error } = await admin.rpc("submit_payment_proof", {
      p_user_id: userId,
      p_order_id: order.id,
      p_screenshot_path: screenshotPath,
      p_image_hash: shot.file?.sha256 ?? null,
      p_transaction_id: input.transaction_id || null,
      p_sender_name: input.sender_name || null,
      p_student_card_path: cardPath,
      p_payment_account_id: accountId,
    });
    if (error) throw error;

    const result = data as { is_possible_duplicate?: boolean } | null;
    const possibleDuplicate = Boolean(result?.is_possible_duplicate);
    await notifyNewProof(order.id, possibleDuplicate); // EML-08 (never throws)
    if (possibleDuplicate) after(() => notifyAdminsDuplicateProof(order.id)); // D-088
    return { ok: true, possibleDuplicate };
  } catch (e) {
    // Do not leave orphaned private files behind when the database refused.
    for (const u of uploaded) await removeFiles(u.bucket, [u.path]).catch(() => undefined);
    return { ok: false, error: friendlyError(e, "Upload failed. Please try again.") };
  }
}

export const manualPaymentProvider: PaymentProvider = {
  id: "manual",
  submitProof,
};

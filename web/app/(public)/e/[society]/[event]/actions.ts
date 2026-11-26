"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { buyerDetailsSchema } from "@/lib/validation/profile";
import { fieldErrors } from "@/lib/validation/common";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { normalizeCode, refCookieName, type DiscountType } from "@/lib/referrals";

const itemsSchema = z
  .array(z.object({ ticket_type_id: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
  .min(1, "Choose at least one ticket")
  .max(10);

/** PAY-01/PAY-02/PAY-12: create the order (holds tickets for 60 minutes). */
export async function bookTickets(
  eventId: string,
  items: { ticket_type_id: string; quantity: number }[],
  buyer: { full_name: string; phone: string } | null,
  code: string | null = null,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in to book tickets." };
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Event not found." };

  const parsedItems = itemsSchema.safeParse(items);
  if (!parsedItems.success) return { ok: false, error: "Choose at least one ticket." };

  let buyerName: string | null = null;
  let buyerPhone: string | null = null;
  if (buyer) {
    const parsed = buyerDetailsSchema.safeParse(buyer);
    if (!parsed.success) return { ok: false, error: "Please add your name and phone.", fieldErrors: fieldErrors(parsed.error) };
    buyerName = parsed.data.full_name;
    buyerPhone = normalizePhone(parsed.data.phone);
  }

  // AMB-04: a typed code (promo or ambassador) and the ambassador link remembered for 7 days
  const typed = normalizeCode(code);
  if (typed && typed.length > 16) return { ok: false, error: "This code is not valid for this event.", fieldErrors: { code: "Not valid" } };
  const remembered = normalizeCode((await cookies()).get(refCookieName(eventId))?.value);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_event_id: eventId,
    p_items: parsedItems.data,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
    p_code: typed,
    p_ref: remembered && remembered.length <= 16 ? remembered : null,
  });
  if (error) return fail(error);

  const order = data as { order_id: string; status: string; existing: boolean };
  if (!order.existing) {
    if (order.status === "approved") await notifyOrderConfirmed(order.order_id); // free tickets
    else await notifyPaymentInstructions(order.order_id); // EML-02
  }
  redirect(order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : `/checkout/${order.order_id}${order.existing ? "?existing=1" : ""}`);
}

export interface CodePreview {
  kind: "promo" | "ambassador";
  code: string;
  name: string | null;
  discountType: DiscountType;
  discountValue: number;
  minTickets: number;
  ticketTypeIds: string[] | null;
}

/** AMB-03/AMB-07: check a typed code before booking. Rate-limited so codes cannot be guessed. */
export async function checkCode(eventId: string, code: string): Promise<ActionResult<CodePreview>> {
  if (!z.string().uuid().safeParse(eventId).success) return { ok: false, error: "Event not found." };
  const c = normalizeCode(code);
  if (!c || c.length < 3 || c.length > 16) return { ok: false, error: "Enter a code of 3 to 16 letters or digits." };
  // per account when logged in (a whole campus can share one IP), else per IP with a higher limit
  const who = await getCurrentUser();
  const allowed = who ? await rateLimit(`code:u:${who.id}`, 20, 600) : await rateLimit(`code:ip:${await clientIp()}`, 100, 600);
  if (!allowed) return { ok: false, error: "Too many tries. Please wait a few minutes." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("referral_preview", { p_event_id: eventId, p_code: c });
  if (error) return fail(error);
  const p = data as null | { kind: "promo" | "ambassador" | null; valid: boolean; reason?: string; code: string; name?: string; discount_type?: DiscountType; discount_value?: number; min_tickets?: number; ticket_type_ids?: string[] | null };
  if (!p || !p.valid || !p.kind) return { ok: false, error: p?.reason ?? "This code is not valid for this event." };
  return {
    ok: true,
    data: {
      kind: p.kind,
      code: p.code,
      name: p.name ?? null,
      discountType: p.discount_type ?? "none",
      discountValue: p.discount_value ?? 0,
      minTickets: p.min_tickets ?? 1,
      ticketTypeIds: p.ticket_type_ids ?? null,
    },
  };
}

/** AMB-03: count a link open (once per browser per day – the browser decides; IP-limited here). */
export async function trackReferralClick(eventId: string, code: string): Promise<void> {
  if (!z.string().uuid().safeParse(eventId).success) return;
  const c = normalizeCode(code);
  if (!c || c.length > 16) return;
  if (!(await rateLimit(`refclick:${await clientIp()}`, 300, 3600))) return; // campus WiFi = many people, one IP
  const supabase = await createClient();
  await supabase.rpc("track_referral_click", { p_event_id: eventId, p_code: c });
}

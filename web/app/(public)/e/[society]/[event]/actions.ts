"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { fail, type ActionResult } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { buyerDetailsSchema } from "@/lib/validation/profile";
import { fieldErrors } from "@/lib/validation/common";
import { notifyOrderConfirmed, notifyPaymentInstructions } from "@/lib/emails/notify";

const itemsSchema = z
  .array(z.object({ ticket_type_id: z.string().uuid(), quantity: z.number().int().min(1).max(20) }))
  .min(1, "Choose at least one ticket")
  .max(10);

/** PAY-01/PAY-02/PAY-12: create the order (holds tickets for 60 minutes). */
export async function bookTickets(
  eventId: string,
  items: { ticket_type_id: string; quantity: number }[],
  buyer: { full_name: string; phone: string } | null,
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_event_id: eventId,
    p_items: parsedItems.data,
    p_buyer_name: buyerName,
    p_buyer_phone: buyerPhone,
  });
  if (error) return fail(error);

  const order = data as { order_id: string; status: string; existing: boolean };
  if (!order.existing) {
    if (order.status === "approved") await notifyOrderConfirmed(order.order_id); // free tickets
    else await notifyPaymentInstructions(order.order_id); // EML-02
  }
  redirect(order.status === "approved" ? `/checkout/${order.order_id}/status?new=1` : `/checkout/${order.order_id}${order.existing ? "?existing=1" : ""}`);
}

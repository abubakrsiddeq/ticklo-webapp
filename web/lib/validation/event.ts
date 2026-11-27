import { z } from "zod";
import { fromPKTInputValue } from "@/lib/format";
import { optionalPktDateTime, optionalText, pktDateTime, requiredText } from "./common";

const intString = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .refine((v) => Number(v) >= min && Number(v) <= max, `${label} must be between ${min} and ${max}`);

// ORG-04
export const eventSchema = z
  .object({
    name: requiredText("Event name", 3, 150),
    description: optionalText("Description", 5000),
    venue: requiredText("Venue", 2, 200),
    starts_at: pktDateTime("Start time"),
    ends_at: pktDateTime("End time"),
    // D-062: not asked for a festival (each session has its own seats); checked below for the rest
    capacity: z.string().trim().optional(),
    visibility: z.enum(["public", "link_only"]),
    max_tickets_per_order: z.string().trim().optional(),
    // FES-15: single event, festival with sessions, or competition / registration
    format: z.enum(["single", "festival", "competition"], { message: "Choose what kind of event this is" }),
    // D-064: the organizer decides whether every ticket carries its holder's name / university
    // D-065: not asked for a festival (each session asks for itself)
    attendee_names: z.enum(["off", "optional", "required"]).optional(),
    attendee_university: z.enum(["off", "optional", "required"]).optional(),
  })
  .refine((v) => (fromPKTInputValue(v.ends_at) ?? "") > (fromPKTInputValue(v.starts_at) ?? ""), {
    message: "End time must be after the start time",
    path: ["ends_at"],
  })
  .superRefine((v, ctx) => {
    if (v.format === "festival") return;
    const checks = [
      ["capacity", intString("Capacity", 1, 100000)],
      ["max_tickets_per_order", intString("Max tickets per order", 1, 20)],
    ] as const;
    for (const [key, schema] of checks) {
      const r = schema.safeParse(v[key] ?? "");
      if (!r.success) ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "Invalid", path: [key] });
    }
  });

export type EventInput = z.infer<typeof eventSchema>;

// ORG-05 (price in rupees as typed; 0 = free)
export const ticketTypeSchema = z
  .object({
    name: requiredText("Ticket name", 1, 80),
    description: optionalText("Description", 500),
    price: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter the price in rupees, e.g. 1500 (0 for free)")
      .refine((v) => Number(v) <= 1_000_000, "Price is too high"),
    quantity: intString("Quantity", 1, 100000),
    sale_starts_at: optionalPktDateTime,
    sale_ends_at: optionalPktDateTime,
    requires_student_card: z.boolean(),
    // D-072: early-bird price until a date (both or neither)
    early_price: z.string().trim().regex(/^(\d+(\.\d{1,2})?)?$/, "Rupees, e.g. 1200"),
    early_until: optionalPktDateTime,
  })
  .refine((v) => !v.early_price === !v.early_until, { message: "Give both the early-bird price and its last date", path: ["early_until"] })
  .refine((v) => !v.early_price || Number(v.early_price) < Number(v.price), { message: "Must be lower than the normal price", path: ["early_price"] })
  .refine(
    (v) =>
      !v.sale_starts_at ||
      !v.sale_ends_at ||
      (fromPKTInputValue(v.sale_ends_at) ?? "") > (fromPKTInputValue(v.sale_starts_at) ?? ""),
    { message: "Sale end must be after sale start", path: ["sale_ends_at"] },
  );

export type TicketTypeInput = z.infer<typeof ticketTypeSchema>;

export const cancelEventSchema = z.object({
  reason: requiredText("Reason", 5, 1000),
  confirm: z.literal("CANCEL", { message: 'Type CANCEL to confirm' }),
});

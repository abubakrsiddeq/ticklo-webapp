import { z } from "zod";
import { normalizePhone, PHONE_HINT } from "@/lib/phone";
import { emailField, hasControlChars, personName } from "./common";

// Contact page form (shared by the client form and the server action).

export const CONTACT_TOPICS = [
  { value: "booking", label: "Help with a booking or ticket" },
  { value: "society", label: "My society / organizer tools" },
  { value: "partnership", label: "Partnership or bringing TickLO to my university" },
  { value: "problem", label: "Report a problem or fraud" },
  { value: "privacy", label: "Privacy or account deletion" },
  { value: "other", label: "Something else" },
] as const;

type TopicValue = (typeof CONTACT_TOPICS)[number]["value"];
const TOPIC_VALUES = CONTACT_TOPICS.map((t) => t.value) as [TopicValue, ...TopicValue[]];

export const topicLabel = (v: string) => CONTACT_TOPICS.find((t) => t.value === v)?.label ?? "Something else";

export const contactSchema = z.object({
  name: personName(2, 80),
  email: emailField,
  phone: z
    .string()
    .trim()
    .max(20, PHONE_HINT)
    .refine((v) => v === "" || normalizePhone(v) !== null, PHONE_HINT),
  topic: z.enum(TOPIC_VALUES, { message: "Choose what your message is about" }),
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little more (at least 20 characters)")
    .max(2000, "Message must be at most 2000 characters")
    .refine((v) => !hasControlChars(v), "Your message has characters that are not allowed"),
  /** Honeypot: hidden from people, bots fill it in. */
  website: z.string().max(200).optional(),
});

export type ContactInput = z.input<typeof contactSchema>;

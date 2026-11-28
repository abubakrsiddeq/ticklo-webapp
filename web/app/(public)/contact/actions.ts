"use server";

import { getSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/emails/send";
import { normalizePhone } from "@/lib/phone";
import { CONTACT } from "@/lib/site";
import { fieldErrors } from "@/lib/validation/common";
import { contactSchema, topicLabel } from "@/lib/validation/contact";
import type { ActionResult } from "@/lib/errors";
import ContactMessageEmail from "@/emails/contact-message";

/** Contact page: emails the message to TickLO support with Reply-To set to the sender. */
export async function sendContactMessage(input: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  // Bots fill the hidden field: pretend it worked and send nothing.
  if (v.website) return { ok: true };

  const ip = await clientIp();
  if (!(await rateLimit(`contact:ip:${ip}`, 5, 3600)) || !(await rateLimit(`contact:email:${v.email}`, 3, 3600))) {
    return { ok: false, error: "You have sent several messages already. Please wait an hour or email us directly." };
  }

  // Not logged in or auth unreachable: the message still goes out.
  const account = (await getSession().catch(() => null))?.email || null;

  const topic = topicLabel(v.topic);
  const res = await sendEmail({
    to: CONTACT.supportEmail,
    replyTo: v.email,
    subject: `Contact: ${topic} (${v.name})`,
    template: "contact-message",
    react: ContactMessageEmail({
      name: v.name,
      email: v.email,
      phone: v.phone ? normalizePhone(v.phone) : null,
      topic,
      message: v.message,
      account,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: `We could not send your message right now. Please email us at ${CONTACT.supportEmail}.` };
  }
  return { ok: true, message: "Message sent" };
}

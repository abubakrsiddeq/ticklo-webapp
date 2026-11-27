import "server-only";
import type { ReactElement } from "react";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EmailMessage {
  to: string;
  subject: string;
  react: ReactElement;
  /** Short template name for the email log, e.g. "order-confirmed" */
  template: string;
  related?: { type: string; id: string };
  /** Files; give `contentId` to show an image inline with <img src="cid:…"> */
  attachments?: { filename: string; content: Buffer; contentType?: string; contentId?: string }[];
}

let resend: Resend | null = null;
const getResend = () => (resend ??= new Resend(serverEnv.resendApiKey));

let smtp: Transporter | null = null;
const getSmtp = () =>
  (smtp ??= nodemailer.createTransport({
    host: serverEnv.smtp.host,
    port: serverEnv.smtp.port,
    secure: serverEnv.smtp.port === 465, // 465 = TLS/SSL from the start; 587 = STARTTLS
    auth: { user: serverEnv.smtp.user, pass: serverEnv.smtp.pass },
  }));

async function log(
  msg: EmailMessage,
  status: "sent" | "failed" | "logged",
  extra: { providerId?: string; error?: string } = {},
) {
  try {
    await createAdminClient()
      .from("email_log")
      .insert({
        to_email: msg.to,
        template: msg.template,
        subject: msg.subject,
        status,
        provider_id: extra.providerId ?? null,
        error: extra.error?.slice(0, 1000) ?? null,
        related_type: msg.related?.type ?? null,
        related_id: msg.related?.id ?? null,
      });
  } catch (e) {
    console.error("email log failed", e);
  }
}

/**
 * Send one email. NEVER throws: an email problem must not affect the order or
 * ticket ("Email fail ho jaye to order ya ticket pe koi asar nahi").
 * Provider: SMTP when SMTP_HOST is set (Hostinger, D-051), else Resend when
 * RESEND_API_KEY is set, else the email is printed to the server console.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  if (!msg.to) return { ok: false };
  try {
    const [html, text] = await Promise.all([render(msg.react), render(msg.react, { plainText: true })]);
    if (serverEnv.smtp.host) {
      const info = await getSmtp().sendMail({
        from: serverEnv.emailFrom,
        replyTo: serverEnv.emailReplyTo || undefined,
        to: msg.to,
        subject: msg.subject,
        html,
        text,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.contentId })),
      });
      await log(msg, "sent", { providerId: info.messageId });
      return { ok: true };
    }
    if (!serverEnv.resendApiKey) {
      console.info(`\n[email → console] to=${msg.to} | ${msg.subject}${msg.attachments?.length ? ` | ${msg.attachments.length} attachment(s)` : ""}\n${text}\n`);
      await log(msg, "logged");
      return { ok: true };
    }
    const { data, error } = await getResend().emails.send({
      from: serverEnv.emailFrom,
      replyTo: serverEnv.emailReplyTo || undefined,
      to: msg.to,
      subject: msg.subject,
      html,
      text,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, contentId: a.contentId })),
    });
    if (error) throw new Error(error.message);
    await log(msg, "sent", { providerId: data?.id });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`email "${msg.template}" to ${msg.to} failed:`, message);
    await log(msg, "failed", { error: message });
    return { ok: false };
  }
}

/** Send many emails one by one (keeps each recipient private). */
export async function sendEmails(messages: EmailMessage[]): Promise<number> {
  let sent = 0;
  for (const m of messages) {
    if ((await sendEmail(m)).ok) sent++;
  }
  return sent;
}

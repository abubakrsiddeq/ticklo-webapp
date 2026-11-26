import "server-only";

// Server-only secrets. Importing this file from a Client Component fails the
// build ("server-only"), so the service role key can never reach the browser.
export const serverEnv = {
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "TickLO <onboarding@resend.dev>",
  cronSecret: process.env.CRON_SECRET ?? "",
  /** Same value as the Edge Function secret QR_SIGNING_SECRET (D-037). */
  qrSigningSecret: process.env.QR_SIGNING_SECRET ?? "",
};

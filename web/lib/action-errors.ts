import { unstable_isUnrecognizedActionError } from "next/navigation";

// D-074: what to tell people when a server action could not run at all (no internet, the
// server failed or timed out, a new version was deployed while the page was open).
// Errors the action itself reports come back as { ok: false, error } and never reach here.

export const NETWORK_MESSAGE = "No internet connection. Check your connection and try again.";
export const UPDATED_MESSAGE = "TickLO was just updated. Refresh the page and try again.";
export const FALLBACK_MESSAGE = "Something went wrong on our side. Please try again in a moment.";

/** A sentence for an action that threw (never a stack trace or server text). */
export function actionErrorMessage(error: unknown, fallback: string = FALLBACK_MESSAGE): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return NETWORK_MESSAGE;
  if (unstable_isUnrecognizedActionError(error)) return UPDATED_MESSAGE;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/Server Action .*(not found|was not found)|Failed to find Server Action/i.test(message)) return UPDATED_MESSAGE;
  if (/Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed/i.test(message)) return NETWORK_MESSAGE;
  return fallback;
}

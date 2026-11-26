import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Cron endpoints accept `Authorization: Bearer <CRON_SECRET>` (preferred) or `?secret=`. */
export function isCronAuthorized(request: Request): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : (new URL(request.url).searchParams.get("secret") ?? "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

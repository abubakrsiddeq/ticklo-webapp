import { type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_BUCKETS = ["posters", "logos"];

/**
 * Same-origin copy of a public poster/logo image for the ticket editor (PRT-05).
 * A canvas that draws a cross-origin image can't be exported to PNG/PDF, so the
 * editor loads images through here. Only our own Supabase public buckets are
 * allowed – this is not an open proxy.
 */
export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src") ?? "";
  if (!publicEnv.supabaseUrl) return new Response("Not configured", { status: 503 });
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new Response("Bad image address", { status: 400 });
  }
  const base = new URL(publicEnv.supabaseUrl);
  const prefix = "/storage/v1/object/public/";
  const bucket = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length).split("/")[0] : "";
  if (url.origin !== base.origin || !ALLOWED_BUCKETS.includes(bucket) || url.pathname.includes("..")) {
    return new Response("Image not allowed", { status: 403 });
  }

  const upstream = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("Image not found", { status: 404 });
  const type = upstream.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(type.split(";")[0].trim())) return new Response("Not an image", { status: 415 });
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return new Response("Image too large", { status: 413 });
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

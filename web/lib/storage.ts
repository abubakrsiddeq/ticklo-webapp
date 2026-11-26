import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (PAY-04, ORG-04)

export type UploadKind = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const PUBLIC_BUCKETS = ["posters", "logos", "avatars"] as const;
export const PRIVATE_BUCKETS = ["payment-proofs", "student-cards", "org-proofs"] as const;
type Bucket = (typeof PUBLIC_BUCKETS)[number] | (typeof PRIVATE_BUCKETS)[number];

const EXT: Record<UploadKind, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Detect the real file type from its first bytes (never trust the browser). */
export function sniffType(buf: Buffer): UploadKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export interface ValidFile {
  buffer: Buffer;
  type: UploadKind;
  ext: string;
  sha256: string;
}

/** Validate an uploaded File. Returns an error message or the file. */
export async function readUpload(
  file: FormDataEntryValue | null,
  opts: { label: string; required?: boolean; allowPdf?: boolean },
): Promise<{ file: ValidFile | null; error?: string }> {
  if (!file || typeof file === "string" || file.size === 0) {
    return opts.required ? { file: null, error: `${opts.label} is required.` } : { file: null };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { file: null, error: `${opts.label} must be 5 MB or smaller.` };
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buffer);
  if (!type || (type === "application/pdf" && !opts.allowPdf)) {
    return {
      file: null,
      error: `${opts.label} must be a JPG, PNG or WebP image${opts.allowPdf ? " or a PDF" : ""}.`,
    };
  }
  return { file: { buffer, type, ext: EXT[type], sha256: createHash("sha256").update(buffer).digest("hex") } };
}

/**
 * Re-encode posters/logos/avatars to JPEG (max `maxWidth` px) with sharp so
 * pages stay light on 3G/4G (NFR-02). Falls back to the original bytes if
 * sharp is not available on the host.
 */
async function optimiseImage(
  file: ValidFile,
  maxWidth: number,
  keepTransparency = false,
): Promise<{ buffer: Buffer; type: UploadKind; ext: string }> {
  try {
    const sharp = (await import("sharp")).default;
    if (keepTransparency && file.type !== "image/jpeg") {
      // Logos on printed tickets need their transparent background (PNG out)
      const meta = await sharp(file.buffer, { failOn: "none" }).metadata();
      if (meta.hasAlpha) {
        const out = await sharp(file.buffer, { failOn: "none" })
          .rotate()
          .resize({ width: maxWidth, height: maxWidth * 2, fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer();
        return { buffer: out, type: "image/png", ext: "png" };
      }
    }
    const out = await sharp(file.buffer, { failOn: "none" })
      .rotate()
      .resize({ width: maxWidth, height: maxWidth * 2, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return { buffer: out, type: "image/jpeg", ext: "jpg" };
  } catch (e) {
    console.warn("sharp unavailable, storing original image", e);
    return { buffer: file.buffer, type: file.type, ext: file.ext };
  }
}

/** Upload a public image and return its public URL. */
export async function uploadPublicImage(
  bucket: (typeof PUBLIC_BUCKETS)[number],
  folder: string,
  file: ValidFile,
  maxWidth = 1600,
  opts: { keepTransparency?: boolean } = {},
): Promise<string> {
  const img = await optimiseImage(file, maxWidth, opts.keepTransparency);
  const path = `${folder}/${randomUUID()}.${img.ext}`;
  const storage = createAdminClient().storage.from(bucket);
  const { error } = await storage.upload(path, img.buffer, { contentType: img.type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Upload to a private bucket; returns the storage path (not a URL). */
export async function uploadPrivate(bucket: (typeof PRIVATE_BUCKETS)[number], folder: string, file: ValidFile): Promise<string> {
  const path = `${folder}/${randomUUID()}.${file.ext}`;
  const { error } = await createAdminClient()
    .storage.from(bucket)
    .upload(path, file.buffer, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

/** Short-lived signed URL for a private file (NFR-15: "thodi der ke signed URL"). */
export async function signedUrl(bucket: Bucket, path: string | null | undefined, expiresInSeconds = 600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("signed url failed", bucket, error.message);
    return null;
  }
  return data.signedUrl;
}

export async function removeFiles(bucket: Bucket, paths: string[]) {
  if (!paths.length) return;
  await createAdminClient().storage.from(bucket).remove(paths);
}

/** Many signed URLs in one request. Returns path → url. */
export async function signedUrls(bucket: Bucket, paths: (string | null | undefined)[], expiresInSeconds = 600): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrls(list, expiresInSeconds);
  if (error) {
    console.error("signed urls failed", bucket, error.message);
    return out;
  }
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

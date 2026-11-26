#!/usr/bin/env node
/**
 * Builds every derived TickLO brand asset from the official files in /brand.
 *
 *   cd web && node scripts/build-brand-assets.mjs
 *
 * Inputs (official, from the brand kit):
 *   brand/logo/ticklo-logo-primary.png          transparent, 3000×978
 *   brand/logo/ticklo-logo-primary-tagline.png  white background, 3000×1308
 *   brand/icon/ticklo-app-icon-1024.png         app icon / profile picture
 *
 * Outputs:
 *   brand/logo/ticklo-logo-on-dark.png      white logo for dark backgrounds (brand sheet p.2)
 *   brand/logo/ticklo-mark.png              ticket mark on its own
 *   brand/logo/ticklo-mark-on-dark.png
 *   web/public/brand/*                      trimmed, web-sized logos used by the app and emails
 *   web/public/icons/*                      PWA icons (192, 512, maskable)
 *   web/app/icon.png, apple-icon.png, favicon.ico, opengraph-image.png
 *
 * The on-dark versions are a pure palette swap of the official artwork (same
 * shapes), following the brand sheet: ticket → white, tick → navy, dashes hidden,
 * "Tick" + face → white, "LO" → light green #3DDC97. Anti-aliased edges are kept
 * by mapping each pixel's position between two brand colours.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const brand = (p) => path.join(root, "brand", p);
const web = (p) => path.join(root, "web", p);

const NAVY = [0x0b, 0x1f, 0x3a];
const GREEN = [0x0f, 0x9d, 0x58];
const GREY = [0x79, 0x84, 0x93];
const WHITE = [0xff, 0xff, 0xff];
const LIGHT_GREEN = [0x3d, 0xdc, 0x97];

// Column where the ticket mark ends and the wordmark starts (transparent gap 1041–1181).
const SPLIT_X = 1110;

/** Map a colour lying between two palette colours onto the matching target colours. */
function makeMapper(pairs) {
  return (r, g, b) => {
    let best = null;
    for (const [from, to] of pairs) {
      for (let i = 0; i < from.length; i++) {
        for (let j = i; j < from.length; j++) {
          const A = from[i], B = from[j];
          const AB = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
          const len2 = AB[0] ** 2 + AB[1] ** 2 + AB[2] ** 2;
          let t = 0;
          if (len2 > 0) t = Math.min(1, Math.max(0, ((r - A[0]) * AB[0] + (g - A[1]) * AB[1] + (b - A[2]) * AB[2]) / len2));
          const P = [A[0] + t * AB[0], A[1] + t * AB[1], A[2] + t * AB[2]];
          const err = (r - P[0]) ** 2 + (g - P[1]) ** 2 + (b - P[2]) ** 2;
          if (!best || err < best.err) {
            const TA = to[i], TB = to[j];
            best = { err, out: [TA[0] + t * (TB[0] - TA[0]), TA[1] + t * (TB[1] - TA[1]), TA[2] + t * (TB[2] - TA[2])] };
          }
        }
      }
    }
    return best.out.map((v) => Math.round(v));
  };
}

const ticketOnDark = makeMapper([[[NAVY, GREEN, GREY], [WHITE, NAVY, WHITE]]]);
const wordmarkOnDark = makeMapper([[[NAVY, GREEN], [WHITE, LIGHT_GREEN]]]);

async function onDark(input, output) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * 4;
    if (out[i + 3] === 0) continue;
    const x = p % info.width;
    const [r, g, b] = (x < SPLIT_X ? ticketOnDark : wordmarkOnDark)(out[i], out[i + 1], out[i + 2]);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(output);
}

/** Trim transparent edges, then resize to `width` (keeps aspect). */
async function trimmed(input, output, width) {
  const buf = await sharp(input).trim({ threshold: 0 }).toBuffer();
  await sharp(buf).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9, palette: false }).toFile(output);
  const m = await sharp(output).metadata();
  return { width: m.width, height: m.height };
}

async function main() {
  mkdirSync(web("public/brand"), { recursive: true });
  mkdirSync(web("public/icons"), { recursive: true });

  const primary = brand("logo/ticklo-logo-primary.png");
  const primaryMeta = await sharp(primary).metadata();

  // 1. Brand-kit variants (full size, same clear space as the official file)
  await onDark(primary, brand("logo/ticklo-logo-on-dark.png"));
  const markBox = { left: 0, top: 0, width: SPLIT_X, height: primaryMeta.height };
  await sharp(primary).extract(markBox).png().toFile(brand("logo/ticklo-mark.png"));
  await sharp(brand("logo/ticklo-logo-on-dark.png")).extract(markBox).png().toFile(brand("logo/ticklo-mark-on-dark.png"));

  // 2. Web-sized assets (trimmed; spacing comes from the layout)
  const sizes = {
    logo: await trimmed(primary, web("public/brand/ticklo-logo.png"), 1200),
    logoOnDark: await trimmed(brand("logo/ticklo-logo-on-dark.png"), web("public/brand/ticklo-logo-on-dark.png"), 1200),
    mark: await trimmed(brand("logo/ticklo-mark.png"), web("public/brand/ticklo-mark.png"), 512),
    markOnDark: await trimmed(brand("logo/ticklo-mark-on-dark.png"), web("public/brand/ticklo-mark-on-dark.png"), 512),
  };
  await sharp(brand("logo/ticklo-logo-primary-tagline.png")).resize({ width: 1200 }).png({ compressionLevel: 9 }).toFile(web("public/brand/ticklo-logo-tagline.png"));
  await sharp(brand("icon/ticklo-app-icon-1024.png")).resize(512).png().toFile(web("public/brand/ticklo-app-icon-512.png"));

  // 3. App icons from the official app icon (green square, white ticket, navy tick)
  const icon = brand("icon/ticklo-app-icon-1024.png");
  await sharp(icon).resize(192).png().toFile(web("public/icons/icon-192.png"));
  await sharp(icon).resize(512).png().toFile(web("public/icons/icon-512.png"));
  // Maskable: keep the ticket inside the 80 % safe zone on the same green
  const inner = await sharp(icon).resize(410).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: GREEN[0], g: GREEN[1], b: GREEN[2], alpha: 1 } } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile(web("public/icons/maskable-512.png"));
  await sharp(icon).resize(512).png().toFile(web("app/icon.png"));
  await sharp(icon).resize(180).png().toFile(web("app/apple-icon.png"));
  rmSync(web("app/icon.svg"), { force: true });

  // favicon.ico with 16/32/48 px images (ImageMagick)
  const tmp = path.join(root, "web/.next-brand-tmp");
  mkdirSync(tmp, { recursive: true });
  const icoParts = [];
  for (const s of [16, 32, 48]) {
    const f = path.join(tmp, `fav-${s}.png`);
    await sharp(icon).resize(s).png().toFile(f);
    icoParts.push(f);
  }
  try {
    execFileSync("magick", [...icoParts, web("app/favicon.ico")]);
  } catch {
    console.warn("ImageMagick not found – skipped favicon.ico (app/icon.png still works)");
  }
  rmSync(tmp, { recursive: true, force: true });

  // 4. Default share image (WhatsApp / Instagram / X), 1200×630: official tagline logo on white
  const og = await sharp(brand("logo/ticklo-logo-primary-tagline.png")).trim({ threshold: 10 }).resize({ width: 900, height: 470, fit: "inside" }).png().toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#ffffff" } })
    .composite([{ input: og, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(web("app/opengraph-image.png"));
  writeFileSync(web("app/opengraph-image.alt.txt"), "TickLO – TickLO se ticket lo, befikar raho!");
  // Same image at a stable URL, used as fallback by pages that set their own openGraph
  await sharp(web("app/opengraph-image.png")).toFile(web("public/brand/ticklo-og.png"));

  // 5. Sizes for next/image (width/height props)
  const ts = `// Generated by scripts/build-brand-assets.mjs – do not edit by hand.
export const BRAND_ASSETS = ${JSON.stringify(
    {
      logo: { src: "/brand/ticklo-logo.png", ...sizes.logo },
      logoOnDark: { src: "/brand/ticklo-logo-on-dark.png", ...sizes.logoOnDark },
      mark: { src: "/brand/ticklo-mark.png", ...sizes.mark },
      markOnDark: { src: "/brand/ticklo-mark-on-dark.png", ...sizes.markOnDark },
      appIcon: { src: "/brand/ticklo-app-icon-512.png", width: 512, height: 512 },
    },
    null,
    2,
  )} as const;
`;
  writeFileSync(web("lib/brand-assets.ts"), ts);
  console.log("Brand assets built:", sizes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

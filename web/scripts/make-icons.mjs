import sharp from "sharp";
// Regenerates the app icons (favicon, PWA icons, apple-touch-icon): node scripts/make-icons.mjs "$(pwd)"
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0B1F3A"/>
<g transform="translate(${pad ? 96 : 56} ${pad ? 96 : 56}) scale(${pad ? 0.625 : 0.78125})">
<path d="M64 168a40 40 0 0 0 40-40h304a40 40 0 0 0 40 40v176a40 40 0 0 0-40 40H104a40 40 0 0 0-40-40z" fill="none" stroke="#fff" stroke-width="32" stroke-linejoin="round"/>
<path d="m180 256 52 52 100-104" fill="none" stroke="#0F9D58" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
</g></svg>`;
writeFileSync(`${out}/app/icon.svg`, svg(false));
for (const [name, size, pad] of [["icon-192.png",192,false],["icon-512.png",512,false],["maskable-512.png",512,true]]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`${out}/public/icons/${name}`);
}
await sharp(Buffer.from(svg(true))).resize(180, 180).png().toFile(`${out}/app/apple-icon.png`);
console.log("icons written");

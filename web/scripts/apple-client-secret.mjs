#!/usr/bin/env node
/**
 * Make the "Secret Key (for OAuth)" that Supabase needs for Sign in with Apple (D-053).
 * Apple wants a JWT signed with your .p8 key, valid for at most 6 months, so run this
 * again before it expires and paste the new value in Supabase.
 *
 *   cd web && node scripts/apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICES_ID> <path/to/AuthKey_XXXX.p8>
 *
 * Runs only on this computer (no network). The secret is copied to the clipboard on
 * macOS instead of being printed; pass --print to print it.
 */
import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const print = args.includes("--print");
const [teamId, keyId, clientId, p8Path] = args.filter((a) => a !== "--print");
if (!teamId || !keyId || !clientId || !p8Path) {
  console.error("Usage: node scripts/apple-client-secret.mjs <TEAM_ID> <KEY_ID> <SERVICES_ID> <path/to/AuthKey.p8> [--print]");
  process.exit(1);
}
if (!/^[A-Z0-9]{10}$/.test(teamId)) console.warn(`Warning: Team ID "${teamId}" is usually 10 letters/digits.`);
if (!/^[A-Z0-9]{10}$/.test(keyId)) console.warn(`Warning: Key ID "${keyId}" is usually 10 letters/digits.`);

const key = createPrivateKey(readFileSync(p8Path, "utf8"));
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 3600; // Apple allows at most ~6 months
const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const payload = { iss: teamId, iat: now, exp, aud: "https://appleid.apple.com", sub: clientId };
const input = `${b64url(header)}.${b64url(payload)}`;
const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
const jwt = `${input}.${signature}`;

const expires = new Date(exp * 1000).toISOString().slice(0, 10);
const copied = !print && process.platform === "darwin" && spawnSync("pbcopy", { input: jwt }).status === 0;
if (copied) {
  console.log("Copied the Apple client secret to the clipboard.");
} else {
  console.log(jwt);
}
console.log(`Paste it in Supabase → Authentication → Sign In / Providers → Apple → "Secret Key (for OAuth)".`);
console.log(`Client IDs there: ${clientId}`);
console.log(`It expires on ${expires}. Make a new one a few days before that date.`);

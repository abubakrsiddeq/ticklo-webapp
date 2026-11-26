#!/usr/bin/env node
// Prints a Cookie header for a seed account, exactly as @supabase/ssr would set it.
// Used for local smoke tests of server-rendered pages:  node scripts/session-cookie.mjs student@ticklo.test
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const jar = new Map();
const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
  },
});
const { error } = await supabase.auth.signInWithPassword({ email: process.argv[2], password: process.argv[3] ?? "TickLO@12345" });
if (error) {
  console.error(error.message);
  process.exit(1);
}
process.stdout.write([...jar].map(([n, v]) => `${n}=${v}`).join("; "));

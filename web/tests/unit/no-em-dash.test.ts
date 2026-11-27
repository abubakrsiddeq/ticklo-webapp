import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Owner rule (D-058): no em dashes anywhere in the app's text or code.
const ROOT = path.resolve(import.meta.dirname, "../..");
const DIRS = ["app", "components", "lib", "emails", "public", "scripts", "tests", "../supabase/migrations", "../supabase/functions"];
const EXT = /\.(tsx?|mjs|cjs|js|json|css|md|txt|sql|html|svg)$/;
const EM_DASH = String.fromCharCode(0x2014);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(full);
  }
  return out;
}

describe("copy style", () => {
  it("has no em dashes", () => {
    const hits: string[] = [];
    for (const d of DIRS) {
      for (const file of walk(path.join(ROOT, d))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (line.includes(EM_DASH)) hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});

import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  if (process.env.SKIP_DB_RESET) return;
  const script = path.resolve(import.meta.dirname, "../../../scripts/db-reset-local.sh");
  execFileSync(script, [], {
    stdio: "inherit",
    env: { ...process.env, DB_NAME: process.env.TEST_DB_NAME ?? "ticklo_test" },
  });
}

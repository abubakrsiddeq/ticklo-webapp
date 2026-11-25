#!/usr/bin/env bash
# Recreate a scratch Postgres database with the Supabase stub + all TickLO
# migrations (+ seed). Used for DB tests and type generation without Docker.
#   DB_NAME=ticklo_test ./scripts/db-reset-local.sh [--no-seed]
set -euo pipefail
cd "$(dirname "$0")/.."
DB_NAME="${DB_NAME:-ticklo_test}"
export PGOPTIONS="--client-min-messages=warning"
dropdb --if-exists "$DB_NAME" >/dev/null
createdb "$DB_NAME"
psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f supabase/tests/local_stub.sql
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$f" || { echo "FAILED: $f"; exit 1; }
done
if [[ "${1:-}" != "--no-seed" ]]; then
  psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" -f supabase/seed.sql
fi
echo "Database $DB_NAME ready."

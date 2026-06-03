#!/usr/bin/env sh
#
# Apply the application schema (and optional seed data) to a running
# self-hosted Supabase Postgres.
#
# Run this AFTER `docker compose up -d` has fully started, so that the
# `auth` and `storage` schemas exist before app tables that reference
# auth.users(id) are created.
#
# Usage:
#   sh apply-schema.sh                 # applies schema/*.sql in sorted order
#   sh apply-schema.sh schema/0001_init.sql
#
set -e

cd "$(dirname "$0")"

# Read only the values we need from .env (avoid sourcing: some values
# contain spaces, e.g. STUDIO_DEFAULT_ORGANIZATION="Default Organization").
read_env() {
    [ -f .env ] || return 0
    grep -E "^$1=" .env | head -1 | cut -d= -f2-
}

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(read_env POSTGRES_PASSWORD)}"
DB="${POSTGRES_DB:-$(read_env POSTGRES_DB)}"
DB="${DB:-postgres}"
PGUSER="${PGUSER:-postgres}"

if [ "$#" -gt 0 ]; then
    files="$*"
else
    files="$(ls schema/*.sql 2>/dev/null | sort)"
fi

if [ -z "$files" ]; then
    echo "No SQL files found in schema/. Dump your cloud schema first (see RUNBOOK.md Phase 2)."
    exit 1
fi

for f in $files; do
    echo ">> Applying $f"
    docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" db \
        psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$DB" < "$f"
done

echo "Schema applied."

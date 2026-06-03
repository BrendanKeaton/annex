#!/usr/bin/env bash
#
# Stop the local Annex environment.
#
# By default this stops the Supabase Docker stack (data in the named volumes is
# PRESERVED). App processes (backend/webapp/desktop) are stopped by Ctrl+C in
# the start-local.sh terminal; this also sweeps up any strays.
#
# Usage:
#   ./stop-local.sh           # stop Supabase containers, keep data
#   ./stop-local.sh --wipe    # ALSO delete all Supabase data (volumes) — destructive
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$ROOT/infra/supabase"
NC=$'\033[0m'; B=$'\033[1m'; GRN=$'\033[1;32m'; YEL=$'\033[1;33m'

WIPE=0
[ "${1:-}" = "--wipe" ] && WIPE=1

# Best-effort stop of app dev servers still bound to local ports.
for port in 8000 3000 1420; do
  pid="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  [ -n "$pid" ] && { kill $pid 2>/dev/null || true; printf '%sstopped process on :%s%s\n' "$YEL" "$port" "$NC"; }
done

if [ "$WIPE" = 1 ]; then
  printf '%s⚠ Wiping ALL Supabase data (volumes)…%s\n' "$YEL" "$NC"
  ( cd "$SUPA" && docker compose down -v )
  rm -rf "$SUPA/volumes/db/data" "$SUPA/volumes/storage"
  printf '%sSupabase stopped and data wiped.%s\n' "$GRN" "$NC"
else
  ( cd "$SUPA" && docker compose down )
  printf '%sSupabase stopped (data preserved). Run ./start-local.sh to bring it back.%s\n' "$GRN" "$NC"
fi

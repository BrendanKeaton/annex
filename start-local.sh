#!/usr/bin/env bash
#
# Annex — one-command local development.
#
# Boots the self-hosted Supabase stack (Docker), then runs the FastAPI backend,
# the Next.js webapp, and the Tauri desktop app — installing all dependencies
# (python venv, npm) on first run. infra/supabase/.env is the single source of
# truth for Supabase URL/keys; this script syncs them into each app's env.
#
# Usage:
#   ./start-local.sh                 # supabase + backend + webapp + desktop
#   ./start-local.sh --no-desktop    # skip the Tauri desktop app
#   ./start-local.sh --no-webapp     # skip the Next.js webapp
#   ./start-local.sh --backend-only  # supabase + backend only
#   ./start-local.sh --reinstall     # force npm install / pip install
#
# Ctrl+C stops the app processes but LEAVES Supabase running (it's stateful and
# slow to reboot). Run ./stop-local.sh to tear the Docker stack down.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$ROOT/infra/supabase"
BACKEND="$ROOT/apps/backend"
WEBAPP="$ROOT/apps/webapp"
DESKTOP="$ROOT/apps/desktop"

RUN_BACKEND=1; RUN_WEBAPP=1; RUN_DESKTOP=1; REINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-desktop)   RUN_DESKTOP=0 ;;
    --no-webapp)    RUN_WEBAPP=0 ;;
    --backend-only) RUN_WEBAPP=0; RUN_DESKTOP=0 ;;
    --reinstall)    REINSTALL=1 ;;
    -h|--help)      grep '^#' "$0" | sed 's/^#//'; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# ----- pretty logging -------------------------------------------------------
NC=$'\033[0m'; B=$'\033[1m'; RED=$'\033[1;31m'; GRN=$'\033[1;32m'; YEL=$'\033[1;33m'
CY=$'\033[1;36m'; MAG=$'\033[1;35m'; BLU=$'\033[1;34m'
step() { printf '\n%s==> %s%s\n' "$B" "$1" "$NC"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$NC" "$1"; }
warn() { printf '%s! %s%s\n' "$YEL" "$1" "$NC"; }
die()  { printf '%s✗ %s%s\n' "$RED" "$1" "$NC" >&2; exit 1; }

# ----- env file helpers (cross-platform, sed-based) -------------------------
read_env() { # read_env <file> <KEY>
  [ -f "$1" ] && grep -E "^$2=" "$1" | head -1 | cut -d= -f2- || true
}
upsert_env() { # upsert_env <file> <KEY> <VALUE>
  local file="$1" key="$2" val="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "$file.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

# ----- background process tracking ------------------------------------------
PIDS=(); NAMES=()
kill_tree() { local p="$1" c; for c in $(pgrep -P "$p" 2>/dev/null || true); do kill_tree "$c"; done; kill "$p" 2>/dev/null || true; }
cleanup() {
  printf '\n%s==> Shutting down app processes (Supabase left running)…%s\n' "$B" "$NC"
  local i
  for i in "${!PIDS[@]}"; do kill_tree "${PIDS[$i]}"; done
  printf '%sStopped. Supabase is still up — run ./stop-local.sh to tear it down.%s\n' "$GRN" "$NC"
  exit 0
}
trap cleanup INT TERM

# Launch a long-running service in the background, prefixing each log line.
launch() { # launch <name> <color> <workdir> <cmd...>
  local name="$1" color="$2" dir="$3"; shift 3
  ( cd "$dir" && "$@" 2>&1 | while IFS= read -r line; do printf '%s[%s]%s %s\n' "$color" "$name" "$NC" "$line"; done ) &
  PIDS+=("$!"); NAMES+=("$name")
  ok "started $name (pid $!)"
}

# ============================================================================
step "1/5  Checking prerequisites"
missing=0
need() { command -v "$1" >/dev/null 2>&1 || { warn "missing: $1 — $2"; missing=1; }; }
need docker  "https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || { warn "missing: docker compose v2"; missing=1; }
need python3 "https://www.python.org/downloads/"
[ "$RUN_WEBAPP" = 1 ] || [ "$RUN_DESKTOP" = 1 ] && need npm "https://nodejs.org/"
[ "$RUN_DESKTOP" = 1 ] && need cargo "https://rustup.rs (required for the Tauri desktop app; use --no-desktop to skip)"
docker info >/dev/null 2>&1 || { warn "Docker daemon not running — start Docker Desktop"; missing=1; }
[ "$missing" = 0 ] || die "Install the missing prerequisites above and re-run."
ok "all prerequisites present"

# ============================================================================
step "2/5  Supabase (self-hosted Docker stack)"
# First-run: generate secrets if no .env yet.
if [ ! -f "$SUPA/.env" ]; then
  warn "no infra/supabase/.env — generating fresh secrets"
  cp "$SUPA/.env.example" "$SUPA/.env"
  ( cd "$SUPA" && sh utils/generate-keys.sh --update-env >/dev/null && sh utils/add-new-auth-keys.sh --update-env >/dev/null )
  sed -i.bak -E \
    -e 's|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|' \
    -e 's|^KONG_HTTP_PORT=.*|KONG_HTTP_PORT=54321|' \
    -e 's|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=http://localhost:54321|' \
    -e 's|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://localhost:54321|' \
    -e 's|^COMPOSE_FILE=.*|COMPOSE_FILE=docker-compose.yml:docker-compose.mail.yml|' \
    -e 's|^SMTP_PORT=.*|SMTP_PORT=1025|' \
    -e 's|^SMTP_USER=.*|SMTP_USER=|' \
    -e 's|^SMTP_PASS=.*|SMTP_PASS=|' \
    -e 's|^#? *GOOGLE_ENABLED=.*|GOOGLE_ENABLED=false|' \
    "$SUPA/.env" && rm -f "$SUPA/.env.bak"
  # GOOGLE_ENABLED must be a literal bool — docker-compose feeds it straight into
  # GOTRUE_EXTERNAL_GOOGLE_ENABLED, and GoTrue fatally crash-loops on an empty
  # value. Guarantee it's set even if .env.example ever drops the line.
  [ -n "$(read_env "$SUPA/.env" GOOGLE_ENABLED)" ] || upsert_env "$SUPA/.env" GOOGLE_ENABLED false
  ok "generated infra/supabase/.env (local dev secrets)"
fi

KONG_PORT="$(read_env "$SUPA/.env" KONG_HTTP_PORT)"; KONG_PORT="${KONG_PORT:-54321}"
PGPW="$(read_env "$SUPA/.env" POSTGRES_PASSWORD)"
SUPA_URL="http://localhost:${KONG_PORT}"

( cd "$SUPA" && docker compose up -d ) >/dev/null
printf '   waiting for database & gateway'
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$SUPA_URL/rest/v1/" -H "apikey: $(read_env "$SUPA/.env" SUPABASE_SECRET_KEY)" 2>/dev/null || true)"
  [ "$code" = "200" ] && { printf '\n'; ok "Supabase healthy at $SUPA_URL"; break; }
  printf '.'; sleep 2
  [ "$i" = 30 ] && { printf '\n'; die "Supabase did not become healthy — check: cd infra/supabase && docker compose logs"; }
done

# Apply schema on a fresh database (detect by absence of public.users).
have_users="$( ( cd "$SUPA" && docker compose exec -T -e PGPASSWORD="$PGPW" db psql -U postgres -tAc "select to_regclass('public.users')" 2>/dev/null ) | tr -d '[:space:]' || true )"
if [ -z "$have_users" ] || [ "$have_users" = "" ]; then
  warn "fresh database — applying schema + auth hook + seed"
  ( cd "$SUPA" && sh apply-schema.sh ) | tail -3
  ok "schema applied"
else
  ok "schema already present (public.users exists)"
fi

# ============================================================================
step "3/5  Syncing Supabase config into app envs (source of truth: infra/supabase/.env)"
PUB="$(read_env "$SUPA/.env" SUPABASE_PUBLISHABLE_KEY)"
SEC="$(read_env "$SUPA/.env" SUPABASE_SECRET_KEY)"

if [ "$RUN_BACKEND" = 1 ]; then
  [ -f "$BACKEND/.env" ] || cp "$BACKEND/.env.example" "$BACKEND/.env"
  upsert_env "$BACKEND/.env" SUPABASE_URL "$SUPA_URL"
  upsert_env "$BACKEND/.env" SUPABASE_KEY "$SEC"
  # backend refuses to start without RANDOM_AES_SEED — generate one if blank
  if [ -z "$(read_env "$BACKEND/.env" RANDOM_AES_SEED)" ]; then
    upsert_env "$BACKEND/.env" RANDOM_AES_SEED "$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
    warn "generated RANDOM_AES_SEED in apps/backend/.env"
  fi
  ok "apps/backend/.env synced"
fi
if [ "$RUN_WEBAPP" = 1 ]; then
  upsert_env "$WEBAPP/.env.local" NEXT_PUBLIC_SUPABASE_URL "$SUPA_URL"
  upsert_env "$WEBAPP/.env.local" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$PUB"
  ok "apps/webapp/.env.local synced"
fi
if [ "$RUN_DESKTOP" = 1 ]; then
  [ -f "$DESKTOP/src-tauri/.env" ] || cp "$DESKTOP/src-tauri/.env.example" "$DESKTOP/src-tauri/.env"
  upsert_env "$DESKTOP/src-tauri/.env" SUPABASE_URL "$SUPA_URL"
  ok "apps/desktop/src-tauri/.env synced"
fi

# ============================================================================
step "4/5  Installing dependencies"
if [ "$RUN_BACKEND" = 1 ]; then
  [ -d "$BACKEND/venv" ] || { printf '   creating python venv…\n'; python3 -m venv "$BACKEND/venv"; }
  printf '   installing backend requirements…\n'
  "$BACKEND/venv/bin/pip" install -q -r "$BACKEND/requirements.txt" || die "backend pip install failed (see error above)"
  ok "backend deps ready"
fi
if [ "$RUN_WEBAPP" = 1 ]; then
  if [ "$REINSTALL" = 1 ] || [ ! -d "$WEBAPP/node_modules" ]; then
    printf '   npm install (webapp)…\n'; ( cd "$WEBAPP" && npm install ) || die "webapp npm install failed"
  fi
  ok "webapp deps ready"
fi
if [ "$RUN_DESKTOP" = 1 ]; then
  if [ "$REINSTALL" = 1 ] || [ ! -d "$DESKTOP/node_modules" ]; then
    printf '   npm install (desktop)…\n'; ( cd "$DESKTOP" && npm install ) || die "desktop npm install failed"
  fi
  ok "desktop deps ready (first Tauri build compiles Rust — can take several minutes)"
fi

# ============================================================================
step "5/5  Launching apps"
[ "$RUN_BACKEND" = 1 ] && launch backend "$CY"  "$BACKEND" "$BACKEND/venv/bin/python" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --log-level warning
[ "$RUN_WEBAPP"  = 1 ] && launch webapp  "$MAG" "$WEBAPP"  npm run dev
[ "$RUN_DESKTOP" = 1 ] && launch desktop "$BLU" "$DESKTOP" npm run tauri dev

cat <<EOF

${GRN}${B}Annex is starting up.${NC}
  ${CY}backend${NC}   http://localhost:8000        (Swagger: /docs)
$( [ "$RUN_WEBAPP"  = 1 ] && printf '  %swebapp%s    http://localhost:3000\n' "$MAG" "$NC" )
$( [ "$RUN_DESKTOP" = 1 ] && printf '  %sdesktop%s   Tauri window (Vite dev on http://localhost:1420)\n' "$BLU" "$NC" )
  ${B}supabase${NC}  $SUPA_URL  (Studio dashboard — login from infra/supabase/.env)
  ${B}mail${NC}      http://localhost:8025        (Mailpit — captures invites/recovery/confirmation emails)

Press ${B}Ctrl+C${NC} to stop the apps. Supabase keeps running (./stop-local.sh to stop it).
EOF

wait

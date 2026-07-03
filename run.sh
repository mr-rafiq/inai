#!/usr/bin/env bash
#
# run.sh — Inai (இணை)
# Starts the backend (FastAPI) and frontend (Vite) dev servers together.
# Ctrl-C stops both cleanly. Run ./build.sh first.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -t 1 ]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'; else C_B=; C_G=; C_Y=; C_R=; C_0=; fi
say()  { printf '%s\n' "${C_B}▶ $*${C_0}"; }
ok()   { printf '%s\n' "${C_G}✓ $*${C_0}"; }
warn() { printf '%s\n' "${C_Y}! $*${C_0}"; }
die()  { printf '%s\n' "${C_R}✗ $*${C_0}" >&2; exit 1; }

BACKEND_HOST="${INAI_HOST:-127.0.0.1}"
BACKEND_PORT="${INAI_PORT:-8000}"
BACKEND_ONLY=0
FRONTEND_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --backend)  BACKEND_ONLY=1 ;;
    --frontend) FRONTEND_ONLY=1 ;;
    -h|--help)
      cat <<EOF
${C_B}run.sh${C_0} — start Inai's dev servers

Usage: ./run.sh [--backend | --frontend]

  --backend    Run only the FastAPI backend
  --frontend   Run only the Vite frontend
  -h, --help   Show this help

Env: INAI_HOST (default 127.0.0.1), INAI_PORT (default 8000)
EOF
      exit 0 ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

pids=()
cleanup() {
  printf '\n'; warn "Shutting down…"
  for pid in "${pids[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  ok "Stopped."
}
trap cleanup INT TERM EXIT

printf '%s\n' "${C_B}══════════ Running Inai (இணை) ══════════${C_0}"

# ---- backend ---------------------------------------------------------------
if [ "$FRONTEND_ONLY" -eq 0 ]; then
  if [ -d backend/app ] || [ -f backend/app/main.py ]; then
    say "Starting backend  →  http://${BACKEND_HOST}:${BACKEND_PORT}"
    (
      cd "$ROOT/backend"
      if command -v uv >/dev/null 2>&1; then
        exec uv run uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
      else
        # shellcheck disable=SC1091
        [ -d .venv ] && source .venv/bin/activate
        exec uvicorn app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
      fi
    ) &
    pids+=("$!")
  else
    warn "backend/app not found — run ./build.sh after Phase 1 is scaffolded"
  fi
fi

# ---- frontend --------------------------------------------------------------
if [ "$BACKEND_ONLY" -eq 0 ]; then
  if [ -f frontend/package.json ]; then
    say "Starting frontend →  http://localhost:5173"
    ( cd "$ROOT/frontend" && exec npm run dev ) &
    pids+=("$!")
  else
    warn "frontend/ not found — run ./build.sh after Phase 1 is scaffolded"
  fi
fi

if [ "${#pids[@]}" -eq 0 ]; then
  die "Nothing to run yet. Scaffold Phase 1, then ./build.sh && ./run.sh"
fi

ok "Running. Press Ctrl-C to stop."
wait

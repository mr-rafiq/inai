#!/usr/bin/env bash
#
# build.sh — Inai (இணை)
# Installs all dependencies and builds the app (backend + frontend, optional desktop shell).
# Safe to run repeatedly. Run this before ./run.sh.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- pretty output ---------------------------------------------------------
if [ -t 1 ]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_D=$'\033[2m'; C_0=$'\033[0m'; else C_B=; C_G=; C_Y=; C_R=; C_D=; C_0=; fi
say()  { printf '%s\n' "${C_B}▶ $*${C_0}"; }
ok()   { printf '%s\n' "${C_G}✓ $*${C_0}"; }
warn() { printf '%s\n' "${C_Y}! $*${C_0}"; }
die()  { printf '%s\n' "${C_R}✗ $*${C_0}" >&2; exit 1; }

BUILD_DESKTOP=0
for arg in "$@"; do
  case "$arg" in
    --desktop) BUILD_DESKTOP=1 ;;
    -h|--help)
      cat <<EOF
${C_B}build.sh${C_0} — install deps and build Inai

Usage: ./build.sh [--desktop]

  --desktop   Also build the Tauri desktop bundle (needs Rust toolchain)
  -h, --help  Show this help
EOF
      exit 0 ;;
    *) die "unknown option: $arg (try --help)" ;;
  esac
done

printf '%s\n' "${C_B}══════════ Building Inai (இணை) ══════════${C_0}"

# ---- prerequisites ---------------------------------------------------------
say "Checking prerequisites"
command -v python3 >/dev/null 2>&1 || die "python3 not found — install Python 3.11+"
command -v node    >/dev/null 2>&1 || warn "node not found — frontend build will be skipped (install Node 18+)"
command -v npm     >/dev/null 2>&1 || warn "npm not found — frontend build will be skipped"
ok "python3 $(python3 --version 2>&1 | awk '{print $2}')${C_D}$(command -v node >/dev/null 2>&1 && printf ', node %s' "$(node --version)")${C_0}"

# ---- backend ---------------------------------------------------------------
if [ -f backend/pyproject.toml ] || [ -f backend/requirements.txt ]; then
  say "Building backend (Python / FastAPI)"
  cd "$ROOT/backend"
  if command -v uv >/dev/null 2>&1; then
    uv sync
  else
    [ -d .venv ] || python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python -m pip install --upgrade pip >/dev/null
    if [ -f pyproject.toml ]; then pip install -e ".[dev]" 2>/dev/null || pip install -e .; fi
    [ -f requirements.txt ] && pip install -r requirements.txt
    deactivate
  fi
  cd "$ROOT"
  ok "Backend dependencies installed"
else
  warn "backend/ not scaffolded yet — skipping (Phase 1 not built)"
fi

# ---- frontend --------------------------------------------------------------
if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
  say "Building frontend (React / Vite)"
  cd "$ROOT/frontend"
  npm install
  npm run build
  cd "$ROOT"
  ok "Frontend built"
else
  warn "frontend/ not scaffolded yet — skipping (Phase 1 not built)"
fi

# ---- desktop shell (optional) ----------------------------------------------
if [ "$BUILD_DESKTOP" -eq 1 ]; then
  if [ -d shell ] && command -v cargo >/dev/null 2>&1; then
    say "Building desktop shell (Tauri)"
    (cd "$ROOT/frontend" && npm run tauri build)
    ok "Desktop bundle built"
  else
    warn "--desktop requested but shell/ or Rust toolchain missing — skipping"
  fi
fi

printf '%s\n' "${C_G}${C_B}✓ Build complete.${C_0} Next: ${C_B}./run.sh${C_0}"

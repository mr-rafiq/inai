#!/usr/bin/env bash
#
# test.sh — Inai (இணை)
# Runs the full test suite: backend (pytest) + frontend (Vitest), optional E2E (Playwright).
# Exits non-zero if any suite fails.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ -t 1 ]; then C_B=$'\033[1m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_0=$'\033[0m'; else C_B=; C_G=; C_Y=; C_R=; C_0=; fi
say()  { printf '%s\n' "${C_B}▶ $*${C_0}"; }
ok()   { printf '%s\n' "${C_G}✓ $*${C_0}"; }
warn() { printf '%s\n' "${C_Y}! $*${C_0}"; }
fail() { printf '%s\n' "${C_R}✗ $*${C_0}"; }

RUN_E2E=0
for arg in "$@"; do
  case "$arg" in
    --e2e) RUN_E2E=1 ;;
    -h|--help)
      cat <<EOF
${C_B}test.sh${C_0} — run Inai's test suite

Usage: ./test.sh [--e2e]

  --e2e        Also run Playwright end-to-end tests (slower)
  -h, --help   Show this help
EOF
      exit 0 ;;
    *) fail "unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

printf '%s\n' "${C_B}══════════ Testing Inai (இணை) ══════════${C_0}"
failures=0
ran=0

# ---- backend: pytest -------------------------------------------------------
if [ -d backend/tests ]; then
  say "Backend tests (pytest)"
  ran=1
  (
    cd "$ROOT/backend"
    if command -v uv >/dev/null 2>&1; then uv run pytest -q
    else
      # shellcheck disable=SC1091
      [ -d .venv ] && source .venv/bin/activate
      pytest -q
    fi
  ) || { fail "backend tests failed"; failures=$((failures+1)); }
else
  warn "backend/tests not found — skipping (Phase 1 not built)"
fi

# ---- frontend: vitest ------------------------------------------------------
if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
  say "Frontend unit tests (Vitest)"
  ran=1
  ( cd "$ROOT/frontend" && npm run test -- --run ) \
    || { fail "frontend tests failed"; failures=$((failures+1)); }
else
  warn "frontend/ not found or npm missing — skipping (Phase 1 not built)"
fi

# ---- e2e: playwright (opt-in) ----------------------------------------------
if [ "$RUN_E2E" -eq 1 ]; then
  if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
    say "End-to-end tests (Playwright)"
    ran=1
    ( cd "$ROOT/frontend" && npx playwright test ) \
      || { fail "e2e tests failed"; failures=$((failures+1)); }
  else
    warn "frontend/ not found — skipping E2E"
  fi
fi

printf '%s\n' "${C_B}─────────────────────────────────────────${C_0}"
if [ "$ran" -eq 0 ]; then
  warn "No test suites present yet. Scaffold Phase 1 first."
  exit 0
elif [ "$failures" -eq 0 ]; then
  ok "All test suites passed."
  exit 0
else
  fail "$failures suite(s) failed."
  exit 1
fi

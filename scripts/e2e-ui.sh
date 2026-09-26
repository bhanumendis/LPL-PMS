#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# The browser suite (src/test/ui, Playwright): the production bundle, built for a local
# lpl-api over the generated fixture, visited as every role at the eight release viewports
# (1440×900 … 360×800, and a phone turned sideways) with axe (WCAG 2.2 A/AA, contrast
# included), overflow and console checks, and a screenshot of every page for review
# (test-results/ui); then its Core Web Vitals, measured under Lighthouse's network and CPU
# conditions (src/test/ui/vitals.spec.ts).
#
#   E2E_DATABASE_URL=postgres://…/lpl_e2e [E2E_UI_SUITES="pages vitals"] scripts/e2e-ui.sh [playwright args]
#
# See scripts/lib/e2e-backend.sh for what happens to the database.
set -euo pipefail
cd "$(dirname "$0")/.."
UI_PORT="${E2E_UI_PORT:-4173}"
trap 'kill ${API_PID:-0} ${GOTRUE_PID:-0} ${WEB_PID:-0} 2>/dev/null || true; rm -f .e2e-lpl-api' EXIT
. scripts/lib/e2e-backend.sh

npx vite-node scripts/e2e-seed.ts .e2e-ui-manifest.json | psql "$DB_URL" -v ON_ERROR_STOP=1 -q
# The shipped bundle, not the dev server: same CSP, same production lockdown.
VITE_API_URL="http://127.0.0.1:$PORT" VITE_API_ANON_KEY="e2e-anon-key" npx vite build --logLevel warn
VITE_API_URL="http://127.0.0.1:$PORT" VITE_API_ANON_KEY="e2e-anon-key" node scripts/finalize.mjs
npx vite preview --port "$UI_PORT" --strictPort --host 127.0.0.1 > .e2e-ui-web.log 2>&1 &
WEB_PID=$!
for _ in $(seq 1 50); do curl -fsS "http://127.0.0.1:$UI_PORT/" >/dev/null 2>&1 && break; sleep 0.2; done

export LPL_UI_URL="http://127.0.0.1:$UI_PORT" LPL_E2E_PASSWORD="$E2E_PASSWORD" LPL_UI_MANIFEST=".e2e-ui-manifest.json"
# E2E_UI_SUITES picks what runs (default both; CI runs each in its own job): "pages" in
# parallel, then "vitals" (vitals.spec.ts) one test at a time, so what they time is the
# application and not the tests beside them (playwright.config.ts). Either failing fails.
status=0
for suite in ${E2E_UI_SUITES:-pages vitals}; do
  case "$suite" in
    pages) npx playwright test "$@" || status=$? ;;
    vitals) LPL_UI_RUN=vitals npx playwright test "$@" || status=$? ;;
    *) echo "unknown suite: $suite (pages, vitals)" >&2; exit 2 ;;
  esac
done
exit "$status"

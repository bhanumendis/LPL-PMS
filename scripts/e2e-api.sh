#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# The client end-to-end suite (src/test/e2e): the browser's server code path — scoped load,
# read model, per-case writes, change polling — against the real lpl-api and Postgres.
#
#   E2E_DATABASE_URL=postgres://…/lpl_e2e scripts/e2e-api.sh
#
# See scripts/lib/e2e-backend.sh: the database is dropped and recreated, and the suite signs
# its own tokens with the API's throwaway secret (no GoTrue is needed).
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill ${API_PID:-0} ${GOTRUE_PID:-0} 2>/dev/null || true; rm -f .e2e-lpl-api' EXIT
. scripts/lib/e2e-backend.sh

LPL_E2E_API_URL="http://127.0.0.1:$PORT" LPL_E2E_ANON_KEY="e2e-anon-key" LPL_E2E_JWT_SECRET="$SECRET" \
  npx vitest run --config vitest.e2e.config.ts "$@"

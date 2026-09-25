#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# Smoke test for a deployed lpl-api: the expected revision is the one answering (GET /version,
# waited for while the host rolls it out), the database is reachable (/readyz), the anon-key
# contract answers (needs_bootstrap is false on a live project) and the security headers are
# present. Exits non-zero on any failure, which triggers the automatic rollback in CI.
#   API_URL=https://api.example ANON_KEY=… EXPECT_REVISION=<sha> scripts/deploy/smoke-api.sh
set -euo pipefail
: "${API_URL:?API_URL}"
api="${API_URL%/}"
want="${EXPECT_REVISION-${GITHUB_SHA:-}}"   # set it empty to skip (a rollback restores an older build)
deadline=$(( $(date +%s) + ${SMOKE_TIMEOUT:-600} ))

if [ -n "$want" ]; then
  until got=$(curl -fsS --max-time 10 "$api/version" 2>/dev/null | jq -r .revision 2>/dev/null) && [ "$got" = "$want" ]; do
    [ "$(date +%s)" -ge "$deadline" ] && { echo "::error::$api/version still answers '${got:-nothing}', expected $want"; exit 1; }
    sleep 10
  done
  echo "revision $got is live"
fi

curl -fsS --max-time 10 "$api/healthz" | grep -qx ok || { echo "::error::/healthz"; exit 1; }
curl -fsS --max-time 20 "$api/readyz" | grep -qx ready || { echo "::error::/readyz: the database does not answer"; exit 1; }

if [ -n "${ANON_KEY:-}" ]; then
  body=$(curl -fsS --max-time 20 -X POST -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d '{}' "$api/rest/v1/rpc/needs_bootstrap")
  [ "$body" = "false" ] || { echo "::error::needs_bootstrap answered '$body' (expected false on a live project)"; exit 1; }
fi

headers=$(curl -fsS --max-time 10 -D - -o /dev/null "$api/healthz" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
for h in "x-content-type-options: nosniff" "strict-transport-security:"; do
  grep -q "^$h" <<< "$headers" || { echo "::error::missing header $h"; exit 1; }
done
echo "lpl-api smoke test passed"

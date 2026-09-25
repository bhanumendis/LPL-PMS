#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# Smoke test for the deployed web application: the page and the service worker are served,
# the page is this build (its Content-Security-Policy admits exactly the configured API) and
# carries the attribution.
#   PAGE_URL=https://owner.github.io/repo/ VITE_API_URL=https://api.example scripts/deploy/smoke-web.sh
set -euo pipefail
: "${PAGE_URL:?PAGE_URL}" "${VITE_API_URL:?VITE_API_URL}"
page="${PAGE_URL%/}/"
origin=$(node -e 'console.log(new URL(process.argv[1]).origin)' "$VITE_API_URL")
html=""
for _ in $(seq 1 30); do
  html=$(curl -fsS --max-time 15 "$page" 2>/dev/null) && grep -q "connect-src $origin" <<< "$html" && break
  sleep 10
done
grep -q "connect-src $origin" <<< "$html" || { echo "::error::$page is not this build (no connect-src $origin)"; exit 1; }
grep -q "Developed by Bhanu Mendis - Group IT" <<< "$html" || { echo "::error::attribution missing"; exit 1; }
curl -fsS --max-time 15 -o /dev/null "${page}sw.js" || { echo "::error::sw.js is not served"; exit 1; }
echo "web smoke test passed: $page"

#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# Points $IMAGE:production at an image (a tag or a digest), then asks the host to pull it
# through API_DEPLOY_HOOK when one is configured. Used by CI (deploy and automatic rollback)
# and by the rollback workflow.
#   IMAGE=ghcr.io/<owner>/lpl-api scripts/deploy/promote.sh ghcr.io/<owner>/lpl-api:sha-<sha>
set -euo pipefail
ref="${1:?usage: promote.sh <image tag or digest>}"
: "${IMAGE:?IMAGE is the repository, e.g. ghcr.io/owner/lpl-api}"
docker buildx imagetools create --tag "$IMAGE:production" "$ref"
echo "$IMAGE:production -> $ref"
if [ -n "${DEPLOY_HOOK:-}" ]; then
  curl -fsS --max-time 30 -X POST "$DEPLOY_HOOK" > /dev/null
  echo "Deploy hook called."
else
  echo "::notice::No API_DEPLOY_HOOK: the host must pull $IMAGE:production itself (auto-deploy on tag change)."
fi

#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# Deploy rehearsal: CI's deploy-api path, run on every pull request against throwaway parts so
# a broken image, script or gate shows up before main needs it. It builds the lpl-api image and
# publishes it to a local registry; records what production runs and promotes with the same
# script and commands the pipeline uses; runs the image in production mode against a database
# loaded from supabase/schema.sql and requires the smoke test to pass. Then it takes the newest
# migration away and requires the smoke test to fail (the schema gate that rolls back an API
# deployed ahead of its migrations), and rolls back by digest as the pipeline does.
#
#   REHEARSAL_DATABASE_URL=postgres://…/lpl_rehearsal REGISTRY=localhost:5000 scripts/deploy/rehearse.sh
#
# The database named in REHEARSAL_DATABASE_URL is dropped and recreated: a name that does not
# contain "rehearsal" is refused. REGISTRY is a registry the rehearsal may write to (CI starts
# registry:2 on localhost:5000). REHEARSAL_SKIP_BUILD=1 uses an image already in the local
# daemon as $REGISTRY/lpl-api:sha-$REVISION instead of building one.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${REHEARSAL_DATABASE_URL:?set REHEARSAL_DATABASE_URL to a disposable database whose name contains rehearsal}"
DB_NAME="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//[^/]*/([^?]+).*#\1#')"
case "$DB_NAME" in *rehearsal*) ;; *) echo "refusing to recreate database '$DB_NAME': its name must contain rehearsal" >&2; exit 2 ;; esac
ADMIN_URL="${DB_URL/\/$DB_NAME/\/postgres}"
REVISION="${REVISION:-$(git rev-parse HEAD)}"
PORT="${REHEARSAL_PORT:-8095}"
IMAGE="${REGISTRY:-localhost:5000}/lpl-api"
export IMAGE
container="lpl-rehearsal-$$"
api="http://127.0.0.1:$PORT"
anon="rehearsal-anon-key"
trap 'docker logs "$container" > .rehearsal-lpl-api.log 2>&1 || true; docker rm -f "$container" > /dev/null 2>&1 || true' EXIT
digest() { docker buildx imagetools inspect "$1" --format '{{json .Manifest}}' 2>/dev/null | jq -r '.digest // empty' || true; }
# The linux/amd64 image a reference resolves to. A tag may hold the image itself or an index
# around it (promote.sh's imagetools writes an index when the source is a plain image, as
# Docker 28 pushes), and either way it is the same image.
image_of() {
  local raw
  raw=$(docker buildx imagetools inspect "$1" --raw 2> /dev/null) || return 0
  if jq -e '.manifests' > /dev/null <<< "$raw"; then
    jq -r '[.manifests[] | select(.platform.os == "linux" and .platform.architecture == "amd64")][0].digest // empty' <<< "$raw"
  else
    digest "$1"
  fi
}

echo "== database: supabase/schema.sql, bootstrapped as a live project is"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\""
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f server/test/sql/auth_shim.sql 2> /dev/null
PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.group_it_domains (domain, note) values ('rehearsal.invalid', 'deploy rehearsal') on conflict do nothing;
insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('root@rehearsal.invalid', '{"name":"Rehearsal"}', now());
SQL

echo "== image: build and publish $IMAGE:sha-$REVISION"
if [ -z "${REHEARSAL_SKIP_BUILD:-}" ]; then
  docker build --quiet --build-arg REVISION="$REVISION" --tag "$IMAGE:sha-$REVISION" server > /dev/null
fi
docker push --quiet "$IMAGE:sha-$REVISION" > /dev/null

echo "== promote, as deploy-api does"
before="$(digest "$IMAGE:production")"
echo "production ran: ${before:-nothing}"
scripts/deploy/promote.sh "$IMAGE:sha-$REVISION"
now="$(digest "$IMAGE:production")"   # what deploy-api records as the rollback target
if [ -z "$now" ] || [ "$(image_of "$IMAGE:production")" != "$(image_of "$IMAGE:sha-$REVISION")" ]; then
  echo "::error::$IMAGE:production does not point at the new image"; exit 1
fi

echo "== run $IMAGE:production in production mode"
docker pull --quiet "$IMAGE:production" > /dev/null
docker run --detach --name "$container" --network host \
  -e LISTEN_ADDR="127.0.0.1:$PORT" -e DATABASE_URL="$DB_URL" -e GOTRUE_URL="https://auth.rehearsal.invalid" \
  -e ANON_KEY="$anon" -e SERVICE_ROLE_KEY="rehearsal-service-key" -e JWT_SECRET="rehearsal-secret-$REVISION" \
  -e CORS_ALLOW_ORIGINS="https://pms.rehearsal.invalid" "$IMAGE:production" > /dev/null
for _ in $(seq 1 50); do curl -fsS "$api/healthz" > /dev/null 2>&1 && break; sleep 0.2; done

echo "== smoke test: must pass"
API_URL="$api" ANON_KEY="$anon" EXPECT_REVISION="$REVISION" SMOKE_TIMEOUT=60 scripts/deploy/smoke-api.sh

echo "== schema gate: without the newest migration the smoke test must fail"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "delete from public.schema_migrations where version = (select max(version) from public.schema_migrations)"
if refusal=$(API_URL="$api" ANON_KEY="$anon" EXPECT_REVISION="" SMOKE_TIMEOUT=5 scripts/deploy/smoke-api.sh 2>&1); then
  echo "::error::the smoke test passed against a database behind this build's schema"; exit 1
fi
echo "refused, as it must be: ${refusal#::error::}"

echo "== roll back by digest, as the automatic rollback does"
scripts/deploy/promote.sh "$IMAGE@$now"
[ "$(image_of "$IMAGE:production")" = "$(image_of "$IMAGE@$now")" ] || { echo "::error::promoting by digest did not move $IMAGE:production"; exit 1; }

echo "deploy rehearsal passed: $IMAGE:sha-$REVISION"

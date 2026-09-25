#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# The client end-to-end suite (src/test/e2e): the browser's server code path — scoped load,
# read model, per-case writes, change polling — against the real lpl-api and Postgres.
#
#   E2E_DATABASE_URL=postgres://…/lpl_e2e scripts/e2e-api.sh
#
# The database named in E2E_DATABASE_URL is dropped and recreated (never point it at data you
# want to keep; the script refuses a name that does not contain "e2e"). The API runs with a
# throwaway JWT secret, and the suite signs its own tokens with it (no GoTrue is needed).
set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="${E2E_DATABASE_URL:?set E2E_DATABASE_URL to a disposable database whose name contains e2e}"
DB_NAME="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//[^/]*/([^?]+).*#\1#')"
case "$DB_NAME" in *e2e*) ;; *) echo "refusing to recreate database '$DB_NAME': its name must contain e2e" >&2; exit 2 ;; esac
ADMIN_URL="${DB_URL/\/$DB_NAME/\/postgres}"
PORT="${E2E_PORT:-8089}"
SECRET="e2e-secret-$(date +%s)-at-least-thirty-two-characters"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\""
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f server/test/sql/auth_shim.sql
PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
# Two identities: the first sign-up on a Group IT address becomes SUPER ADMIN (the bootstrap
# trigger), and counsellor c1 is provisioned as the admin-users function would.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.group_it_domains (domain, note) values ('test.local', 'e2e suite') on conflict do nothing;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  values ('00000000-0000-0000-0000-00000000a001', 'root@test.local', '{"name":"Root Admin"}', now());
insert into public.app_users (id, email, name, role, active, created_at) values ('c1', 'c1@test.local', 'Counsellor One', 'counsellor', true, now());
insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
  values ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', '{"provisioned":"admin-users","app_user_id":"c1"}', now());
SQL

(cd server && go build -o ../.e2e-lpl-api ./cmd/lpl-api)
LISTEN_ADDR="127.0.0.1:$PORT" DATABASE_URL="$DB_URL" GOTRUE_URL="http://127.0.0.1:9" ANON_KEY="e2e-anon-key" \
  SERVICE_ROLE_KEY="e2e-service-key" JWT_SECRET="$SECRET" APP_ENV=development CORS_ALLOW_ORIGINS="*" \
  RATE_LIMIT_API_PER_MINUTE=100000 ./.e2e-lpl-api > .e2e-lpl-api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true; rm -f .e2e-lpl-api' EXIT
for _ in $(seq 1 50); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null

LPL_E2E_API_URL="http://127.0.0.1:$PORT" LPL_E2E_ANON_KEY="e2e-anon-key" LPL_E2E_JWT_SECRET="$SECRET" \
  npx vitest run --config vitest.e2e.config.ts "$@"

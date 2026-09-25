# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# Sourced by scripts/e2e-api.sh and scripts/e2e-ui.sh: a disposable Postgres database with
# supabase/schema.sql, the SUPER ADMIN (first sign-up on the Group IT domain test.local) and
# counsellor c1, and lpl-api built from source and listening on 127.0.0.1:$PORT with a
# throwaway JWT secret, behind a GoTrue stand-in. Exports DB_URL, PORT, SECRET, E2E_PASSWORD,
# API_PID and GOTRUE_PID; the caller's EXIT trap stops them.
#
# The database named in E2E_DATABASE_URL is dropped and recreated: never point it at data you
# want to keep. A name that does not contain "e2e" is refused.

DB_URL="${E2E_DATABASE_URL:?set E2E_DATABASE_URL to a disposable database whose name contains e2e}"
DB_NAME="$(printf '%s' "$DB_URL" | sed -E 's#^[^/]*//[^/]*/([^?]+).*#\1#')"
case "$DB_NAME" in *e2e*) ;; *) echo "refusing to recreate database '$DB_NAME': its name must contain e2e" >&2; exit 2 ;; esac
ADMIN_URL="${DB_URL/\/$DB_NAME/\/postgres}"
PORT="${E2E_PORT:-8089}"
SECRET="e2e-secret-$(date +%s)-at-least-thirty-two-characters"
export DB_URL PORT SECRET

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\""
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f server/test/sql/auth_shim.sql 2>/dev/null
PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.group_it_domains (domain, note) values ('test.local', 'e2e suite') on conflict do nothing;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  values ('00000000-0000-0000-0000-00000000a001', 'root@test.local', '{"name":"Root Admin"}', now());
insert into public.app_users (id, email, name, role, active, created_at) values ('c1', 'c1@test.local', 'Counsellor One', 'counsellor', true, now());
insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
  values ('00000000-0000-0000-0000-0000000000c1', 'c1@test.local', '{"provisioned":"admin-users","app_user_id":"c1"}', now());
SQL

# GoTrue stand-in (scripts/lib/fake-gotrue.mjs): every seeded account signs in with E2E_PASSWORD.
E2E_PASSWORD="e2e-Password-1"
GOTRUE_PORT="${E2E_GOTRUE_PORT:-9998}"
export E2E_PASSWORD
JWT_SECRET="$SECRET" E2E_PASSWORD="$E2E_PASSWORD" FAKE_GOTRUE_PORT="$GOTRUE_PORT" E2E_ACCOUNTS='{
  "root@test.local": "00000000-0000-0000-0000-00000000a001", "admin@test.local": "00000000-0000-0000-0000-00000000a002",
  "tl@test.local": "00000000-0000-0000-0000-00000000a003", "c1@test.local": "00000000-0000-0000-0000-0000000000c1",
  "student@test.local": "00000000-0000-0000-0000-00000000a005"}' node scripts/lib/fake-gotrue.mjs > .e2e-gotrue.log 2>&1 &
GOTRUE_PID=$!
export GOTRUE_PID

(cd server && go build -o ../.e2e-lpl-api ./cmd/lpl-api)
LISTEN_ADDR="127.0.0.1:$PORT" DATABASE_URL="$DB_URL" GOTRUE_URL="http://127.0.0.1:$GOTRUE_PORT" ANON_KEY="e2e-anon-key" \
  SERVICE_ROLE_KEY="e2e-service-key" JWT_SECRET="$SECRET" APP_ENV=development CORS_ALLOW_ORIGINS="*" \
  RATE_LIMIT_API_PER_MINUTE=100000 RATE_LIMIT_AUTH_PER_MINUTE=100000 ./.e2e-lpl-api > .e2e-lpl-api.log 2>&1 &
API_PID=$!
export API_PID
for _ in $(seq 1 50); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null

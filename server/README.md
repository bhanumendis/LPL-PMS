# lpl-api — the Placement Management System's backend, in Go

Copyright © Bhanu Mendis - LGH IT

`lpl-api` is one Go binary that serves the wire contract the single-file frontend already
speaks (`src/lib/server.ts`) in place of Supabase's request path:

| Path | What it does | Replaces |
|---|---|---|
| `/rest/v1/{table}`, `/rest/v1/rpc/{fn}` | The PostgREST subset the frontend uses, executed under the caller's Postgres role and JWT claims so row-level security and the guard triggers in `supabase/schema.sql` keep deciding everything | PostgREST |
| `/auth/v1/*` | Reverse proxy to GoTrue, unchanged | nothing (GoTrue stays) |
| `/functions/v1/admin-users` | The account-administration function, same contract, status codes and messages | the `admin-users` Edge Function |
| background workers | Web Push delivery, service-level reminders, the shared dashboard, the case order stamps, notification retention (`internal/workers`) | the `push-dispatch` Edge Function and pg_cron |

The Edge Functions' source was removed from the repository in v6 (it is in the git history
before that commit); nothing calls them once the browser talks to lpl-api.

**Status (25 September 2026, v6):** builds with the pinned Go toolchain (`go.mod`,
`toolchain go1.26.8`); gofmt, `go vet`, staticcheck and govulncheck run in CI; the unit,
integration (row-level security, paging, parity with the TypeScript reference, workers) and
migration suites pass against Postgres 16 under `-race`, and the client and browser
end-to-end suites run against this binary. It has not yet served a live Supabase project:
`docs/CUTOVER.md` is the path to production. `GET /version` reports the build's revision.

## Layout

```
cmd/lpl-api        the service
cmd/lpl-dbtool     apply a SQL file, ping, mint a local HS256 token (no psql needed)
cmd/lpl-record     recording reverse proxy for golden traffic (see docs/PARITY.md)
internal/config    environment → Config
internal/auth      anon key and JWT verification (HS256 secret, ES256/RS256 via JWKS)
internal/db        the per-request transaction that SETs the role and installs the claims
internal/contract  allow-list: tables, columns, RPCs, query grammar, Prefer
internal/httpapi   router, middleware, handlers, PostgREST/GoTrue-shaped errors
internal/gotrue    GoTrue admin API client
internal/parity    golden record format and normaliser
internal/webpush   Web Push: RFC 8291 encryption, RFC 8292 VAPID, the push-service request
internal/workers   background jobs: push delivery, reminders, dashboard refresh, case order stamps, pruning
internal/schema    the newest migration this build needs (GET /readyz refuses a database without it)
test/sql           auth shim so schema.sql runs on a plain Postgres (tests only)
test/integration   RLS, guard, attribution, paging, admin-users and worker tests against a real Postgres
test/contract      golden replay harness
docs/              plan, ADR, parity and cutover notes
```

Not present on purpose: `pkg/` (no external consumers), a repository layer (the façade is
the data layer), domain packages (business rules stay where they are today, in the browser
and in the SQL guards), migrations (they live in `supabase/migrations/`), typed case
documents (`cases.data` passes through as opaque JSON).

## Build and test

```bash
cd server
go mod tidy                 # first run: resolves pgx and writes go.sum
go build ./...
go vet ./...
go test ./...               # unit tests; the integration suite skips without a database
```

Integration suite against a throwaway Postgres (Docker):

```bash
docker run -d --name lpl-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable" go test -race -count=1 ./...
```

The suite applies `test/sql/auth_shim.sql` and `../supabase/schema.sql` itself, then checks
the permission matrix cell for cell against the TypeScript defaults, case visibility by
scope, the student and gate rules inside the case JSON with their exact messages, audit
attribution, `next_case_ref`, `workspace_version`, the admin-users flow, and that the
contract's column list matches the live catalogue.

## Run

```bash
cp .env.example .env        # fill in DATABASE_URL, GOTRUE_URL, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET or JWKS_URL
set -a; . ./.env; set +a
go run ./cmd/lpl-api
curl -s localhost:8080/healthz
curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -d '{}' localhost:8080/rest/v1/rpc/needs_bootstrap
```

Against a Supabase project, `GOTRUE_URL` is `https://<ref>.supabase.co/auth/v1`,
`DATABASE_URL` is the project's connection string (session pooler on 5432 or transaction
pooler on 6543), and the database role must be able to `SET ROLE` to `anon`, `authenticated`
and `service_role` (the project's `postgres` and `authenticator` roles can).

`docker-compose.yml` sketches a fully local stack (Supabase's Postgres image, GoTrue,
lpl-api); it has not been exercised yet.

## Background work

Every replica runs the workers unless `WORKERS=false`; they coordinate through the database,
so two replicas never deliver a notification twice.

| Job | Every | What it does |
|---|---|---|
| push | `PUSH_INTERVAL` (10 s) | Claims undelivered notifications with a lease (`push_claim`, `FOR UPDATE SKIP LOCKED`), encrypts each for every active device of an active recipient and posts it to the push service; settles the outcome (`push_settle`). Transient failures back off (30 s, 2 min, 8 min, 32 min) and give up after five attempts; 404/410 revoke the subscription. A notification older than a day is not sent. Off without VAPID keys. |
| reminders | `SLA_REMINDER_INTERVAL` (15 min) | `emit_sla_notifications()`: a reminder for every clock that is due soon or breached, once per clock, state and due date. One replica at a time (advisory lock). |
| dashboard | `DASHBOARD_REFRESH_INTERVAL` (1 min) | `dashboard_refresh()`: recomputes the shared all-cases dashboard and the shared approval statistics when cases or configuration changed or they are four minutes old, so no reader waits for them. |
| case order stamps | `RESTAMP_INTERVAL` (10 s) | `case_restamp_due()`: retakes the stamps behind the severity, urgency and retention orders once their window has closed (most close together at 00:00 UTC, when every date-only deadline turns: about 6 s per 100,000 cases) and all of them after the service levels change, in batches of 20,000 within 30 s a tick. One replica at a time (advisory lock). A page evaluates any stale case live meanwhile; beyond 5,000 stale cases it evaluates every case, as before stamps. |
| retention | `PRUNE_INTERVAL` (6 h) | Deletes notifications older than `NOTIFICATION_RETENTION_DAYS` (90) in batches of 5,000, and subscriptions revoked more than 30 days ago. |

The push dispatcher posts only to https endpoints on the push-service allow-list
(`PUSH_ENDPOINT_HOSTS`, default FCM, Mozilla, Apple and WNS) and never follows a redirect:
an endpoint is a URL a signed-in user supplied, and must not become a way to make the server
call an address inside the network. The functions the workers call are executable by
`service_role` only.

## Security model, in one paragraph

Every `/rest/v1` request runs inside one transaction that executes `SET LOCAL ROLE
anon|authenticated` and installs `request.jwt.claims` (plus the `.claim.sub` and `.claim.role`
spellings) from the verified token, exactly as PostgREST does. `auth.uid()`, every RLS
policy and every guard trigger therefore behave as they were audited. System work (the
profile lookup and identity link inside admin-users) runs as `service_role` with no claims,
which is what the Edge Function's service key did, and so do the workers. A `service_role` token presented by a
client is refused on this listener; the browser never sends one. The service role key is
used only server-to-GoTrue.

## Configuration

See `.env.example`. Everything is validated at start and every problem is reported at once.

## Errors

Refusals use PostgREST's envelope (`{code, details, hint, message}`) and its status mapping
(`42501` → 403, or 401 for anonymous; `P0001` → 400 with the trigger's message verbatim;
`23505`/`23503` → 409; unknown function → 404 `PGRST202`, which the frontend reads as
"schema not run"). The gateway's `apikey` check answers with Kong's wording. admin-users
answers `{error}` / `{auth_id}` as the Edge Function did.

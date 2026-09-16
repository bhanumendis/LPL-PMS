# lpl-api — the Placement Management System's backend, in Go

Copyright (c) 2026 Bhanu Mendis. All rights reserved.

`lpl-api` is one Go binary that serves the wire contract the single-file frontend already
speaks (`src/lib/server.ts`) in place of Supabase's request path:

| Path | What it does | Replaces |
|---|---|---|
| `/rest/v1/{table}`, `/rest/v1/rpc/{fn}` | The PostgREST subset the frontend uses, executed under the caller's Postgres role and JWT claims so row-level security and the guard triggers in `supabase/schema.sql` keep deciding everything | PostgREST |
| `/auth/v1/*` | Reverse proxy to GoTrue, unchanged | nothing (GoTrue stays) |
| `/functions/v1/admin-users` | The account-administration function, same contract, status codes and messages | the Deno Edge Function |

Nothing about the database changes. Nothing about the frontend changes except one
Content-Security-Policy line at build time (see Cutover).

**Status (12 September 2026):** builds with Go 1.27.1; `go vet`, `staticcheck` and
`govulncheck` are clean; every unit suite passes. The integration suite and the golden
replay have not run yet: there is no Postgres on the build machine and no Supabase project
exists. See `docs/PHASE2_PLAN.md`.

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
test/sql           auth shim so schema.sql runs on a plain Postgres (tests only)
test/integration   RLS, guard, attribution and admin-users tests against a real Postgres
test/contract      golden replay harness
docs/              plan, ADR, parity and cutover notes
```

Not present on purpose: `pkg/` (no external consumers), a repository layer (the façade is
the data layer), domain packages (business rules stay where they are today, in the browser
and in the SQL guards), migrations (`supabase/schema.sql` stays canonical), typed case
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

## Security model, in one paragraph

Every `/rest/v1` request runs inside one transaction that executes `SET LOCAL ROLE
anon|authenticated` and installs `request.jwt.claims` (plus the `.claim.sub` and `.claim.role`
spellings) from the verified token, exactly as PostgREST does. `auth.uid()`, every RLS
policy and every guard trigger therefore behave as they were audited. System work (the
profile lookup and identity link inside admin-users) runs as `service_role` with no claims,
which is what the Edge Function's service key did. A `service_role` token presented by a
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

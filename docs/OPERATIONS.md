# Operations — Lyceum Placements PMS

Developed by Bhanu Mendis - Group IT

How the system is built, released, rolled back and run. The pipeline lives in
`.github/workflows/` (`ci.yml`, `rollback.yml`, `migrate.yml`); scripts in `scripts/`.

## What runs where

| Part | What it is | Where |
|---|---|---|
| Web application | One HTML file plus `sw.js` (Web Push), built for exactly one API origin; its Content-Security-Policy admits nothing else | GitHub Pages (`deploy-web`), or any static host serving `dist/` |
| lpl-api | Go service (`server/`): the data API under row-level security, the GoTrue proxy, account administration, and the background workers (push, reminders, dashboard, retention) | Container `ghcr.io/<owner>/lpl-api`, any container host |
| Database and identity | Postgres (`supabase/schema.sql`) and GoTrue | Supabase project (Singapore region) |

## One-time setup (repository administrator)

1. **Branch protection on `main`:** require pull requests with one approving review, and the
   status checks *Web · types, lint, unit, contrast, build, budget*, *Server · format, vet,
   staticcheck, govulncheck, unit and integration*, *End to end · API client and browser*,
   and *Secret scan · full history*. Disallow force pushes.
2. **Environments** (Settings → Environments):
   - `production` — required reviewers: Group IT. Variables: `API_URL` (the lpl-api origin),
     `VITE_API_ANON_KEY`. Secret (optional): `API_DEPLOY_HOOK`, a URL the host exposes to pull
     `lpl-api:production` (without it the host must follow the tag itself).
   - `github-pages` — created by enabling Pages with *Source: GitHub Actions*.
   - `production-db` — required reviewers: Group IT. Secret: `PRODUCTION_DATABASE_URL`.
3. **Repository variables:** `VITE_API_URL` (the lpl-api origin, https), `VITE_API_ANON_KEY`
   (the public anon key, never the service key; the build refuses a service-role key),
   optionally `LPL_CONNECT_SRC` (extra origins, space-separated, during a cutover).
   Until `VITE_API_URL` is set, `deploy-web` is skipped; until `API_URL` is set, the image is
   published but not promoted.
4. **lpl-api runtime configuration** lives on the container host, never in the repository:
   `DATABASE_URL`, `GOTRUE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` or `JWKS_URL`,
   `CORS_ALLOW_ORIGINS` (the web origin), `TRUSTED_PROXY_HOPS`, and for Web Push
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Every variable is documented in
   `server/.env.example`; the service refuses to start on anything missing or unsafe.

## Releasing

Every push and pull request runs the gates: typecheck, lint, 184 unit and component tests,
contrast, schema and parity-fixture freshness, attribution, `npm audit` of production
dependencies, production build and bundle budget; Go formatting, vet, staticcheck, govulncheck
and the unit, integration and migration suites against Postgres 16; the end-to-end suites (the
client against lpl-api, and the production bundle visited as every role at seven viewports plus
dark with axe); and a secret scan of the full history.

A merge to `main` that passes all of them:

1. publishes `ghcr.io/<owner>/lpl-api:sha-<commit>` (and `:main`) with provenance;
2. **deploy-api** (waits for approval in `production`) records the image production runs now,
   points `:production` at the new one, calls the deploy hook, and smoke-tests: the new
   revision answers `GET /version`, `/readyz` reaches the database, `needs_bootstrap` is false,
   and the security headers are present. **If the smoke test fails, `:production` is pointed
   back at the recorded image automatically** and the job fails;
3. **deploy-web** builds the bundle for `VITE_API_URL`, deploys it to Pages and checks the live
   page is this build (its CSP admits exactly the API) and that `sw.js` is served.

The API goes first because a new web build may call a new API.

## Rolling back

Actions → **Rollback** → the full SHA of a commit on `main` whose CI passed, and the target
(`both`, `api`, `web`). The API is re-pointed at that commit's published image (nothing is
rebuilt, so what runs is exactly what passed the gates) and smoke-tested; the web application
is rebuilt from that commit and redeployed. The workflow refuses a commit without a
successful CI run on `main`.

Database migrations are not rolled back: each is additive and the previous release runs
against the newer schema.

## Database migrations

Migrations live in `supabase/migrations/`, one file per version, idempotent, each recording
itself in `public.schema_migrations`. `supabase/schema.sql` is generated from them
(`node scripts/build-schema.mjs`) for a new project; CI proves a fresh install and an upgrade
end in the same catalogue.

To migrate production: take a backup (Supabase → Database → Backups, or confirm
point-in-time recovery is on), then Actions → **Migrate database** with *apply* unticked to
list what is pending; run again with *apply* ticked and the confirmation typed. Each file runs
in its own transaction; the first failure stops the run and leaves the database at the last
completed version. Migrate **before** merging a release that depends on the new schema.

The v6 release (from v5): migrate (v6 write path, RBAC, case index with its backfill, workers,
attribution), then deploy lpl-api, then the web application, then retire the Edge Functions
and cron jobs in the order `server/docs/CUTOVER.md` gives. The case index migration re-derives
every case's summary once; on a large project run it in a quiet hour.

## Running it

- **Health:** `GET /healthz` (process), `GET /readyz` (database), `GET /version` (revision).
- **Logs:** JSON on stdout. Every request logs method, path, status, duration and
  `request_id` (also returned as `X-Request-Id`); the workers log `worker failed` at ERROR,
  undeliverable pushes at WARN (`push not delivered` with the push service's status) and
  a warning when the VAPID key in Settings differs from the server's.
- **Alert on:** `/readyz` failing; any `worker failed`; a sustained 5xx rate; `push not
  delivered` with status 401/403 (a VAPID key problem, every push is failing).
- **Scale-out:** run as many lpl-api replicas as needed; push delivery leases rows, reminders
  and retention take advisory locks, and the dashboard refresh is single-flighted, so replicas
  never duplicate work. `WORKERS=false` makes a replica serve requests only.
- **Rate limits** are per client IP and per replica (`RATE_LIMIT_*`); set `TRUSTED_PROXY_HOPS`
  to the number of proxies in front, or every client shares the proxy's budget.

## Verifying locally

```bash
npm ci
npm run verify                         # typecheck, lint, unit tests, contrast
cd server && go test -race ./... && cd ..   # add TEST_DATABASE_URL for the integration suites
E2E_DATABASE_URL=postgres://…/lpl_e2e scripts/e2e-api.sh   # client against lpl-api
E2E_DATABASE_URL=postgres://…/lpl_e2e scripts/e2e-ui.sh    # browser suite, screenshots in test-results/ui
node scripts/check-attribution.mjs && node scripts/check-bundle.mjs   # after a build
```

The end-to-end scripts drop and recreate the database they are given and refuse a name that
does not contain `e2e`.

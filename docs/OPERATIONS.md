# Operations — Lyceum Placements PMS

Developed by Bhanu Mendis - Group IT

How the system is built, released, rolled back and run. The pipeline lives in
`.github/workflows/` (`ci.yml`, `rollback.yml`, `migrate.yml`); scripts in `scripts/`.

## What runs where

| Part | What it is | Where |
|---|---|---|
| Web application | One HTML file plus `sw.js` (Web Push), built for exactly one API origin; its Content-Security-Policy admits nothing else | GitHub Pages (`deploy-web`), or any static host serving `dist/` |
| lpl-api | Go service (`server/`): the data API under row-level security, the GoTrue proxy, account administration, and the background workers (push, reminders, dashboard, case order stamps, retention) | Container `ghcr.io/<owner>/lpl-api`, any container host |
| Database and identity | Postgres (`supabase/schema.sql`) and GoTrue | Supabase project (Singapore region) |

## One-time setup (repository administrator)

One command, with the GitHub CLI signed in as a repository administrator (`gh auth login`):

```bash
scripts/deploy/configure-repo.sh --repo <owner>/<name> --reviewer <group-it-login> \
  --api-url https://<lpl-api origin> --anon-key <public anon key> --dry-run   # read what it will do
scripts/deploy/configure-repo.sh --repo <owner>/<name> --reviewer <group-it-login> \
  --api-url https://<lpl-api origin> --anon-key <public anon key>             # then do it
```

It sets, and can be run again at any time:

1. **Branch protection on `main`:** pull requests only, the six CI gates required and up to date
   (*Web*, *Server*, *End to end*, *Secret scan*, *Pipeline*, *Image · build, scan, deploy
   rehearsal*), one approving review (`--required-reviews 0` for a single maintainer, who cannot
   approve their own pull request), stale approvals dismissed, conversations resolved, no force
   pushes, administrators included.
2. **Environments:** `production` and `production-db`, deployable from protected branches only,
   with the given reviewers (`--reviewer`, `--team org/slug`); `github-pages` by enabling Pages
   with *Source: GitHub Actions*.
3. **Variables:** `VITE_API_URL`, `VITE_API_ANON_KEY` (and `LPL_CONNECT_SRC` with
   `--connect-src`) for the repository; `API_URL` and `VITE_API_ANON_KEY` for `production`. The
   script, like the build, refuses a service-role or secret key.
4. **Hardening:** the workflows' default token becomes read-only; Dependabot alerts and security
   updates are switched on.
5. **Secrets**, prompted with hidden input (skip with `--no-secrets`): `API_DEPLOY_HOOK`
   (`production`, optional: a URL the host exposes to pull `lpl-api:production`; without it the
   host must follow the tag itself) and `PRODUCTION_DATABASE_URL` (`production-db`).

Until `VITE_API_URL` is set, `deploy-web` is skipped; until `API_URL` is set, the image is
published but not promoted.

**lpl-api runtime configuration** lives on the container host, never in the repository:
`DATABASE_URL`, `GOTRUE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `JWT_SECRET` or `JWKS_URL`,
`CORS_ALLOW_ORIGINS` (the web origin), `TRUSTED_PROXY_HOPS`, and for Web Push
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Every variable is documented in
`server/.env.example`; the service refuses to start on anything missing or unsafe.

## Releasing

Every push and pull request runs the gates:

- **Web:** typecheck, lint, 184 unit and component tests, contrast, schema and parity-fixture
  freshness, attribution, `npm audit` of every dependency (development tooling included) at
  high, production build and bundle budget.
- **Server:** Go formatting, vet, staticcheck, govulncheck and the unit, integration and
  migration suites against Postgres 16.
- **End to end:** the client against lpl-api, and the production bundle visited as every role at
  seven viewports plus dark with axe.
- **Secret scan:** gitleaks over the full history.
- **Pipeline:** actionlint (with shellcheck over every workflow step), shellcheck over the
  scripts, and a dry run of `configure-repo.sh` that also checks its required checks are the
  jobs in `ci.yml`. Third-party actions are pinned to commit SHAs; Dependabot moves them.
- **Image · build, scan, deploy rehearsal** (`scripts/deploy/rehearse.sh`): the lpl-api image is
  built and published to a throwaway registry, promoted with the same script and commands as
  production, run in production mode against a database built from `supabase/schema.sql`, and
  smoke-tested; then the newest migration is taken away and the smoke test must fail (the
  schema gate), and the image is promoted back by digest (the automatic rollback). grype fails
  the job on any high or critical vulnerability with a fix.

A merge to `main` that passes all of them:

1. publishes `ghcr.io/<owner>/lpl-api:sha-<commit>` (and `:main`) with provenance and an SBOM;
2. **deploy-api** (waits for approval in `production`) records the image production runs now,
   points `:production` at the new one, calls the deploy hook, and smoke-tests: the new
   revision answers `GET /version`, `/readyz` reaches the database **and finds this build's
   newest migration applied**, `needs_bootstrap` is false, and the security headers are
   present. **If the smoke test fails, `:production` is pointed back at the recorded image
   automatically** and the job fails;
3. **deploy-web** builds the bundle for `VITE_API_URL`, deploys it to Pages and checks the live
   page is this build (its CSP admits exactly the API) and that `sw.js` is served. **If that
   fails, the last commit that passed every gate on `main` is rebuilt and redeployed
   automatically** (the rollback workflow, called).

The API goes first because a new web build may call a new API. The schema gate means an API
merged before its migration was applied cannot stay live: `/readyz` refuses, the smoke test
fails and the API rolls back (`server/internal/schema`, held to the newest file in
`supabase/migrations` by a test).

## Rolling back

Actions → **Rollback** → the full SHA of a commit on `main` whose CI passed, and the target
(`both`, `api`, `web`). CI calls the same workflow for the web application when a web deploy
fails its smoke test. A rollback shares the deploy jobs' concurrency groups, so it never runs
alongside a deploy. The API is re-pointed at that commit's published image (nothing is
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
attribution, case order stamps with their backfill: about 45 s per million cases), then deploy
lpl-api, then the web application, then retire the Edge Functions and cron jobs in the order
`server/docs/CUTOVER.md` gives. The case index migration re-derives every case's summary once;
on a large project run it in a quiet hour.

## Running it

- **Health:** `GET /healthz` (process), `GET /readyz` (database reachable and migrated to this
  build's schema), `GET /version` (revision and required schema).
- **Logs:** JSON on stdout. Every request logs method, path, status, duration and
  `request_id` (also returned as `X-Request-Id`); the workers log `worker failed` at ERROR,
  undeliverable pushes at WARN (`push not delivered` with the push service's status) and
  a warning when the VAPID key in Settings differs from the server's.
- **Alert on:** `/readyz` failing; any `worker failed`; a sustained 5xx rate; `push not
  delivered` with status 401/403 (a VAPID key problem, every push is failing).
- **Scale-out:** run as many lpl-api replicas as needed; push delivery leases rows, reminders,
  restamping and retention take advisory locks, and the dashboard refresh is single-flighted,
  so replicas never duplicate work. `WORKERS=false` makes a replica serve requests only; keep
  at least one replica with workers on, or the severity, urgency and retention lists fall back
  to evaluating every case once more than 5,000 stamps are stale (correct, but seconds at a
  million cases). At 00:00 UTC every date-only deadline turns at once; the worker retakes
  about 100,000 stamps in 6 s.
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
REHEARSAL_DATABASE_URL=postgres://…/lpl_rehearsal scripts/deploy/rehearse.sh   # needs Docker and a registry on localhost:5000
```

The end-to-end scripts and the rehearsal drop and recreate the database they are given, and
refuse a name that does not contain `e2e` (the rehearsal: `rehearsal`).

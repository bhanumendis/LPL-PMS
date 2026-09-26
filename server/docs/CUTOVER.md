# Cutover runbook: Supabase request path → lpl-api

Copyright © Bhanu Mendis - LGH IT

From a v5 installation (the browser talking to Supabase directly, Edge Functions for account
administration and push) to v6 (the browser talking only to lpl-api). The pipeline does the
deploying; this is the order and the checks around it. Commands and settings are in
`docs/OPERATIONS.md`.

Preconditions:

- `docs/PARITY.md` acceptance met.
- The repository is set up (`scripts/deploy/configure-repo.sh`): branch protection, the
  `production` and `production-db` environments, `VITE_API_URL`, `VITE_API_ANON_KEY`,
  `API_URL`, `PRODUCTION_DATABASE_URL` and, if the host has one, `API_DEPLOY_HOOK`.
- A container host for lpl-api in the Singapore region, with TLS on the `API_URL` origin,
  following `ghcr.io/<owner>/lpl-api:production`, and its runtime configuration from
  `server/.env.example`: `DATABASE_URL`, `GOTRUE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
  `JWT_SECRET` or `JWKS_URL`, and `CORS_ALLOW_ORIGINS` set to the web application's origin.

## Steps

1. **Check the data, then migrate.** Take a backup (Supabase → Database → Backups, or confirm
   point-in-time recovery). Actions → **Migrate database** with *apply* unticked: it lists the
   pending migrations and prints the data integrity report (`scripts/db/integrity-report.sql`,
   read only, ids and counts only). Resolve anything marked *blocks migration*, decide on
   anything marked *fix before go-live*, and classify what is marked *review* (test and
   demonstration data is never removed automatically). Then run it again with *apply* ticked
   and the backup confirmation typed. The report runs again once the migrations are in; its
   Group IT line (V1) lists v5 administrators who became SUPER ADMIN outside `lyceum.lk`.
2. **Deploy.** Merge the release to `main`. Once every gate passes, `deploy-api` (after
   approval in `production`) points `lpl-api:production` at the new image and smoke-tests
   it: the new revision answers `GET /version`, `GET /readyz` finds the database migrated to
   this build's schema, `needs_bootstrap` answers `false`, and the security headers are
   there. A failed smoke test restores the previous image. `deploy-web` then builds the web
   application for `VITE_API_URL` (its Content-Security-Policy admits that origin and nothing
   else), publishes it and checks the live page is this build.
   Nothing changes in staff browsers: a production build talks only to the API it was built
   for, and a connection a v5 build kept under Settings is no longer read.
3. **Smoke test on the live project through lpl-api**: sign in as a SUPER ADMIN, open a case,
   save a draft, complete a step, decide a gate as a Team Leader, create a staff profile as an
   ADMIN, sign in as a student and submit the profile. Watch the lpl-api logs for 5xx and
   `worker failed`.
4. **Retire the Edge Functions and cron jobs, then switch on push.** In this order, because
   the old dispatcher does not take leases and would deliver alongside lpl-api:
   1. Remove the schedules, if they were created (SQL editor):
      `select cron.unschedule('lpl-push'); select cron.unschedule('lpl-sla');`
      and any Database Webhook that posts to `push-dispatch`.
   2. `supabase functions delete push-dispatch` and `supabase functions delete admin-users`.
      Their source left the repository in v6; it is in the git history before that commit.
   3. Give lpl-api `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (the pair the
      Edge Function used, so existing browser subscriptions keep working) and restart. The
      log line `lpl-api listening` shows `"push":true`; a warning appears if the public key
      in Settings → Notifications is not the server's.
   Reminders (`emit_sla_notifications`) run from lpl-api from its first start; a cron job
   left in place is harmless (reminders are deduplicated) but redundant.
5. **Lock the old path** (optional, defence in depth): restrict the project's API gateway or
   rotate the anon key so direct PostgREST calls from old builds stop working. Rotating the
   anon key means updating `ANON_KEY` on the host and `VITE_API_ANON_KEY` in the repository
   (`configure-repo.sh --anon-key`), then redeploying.
6. **Data protection**: record the lpl-api host as a standing processor under Data
   protection → Standing processors.

## Rollback

Actions → **Rollback** with the last release's commit: the API is pointed back at that
commit's image and smoke-tested, and the web application is rebuilt from it
(`docs/OPERATIONS.md`, "Rolling back"). The database changes of each release are additive, so
the previous image runs against them; migrations are not rolled back.

A v5 build (the browser talking to Supabase directly) still reads its data under the same
row-level security until step 5, but without account administration, push delivery or
reminders, which live in lpl-api since v6. It is a last resort, not a rollback path.

## Not part of cutover

File storage for uploaded documents (they are recorded, not stored) and any change not in the
release. Each is a separate approval.

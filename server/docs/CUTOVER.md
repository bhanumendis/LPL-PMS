# Cutover runbook: Supabase request path → lpl-api

Copyright © Bhanu Mendis - LGH IT

Preconditions: docs/PARITY.md acceptance met; a host for lpl-api in the Singapore region
with TLS; secrets provisioned (`DATABASE_URL`, `GOTRUE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`JWT_SECRET` or `JWKS_URL`).

## Steps

1. **Deploy lpl-api** (container from `server/Dockerfile`). Check `GET /healthz` and
   `GET /readyz`, then `POST /rest/v1/rpc/needs_bootstrap` with the anon key: it must answer
   `false` on the live project.
2. **Build the frontend for the new origin**:
   `LPL_CONNECT_SRC="https://api.<host>" VITE_SUPABASE_URL="https://api.<host>" VITE_SUPABASE_ANON_KEY="<anon>" npm run build`.
   The CSP now admits the API origin and the connection is baked in. A browser that has a
   connection stored under Settings keeps using it until changed; ask staff to enter the new
   URL under Settings → Server connection → Test connection → Connect, or clear it.
3. **Smoke test on the live project through lpl-api**: sign in as an administrator, open a
   case, save a draft, complete a step, decide a gate as a Team Leader, sign in as a student
   and submit the profile. Watch lpl-api logs for 5xx.
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
   rotate the anon key so direct PostgREST calls from old builds stop working.
6. **Data protection**: record the lpl-api host as a standing processor under Data
   protection → Standing processors.

## Rollback

Redeploy the previous lpl-api image: the database changes of each release are additive
(`supabase/migrations`), so the previous image runs against them. Pointing browsers back at
the Supabase URL directly (rebuild without `LPL_CONNECT_SRC`, or Settings) still serves data
under the same row-level security, but without account administration, push delivery or
reminders, which live in lpl-api since v6.

## Not part of cutover

Any schema change, any change to the frontend beyond the CSP line, optimistic concurrency,
pagination, file storage. Each is a separate approval.

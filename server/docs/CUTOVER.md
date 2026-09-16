# Cutover runbook: Supabase request path → lpl-api

Copyright (c) 2026 Bhanu Mendis. All rights reserved.

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
4. **Retire the Edge Function**: `supabase functions delete admin-users` (or leave it
   deployed but unused; nothing calls it through lpl-api). Keep the source in the repository
   until the user decides otherwise.
5. **Lock the old path** (optional, defence in depth): restrict the project's API gateway or
   rotate the anon key so direct PostgREST calls from old builds stop working.
6. **Data protection**: record the lpl-api host as a standing processor under Data
   protection → Standing processors.

## Rollback

Rebuild without `LPL_CONNECT_SRC`, or enter the Supabase URL under Settings again. The
database is unchanged throughout, so rollback is a URL change.

## Not part of cutover

Any schema change, any change to the frontend beyond the CSP line, optimistic concurrency,
pagination, file storage. Each is a separate approval.

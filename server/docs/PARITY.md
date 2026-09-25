# Parity: how we prove lpl-api behaves like Supabase did

Copyright © Bhanu Mendis - LGH IT

The frontend is the oracle: the same HTML file, driven the same way, must see the same
answers from lpl-api as from Supabase. Three layers of evidence, cheapest first.

## 1. Unit tests (no database)

`go test ./internal/...` proves the pieces that do not need Postgres: configuration,
token verification (HS256, ES256 via a JWKS server, expiry, leeway, anon key), the query
grammar allow-list, Prefer parsing, SQL statement shapes for every query the frontend sends,
PostgREST status mapping, the admin-users branches with a fake GoTrue, and the middleware
(apikey gate, CORS preflight, request id, service-role refusal).

## 2. Integration suite (real Postgres, real schema)

`TEST_DATABASE_URL=… go test ./test/integration/` applies the auth shim and
`supabase/schema.sql`, then drives lpl-api over HTTP:

- bootstrap through the trigger; `needs_bootstrap` before and after;
- the 52-cell permission matrix for all four roles, compared with `DEFAULT_PERMISSIONS`
  from `src/lib/rbac.ts` (the drift check between TypeScript and `permission_defaults`);
- case visibility by scope (admin all, counsellor assigned, student own, anon 401);
- the JSON guard: student status change refused, step-2 answers accepted, foreign event
  attribution refused, gate decision refused for a counsellor and accepted for a Team
  Leader, each with the trigger's exact message;
- audit rows attributed by the database, not the client;
- `next_case_ref` sequence and refusal for an inactive profile; `workspace_version` moves;
- admin-users create links the identity through the trigger, 409 on repeat, 403 without
  `account.write`;
- own-profile PATCH allowed, self-promotion refused, DELETE without `case.delete` silently
  matches nothing (204), as under PostgREST;
- the contract's column lists equal the live catalogue.

## 3. Golden replay (real Supabase recording)

1. Run the recorder in front of the project:
   `go run ./cmd/lpl-record -upstream https://<ref>.supabase.co -anon-key <anon> -out test/contract/testdata/journey.ndjson`
2. Start the frontend dev server (`npm run dev`; it carries no CSP) and in Settings enter
   `http://localhost:8788` as the project URL with the real anon key.
3. Walk the journeys on an **empty project**: set up the administrator, create a counsellor
   with a sign-in, sign in as the counsellor, create a student with a sign-in, complete
   steps, submit a gate, decide it as a Team Leader, upload a document record as the
   student, exit and reopen a case, dispose of a record, export.
4. Replay: `GOLDEN_FILE=test/contract/testdata/journey.ndjson TEST_DATABASE_URL=… go test ./test/contract/ -run TestReplayGolden -v`

The harness seeds identities from the recording's own profile lookups, mints tokens for
the recorded subjects, replays every `/rest/v1` call in order and compares status codes
exactly and bodies after `parity.Normalize` (timestamps, uuids, digests, reference year).
Recordings contain personal data and are git-ignored.

## 4. Side by side in the browser

Build twice: once unchanged (Supabase), once with `LPL_CONNECT_SRC` set (lpl-api). Point
each at its backend and repeat the journeys, both themes. The existing headless Chromium
setup used for axe-core is the natural home for scripting this.

## Acceptance for cutover

Unit and integration suites green with `-race`; golden replay with zero mismatches on the
recorded journeys; side-by-side journeys green; `service_role` refused on the public
listener; `schema.sql` re-applied on the populated database without change.

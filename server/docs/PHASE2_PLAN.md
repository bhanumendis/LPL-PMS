# Phase 2 — Go façade: plan, decisions and status

Copyright (c) 2026 Bhanu Mendis. All rights reserved. · 12 September 2026

Phase 1 (`LPL_PMS_Go_Migration_Phase1_Architecture_Audit_2026-09-11.md`) found that the
"TypeScript backend" is one 126-line Edge Function plus 600 lines of SQL, and that the
frontend's contract is the PostgREST/GoTrue/Edge-function subset in `src/lib/server.ts`.
Phase 2 therefore builds **Option A**: a Go service wire-compatible with that subset, in
front of the unchanged schema and GoTrue.

## Decisions taken (defaults from the Phase 1 report; change them by editing this file)

| ID | Decision | Taken as |
|---|---|---|
| D1 | Scope | Option A façade now; Option B domain endpoints later, only with contract approval |
| D2 | Hosting | Keep Supabase-hosted Postgres and GoTrue; run lpl-api alongside (any host in Singapore) |
| D3 | Identity | Keep GoTrue; proxy it; never re-implement password or token handling |
| D4 | Frontend build change | `LPL_CONNECT_SRC` admits the API origin in the CSP; default build output is byte-identical |
| D5 | Repository | `lpl-pms/server/` inside the existing repository; CI in `.github/workflows/server.yml` |
| D6 | Existing defects | Preserved: last-writer-wins on the case document, restore collisions, student self-edit via API, `org_config` readable by students |
| D7 | File storage | Out of scope (none exists today) |
| D8 | Reminders / email | Out of scope (none exists today) |

## Work items

| # | Item | Status |
|---|---|---|
| 0 | Baseline run against a live Supabase project; golden traffic recorded | **blocked**: no project, no credentials |
| 1 | Toolchain: Go, Docker | Go 1.27.1 installed under `%LOCALAPPDATA%\Programs\go` (12 Sep); **Docker/Postgres still missing** |
| 2 | Foundation: module, config, logging, health, shutdown | written |
| 3 | Postgres access with role + claims per request | written (`internal/db`) |
| 4 | Auth front door: anon key, HS256/JWKS verification, GoTrue proxy | written |
| 5 | Data façade: `/rest/v1` tables and RPCs, allow-listed grammar, opaque jsonb | written |
| 6 | admin-users in Go | written |
| 7 | Tests: unit (config, auth, contract, gotrue, httpapi), integration (RLS, guards, attribution, admin-users, catalogue), replay harness | written |
| 8 | Frontend build: CSP `connect-src` via `LPL_CONNECT_SRC` | done |
| 9 | Ops: Dockerfile, compose sketch, CI workflow | written |
| 10 | Docs: README, ADR, parity, cutover | done |
| 11 | Compile, vet, run the suites | **done for unit tests** (12 Sep): build, vet, staticcheck, govulncheck clean, all unit suites green with pgx v5.11.0. Integration suite still needs a Postgres; `-race` needs cgo (CI covers it on Linux) |
| 12 | Golden replay against the recording from item 0 | **not done**: needs item 0 |
| 13 | Cutover (docs/CUTOVER.md) | not started |

## First session with a toolchain

```bash
cd lpl-pms/server
go mod tidy && go build ./... && go vet ./...
go test ./...
docker run -d --name lpl-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable" go test -race -count=1 ./...
```

Then item 0 with the real project (docs/PARITY.md), then the replay, then cutover.

## Out of scope until approved

Optimistic concurrency (409 on a stale `rev`), pagination, intent endpoints (complete step,
decide gate …), file storage, reminders. Each changes the contract the frontend depends on.

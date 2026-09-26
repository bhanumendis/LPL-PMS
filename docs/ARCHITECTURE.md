# Architecture

Developed by Bhanu Mendis - Group IT

```
 Browser (one HTML file, React 18)          lpl-api (Go, container)                 Supabase
 ─────────────────────────────────          ───────────────────────                 ────────
 views ─► read model (queries.ts) ─RPC──►   /rest/v1  role + claims per request ─►  Postgres
        ─► store (mutateCase, …)  ─REST─►   /auth/v1  proxy ───────────────────►   GoTrue
                                  ──────►   /functions/v1/admin-users ─(service key)─► GoTrue admin
 sw.js ◄──────── Web Push ◄───────────────  workers: push · reminders · dashboard · stamps · retention
```

## The pieces

- **Web application** (`src/`). React 18, Vite, one self-contained HTML file with a strict
  Content-Security-Policy, built for exactly one API origin. Hash routing; a small snapshot store
  (`src/lib/store.ts`) holding configuration, the staff directory, the signed-in user and
  only the case documents that are open; every list, count and dashboard comes from the read
  model (`src/lib/queries.ts`, `src/lib/useRead.ts`) a page at a time.
- **lpl-api** (`server/`). One Go binary with the standard library plus pgx. It serves the
  PostgREST subset the browser speaks, under the caller's Postgres role and claims, proxies
  GoTrue, runs account administration with the service key, and runs the background workers.
  It holds no business rules of its own: those are in the database.
- **Database** (`supabase/migrations/`, generated `supabase/schema.sql`). Tables, row-level
  security, guard triggers (the rules inside the case document), derived summary columns,
  paged read functions, registers and aggregates, notifications, audit.

## Cases at scale

A case is one JSON document (`cases.data`), written whole with a revision check
(`save_case`). On every write a trigger derives a summary into columns — stage, current step,
progress, clocks, gates, documents, retention anchors, search text — so lists never parse
JSON. Reads are keyset-paged functions (`cases_page`, `transfers_page`, `gates_page`,
`users_page`) with filters and sorts backed by indexes; counts are capped; the all-cases
dashboard is computed once and shared (`dashboard_shared`, refreshed in the background).
Visibility is the same predicate the policy uses, applied beside it so the planner can use
indexes.

Three orders — severity, urgency (the most overdue clock) and retention — sort on what a case
means *now* under the configured service levels, which no index on `cases` can hold.
`case_stamps` keeps each case's keys for those orders together with the window in which they
hold: the service levels they were computed under and the instants between which "now" may
move without changing them (a clock's whole-day count turning over, a hold review or retention
date passing). Every write retakes the stamp; lpl-api's worker retakes those whose window has
closed. A page takes candidates in stamp order, adds every case whose stamp is not valid now,
and evaluates all of them live, trusting the stamp order only up to its last candidate, so it
is exactly the page that evaluating every case would give. Stamps are read only through
definer functions that answer only callers who see every case; everyone else's lists are short
and evaluated directly. A search in the list order walks the first 5,000 cases and, when
matches are too sparse or clustered to fill a page, reads every match through the trigram
index as the owner, applying the caller's visibility.

Measured at a million cases: first page and deep keyset pages about 5 ms, filtered lists
3–10 ms, the severity, urgency and retention orders 8–20 ms (3.3 s before stamps), searches
10–20 ms, or about 170 ms for a broad search whose matches cluster far down the list,
registers under 1 ms, approval statistics shared. The remaining costly paths are in the
release report.

The TypeScript reference implementation in `src/lib/queries.ts` is the specification of every
read: the parity fixture records its complete, ordered answers to 26 queries under two
configurations, and the Go suite requires the SQL to return exactly the same rows in the same
order — with every stamp fresh, every stamp stale (and wrong), and half of each. The summary derivation is held to `src/lib/summary.ts` the same way.

## Writes

The browser fetches the latest document, applies the change, and saves it at the next
revision; a concurrent save gets 409 and the user re-applies on fresh data. Plain inserts and
patches elsewhere; never upserts under row-level security. The database attributes audit rows
and notification fan-out itself (triggers), so neither can be forged by a client.

## Background work (lpl-api workers)

Push delivery every 10 s through a leased queue (`push_claim` / `push_settle`, `FOR UPDATE SKIP
LOCKED`), service-level reminders every 15 min (advisory lock), dashboard and approval
statistics refresh every minute, case order stamps every 10 s (advisory lock), notification
retention every 6 h. Safe on any number of replicas. Details:
`server/README.md`.

## Tests

| Layer | What it proves |
|---|---|
| Unit and component (vitest, 185) | Logic, store, server adapter wire contract, views, WCAG A/AA in jsdom, performance and motion guards (stylesheet source; only a loading indicator animates without end), overlay presence |
| Go unit | Config, auth, contract, SQL building, errors, rate limits, Web Push (RFC 8291 vector and cross-implementation vectors), workers' helpers |
| Go integration (Postgres) | Row-level security for every role, guards and their messages, paging completeness and order, parity with the TypeScript reference (stamps fresh, stale and mixed), stamp windows held at every hour and at each boundary, both search routes, registers, dashboard, workers (push leases, retries, revocation, reminders, retention, restamping), privileges of definer functions |
| Migration | An upgraded v5 database and a fresh install end in the same catalogue; migrations are idempotent. The data integrity report runs at v4, v5 and v6, finds every planted defect by its own check, changes nothing and prints no personal data, and fails on a finding that would stop a migration |
| End to end, API | The browser's server path (store, read model, saves, 409, change polling) against the real lpl-api |
| End to end, browser | The production bundle as every role at eight viewports (a phone held sideways among them) plus dark: axe WCAG 2.2 A/AA with contrast, no sideways scroll, no console errors, screenshots; overlays leaving, and the phone sheet under a real pointer (follow, rubber-band, throw) |
| Web Vitals | Every role's pages loaded from scratch and used, under Lighthouse's mobile or desktop network and CPU conditions, at one viewport per layout: each page's LCP, CLS and INP out of "poor", the 75th percentile "good" (LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms) |

## Further reading

`docs/OPERATIONS.md` (release, rollback, migrations, monitoring), `docs/SECURITY.md`,
`docs/RBAC.md`, `server/README.md`, `server/docs/CUTOVER.md`.

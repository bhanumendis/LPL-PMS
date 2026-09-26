# Security

Developed by Bhanu Mendis - Group IT

The controls as implemented, where each lives, and what is left to the people running it.
Report a vulnerability privately to Group IT, never in a public issue.

## Where access is decided

- **Postgres row-level security and guard triggers** (`supabase/schema.sql`) decide every read
  and write. lpl-api runs each request in a transaction that has switched to the caller's role
  (`anon` or `authenticated`) and installed the caller's verified JWT claims, exactly as
  PostgREST does, so `auth.uid()`, every policy and every guard see the real caller. Roles and
  the permission model: `docs/RBAC.md`.
- **Inside the case document**, a guard trigger enforces what the JSON may change: gate
  decisions, document uploads and reviews, reassignment, disposal and legal holds each need
  their own permission; decided gates and uploaded files are immutable; events are
  append-only and attributed by the database; a student changes only their own answers,
  uploads and confirmations. Saves carry a revision and a stale one is refused (409).
- **SECURITY DEFINER functions** run with their owner's rights, so who may call them is their
  whole security. An integration test pins the exact list a browser role can execute
  (`TestDefinerFunctionsAreGrantedDeliberately`): anonymous callers reach two
  (`needs_bootstrap`, `bootstrap_domains`); the functions behind the workers are the service
  role's alone. The read helpers that bypass row-level security to use an index (searches,
  the case order stamps, the shared dashboard and approval statistics) return only ids or
  aggregates the caller could read anyway: they apply the caller's visibility, or answer only
  roles that see every case. `case_stamps` itself has no grants. Before v6.4 two of them (`notify_insert`, `emit_sla_notifications`) were
  executable with the public anon key.

## Identity

- GoTrue holds passwords; the browser and lpl-api see tokens only. lpl-api verifies HS256
  (shared secret) or ES256/RS256 (JWKS) tokens, with no clock leeway by default, and refuses a
  service-role token on its public listener.
- **Closed registration:** the only sign-up the database accepts is the first account on an
  empty project, and only from a Group IT email domain; it becomes SUPER ADMIN. Every other
  identity is created by an administrator through lpl-api's `admin-users`, which verifies the
  caller and uses the service key server-side. A public sign-up never claims a profile.
- Passwords: at least 10 characters mixing three character classes, checked in the browser
  and again by lpl-api. Resets are administrator actions; deactivation removes the role from
  live tokens (policies read `active`) and bans the identity.
- Only a 401/403 from the identity provider ends a session; an outage does not sign users out.

## The API (lpl-api)

- **Allow-listed surface:** only the tables, columns, filters and RPCs in
  `server/internal/contract` are served; anything else is refused before it reaches the
  database. Request values are always bound parameters.
- **Headers:** `Strict-Transport-Security` (production), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on API responses.
- **CORS** admits only the configured web origins; production refuses `*`, `null` and http
  origins at start.
- **Limits:** per-client-IP budgets for sign-in (brute force), account administration and the
  data API; request body size and request time bounds; slow-header protection.
- **Configuration** is validated at start and every problem reported at once; the service
  does not start half-configured.
- **Web Push** posts only to https endpoints on a push-service allow-list (FCM, Mozilla,
  Apple, WNS, or `PUSH_ENDPOINT_HOSTS`) and never follows a redirect, because an endpoint is a
  URL a signed-in user supplied and must not become a way to reach the internal network.
  Pushes go only to active accounts, carry no link outside the application, and are
  encrypted end to end (RFC 8291) and signed (RFC 8292).
- **Dependencies:** the standard library only, plus pgx. CI runs govulncheck on reachable code
  (standard library included) and staticcheck. `go.mod` pins the patched toolchain.
- **The image** (distroless, non-root) is built, scanned with grype (high or critical with a fix
  fails the pull request) and run through a deploy rehearsal on every pull request; the
  published image carries provenance and an SBOM.

## The web application

- **Content-Security-Policy** in the built file: scripts only by hash, `connect-src` exactly
  the API the build was made for, no framing, no base or form targets, no remote fonts or
  images.
- The production build **refuses** to build without an https API or with a service-role or
  secret key, and never falls back to browser storage: without a server it is unconfigured and
  refuses writes. Browser-storage mode (with client-side password hashing) exists only in
  development builds, for walkthroughs, never for real records.
- Audit rows are written and attributed by the database; special-category fields are
  redacted from change diffs before they leave the browser.

## The supply chain

- Third-party GitHub Actions are pinned to commit SHAs (Dependabot proposes updates as pull
  requests, which must pass every gate); workflow inputs reach shells as environment variables,
  never as text spliced into a script; actionlint and shellcheck gate every change to the
  pipeline.
- `npm audit` fails CI on any high or critical advisory, development tooling included.
- `scripts/deploy/configure-repo.sh` makes the workflows' default token read-only and turns on
  Dependabot alerts and security updates.

## Secrets

Secrets never enter the repository, the bundle, logs or client configuration:

- lpl-api reads them from its environment (`server/.env.example` documents each; `.env` files
  are ignored by git). The service role key, JWT secret, database URL and VAPID private key
  live only on the container host; CI's deploy secrets live in protected GitHub environments.
- The web bundle carries only the public anon key and the API origin.
- CI scans the full git history with gitleaks on every push (`.gitleaks.toml`: the default
  rules plus an allowlist of exact test placeholders, never whole files).
- The error boundary and API errors show plain messages; database internals and stack traces
  stay in the server log.

## Data protection

Retention schedules with overdue tracking, legal holds, disposal (personal details and
document names are removed; only the fields kept for statutory reasons remain), and a register of every cross-border transfer with its
safeguard, all enforced by the database and recorded in the audit log. Notifications are
pruned after `NOTIFICATION_RETENTION_DAYS` (90), revoked push subscriptions after 30 days.

## Not in this release

The system records uploaded documents' details (name, type, size, review) but does not store
the files themselves: file storage (for example a Supabase Storage bucket under the same
row-level security) is a separate decision, recorded in `server/docs/CUTOVER.md`.

## Left to the operators

- Supabase dashboard access, database credentials, the service role key and backups belong to
  Group IT, never to an application role. Keep point-in-time recovery on.
- Disable "Allow new users to sign up" in GoTrue after bootstrap (defence in depth; the
  database already refuses).
- Configure required reviewers on the `production` and `production-db` environments and
  branch protection on `main` (`docs/OPERATIONS.md`).
- Set `TRUSTED_PROXY_HOPS` to the real number of proxies, or clients share rate budgets.
- After pointing browsers at lpl-api, restrict or rotate the old direct Supabase data path
  (`server/docs/CUTOVER.md`, step 5).

# Lyceum Placements — Placement Management System (v6)

Production build of the Placement Management System for Lyceum Placements (Private) Limited.
React 18 + Vite 5 + TypeScript, built as a single HTML file, served by **lpl-api** (Go) over a Supabase Postgres and GoTrue.
Developed by Bhanu Mendis - Group IT
Built on process document LGH/IMS/PROC/LPL/001: 31 process steps, presented as 9 stages, with Team Leader gates at steps 16 and 19 and three tracked service level clocks (CIS, offer lapse, follow-up).

## Build

```bash
npm install
npm run verify       # typecheck + eslint + vitest (unit, component, axe, performance guards) + contrast
npm run test         # vitest only
npm run contrast     # WCAG AAA verification of every design-token pair, both themes
npm run build        # verify, then -> dist/LPL_Placement_Management_System.html (single file) and dist/sw.js
                     # a production build needs VITE_API_URL (https) and VITE_API_ANON_KEY
npm run test:e2e     # the client against a real lpl-api and Postgres (scripts/e2e-api.sh)
npm run test:ui      # every role at seven viewports, axe WCAG 2.2 AA (scripts/e2e-ui.sh)
```

More: `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md` (release, rollback, migrations),
`docs/SECURITY.md`, `docs/RBAC.md`, `server/README.md`.

No runtime dependency beyond React and lucide-react. The Supabase client is hand-rolled over `fetch` so the single-file build stays dependency-free. Fonts (Poppins, Lora) are embedded as base64 WOFF2 subsets.

There is no sample or seed data anywhere in the build. A new workspace starts empty.

## Layout

| Path | Purpose |
|---|---|
| `src/lib/spine.ts` | The 31 steps and their fields; the **9-stage pipeline** (`PIPELINE`) that users see; document checklists, exit codes, data-protection reference tables |
| `src/lib/logic.ts` | Step state machine, gates, SLA clocks, pipeline progress, retention and transfer engine, analytics |
| `src/lib/signals.ts` | Derived per-case signals (progress, stage, step, SLA flags, attention items, severity), computed once per snapshot |
| `src/lib/rbac.ts` | The resource × action permission matrix, case visibility scope, locked cells |
| `src/lib/store.ts` | Persistence. Picks an adapter: server → `window.storage` → `localStorage` → memory. Also the audit and notification APIs |
| `src/lib/server.ts` | Server adapter for lpl-api — the PostgREST contract for data, GoTrue (proxied) for identity, RPCs for paged reads, audit and notifications, `admin-users` for account administration |
| `src/lib/audit.ts` | Typed audit events (`EVENTS.*`) and the field-level diff helper |
| `src/lib/motion.ts` | View transitions (rail row → case header) and FLIP for reordering lists |
| `src/lib/ui/*`, `src/lib/charts.tsx` | Design-system primitives (surfaces, page header, stat strip, filter bar, layers and sheets, empty states, skeletons) and SVG charts |
| `src/shell/*` | Application shell: utility bar, floating dock, mobile tab bar, command palette, route → page, the counsellor student rail |
| `src/notifications/*` | Bell, notification center, reminders, push subscription and settings |
| `src/views/home/*` | Role dashboards (administrator, Team Leader, counsellor, student) and their sections |
| `src/views/*` | Sign-in, case workspace, step panel, documents, staff pages, audit explorer, student pages, Prompt Engineer Workspace |
| `src/styles/*.css` | `tokens.css` (palette, spectrum, tiers), `base.css`, `components.css`, `shell.css`, `pages.css`, `fonts.css` |
| `src/sw.ts` | Service worker for Web Push (hosted builds only; built to `dist/sw.js`) |
| `src/test/*` | Test setup, fixtures, the axe accessibility suite and the performance guards |
| `scripts/contrast.mjs` | Computes every token pair's contrast ratio from `tokens.css`; `npm run verify` stops on any pair below AAA |
| `supabase/migrations/` | One idempotent file per schema version (v4 base, v5 notifications and audit, v6 write path, role model, case index, workers, attribution) |
| `supabase/schema.sql` | Generated from the migrations (`node scripts/build-schema.mjs`) for a new project |
| `server/` | **lpl-api** (Go): serves `/rest/v1`, `/auth/v1` and `/functions/v1/admin-users` in place of Supabase's request path, and runs the background work (Web Push delivery, service-level reminders, the shared dashboard, notification retention) that Edge Functions and pg_cron did before v6. See `server/README.md` |
| `.github/workflows/ci.yml` | Every quality gate on each push and pull request; on `main`, the gated deploy (see `docs/OPERATIONS.md`) |
| `.github/workflows/rollback.yml`, `migrate.yml` | Manual rollback to a commit that passed CI; gated production migrations |
| `LICENSE` | Ownership and licence terms |

## Application shell

One shell for every signed-in role. A utility bar carries the brand, search (Ctrl/⌘ K), the notification bell and the profile menu; primary navigation is a **floating dock** at the top centre (Alt 1–9 jumps to a destination). Under 1024 px the dock becomes a bottom tab bar with a More sheet. Pages render on a solid ground; only floating things (bar, dock, popovers, sheets, toasts) are glass.

### Counsellor student rail

Roles whose case scope is *assigned* get a rail on the **left edge that is always minimised**: a launcher and one progress ring per assigned student, the ring drawn in the colour of the student's current stage, with a severity dot and an unseen-updates dot. Pressing the launcher slides the **quick view** open from the left: a caseload summary (active, needing attention, average progress), search, and every student grouped by urgency with their **percentage, stage (n of 9), current step**, nine-stage track and most urgent item. Each row expands inline to a student summary (service-level clocks, documents, gate, recent updates, shortcuts to the current step, documents and timeline). Pressing a ring in the strip opens the panel with that student already expanded. Escape or the scrim closes it; opening a student closes it and navigates to the case workspace. On phones the same quick view opens as a bottom sheet from the Students tab.

## Dashboards

- **Counsellor:** greeting and one-line position; stat strip (active, overdue, awaiting Team Leader, documents to review); needs-attention queue with direct actions; caseload by stage (click filters the caseload); recent activity; performance (collapsed).
- **Team Leader:** decisions awaiting me with Review deep links; service-level exposure; open cases by stage; counsellor load; team performance.
- **SUPER ADMIN and ADMIN:** system position; stage flow and counsellor load; compliance strip; system health; recent activity from the audit log; performance.
- **Student:** where the application stands, what is needed next, counsellor and key details.

## Notifications

Rows in `public.notifications` are written by the database, not the browser: `notify_case_change()` (trigger `cases_notify`) fans out assignment, gate, document and profile events to the right recipients, and lpl-api's reminder worker calls `emit_sla_notifications()` every 15 minutes (`SLA_REMINDER_INTERVAL`) to raise due-soon and overdue clock notifications, once per clock, state and due date. The client polls `notification_state()` with the workspace tick and pages with `notifications_page`; `mark_notifications_read` / `mark_all_notifications_read` are own-rows only. lpl-api prunes notifications older than `NOTIFICATION_RETENTION_DAYS` (90); `prune_notifications(days)` remains for a SUPER ADMIN to trim by hand.

**Web Push** (hosted builds only; the single-file build cannot register a service worker): generate a VAPID key pair (`npx web-push generate-vapid-keys`), give lpl-api `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (a secret) and `VAPID_SUBJECT` (a `mailto:` or `https:` contact), and paste the public key in Settings → Notifications. lpl-api delivers within about ten seconds of a notification being written, only to push services on its allow-list (`PUSH_ENDPOINT_HOSTS`), only to active accounts, and not at all once a notification is a day old.

## Audit

Every action is a typed event (`src/lib/audit.ts`). Each row keeps the v4 `action` label, `target` and `detail`, and adds `event_type`, `entity_type`, `entity_id`, `entity_label`, `outcome`, `source`, `session_id`, `summary`, and for updates a field-level `changes` diff (special-category fields are redacted before they leave the browser) plus `meta`. Sign-in and sign-out are recorded; failed sign-ins are recorded against a known profile in browser-storage mode.

The audit log is no longer part of the workspace snapshot. The **Audit log** page reads `audit_page(...)` — filtered by date range, person, event type, record type and free text, keyset-paginated 50 at a time, default window 30 days — and loads `audit_detail(id)` only when a row is opened. Export pages through the same RPC with the current filters. Rows written before v5 show as *Legacy*. Browser-storage modes keep the 600-entry blob and apply the same filters locally.

## Design system and motion

- **Tiers:** `surface` (solid content), `surface-2` (inset), `float` (the only glass).
- **Spectrum:** eight professional hues (blue, indigo, violet, cyan, teal, emerald, amber, rose), each with a graphic, a text and a tint token, all verified in both themes. Stat tiles rotate hues automatically (solid gradient icon badge, accent edge, faint wash); charts, funnel rows and the nine stages (`--stage-1` … `--stage-9`) use the spectrum; semantic state (overdue, due soon, done) keeps its own colours so meaning never depends on decoration.
- **Motion:** opening a case morphs the rail row into the workspace header where View Transitions exist; reordering rail rows glide (FLIP); pages rise 6 px on entry and the entry cascade plays on a page's first visit only. Everything is skipped under `prefers-reduced-motion`.

## Testing

`npm run verify` runs typecheck, eslint, the 177 unit and component tests (logic, store, the
server adapter's wire contract, views, an axe WCAG A/AA suite in jsdom for every role in both
themes, performance guards) and the contrast check. The Go suites (`server/`), the end-to-end
suites (`npm run test:e2e`, `npm run test:ui`) and what each layer proves are listed in
`docs/ARCHITECTURE.md`; CI runs all of them on every change.

## Theme

Lyceum palette: royal blue `#1240b3`, navy `#0b1f4b`, white `#ffffff`, midnight black `#000000`.
Light mode is white ground with black ink; dark mode is a pure `#000000` ground with white ink and a sky-royal accent. There are no grey surfaces in dark mode — panels separate by hairline and glow.
Every text token is verified at **7:1 or better (WCAG 2.1 AAA)** against every surface it is composed on, and every graphic token at 3:1, in both themes — including the eight spectrum hues. Run `npm run contrast` to see the table; it reads the tokens from `tokens.css`, so the numbers cannot drift from what ships.

## Access control

Roles: **SUPER ADMIN** (Group IT, restricted to Group IT email domains), **ADMIN** (Placement
Team, operational administration only), Team Leader, Counsellor and Student. Every cell of the
resource × action matrix is enforced by row-level security and guard triggers in the database;
system configuration, the permission matrix and the Prompt Engineer Workspace are locked to
SUPER ADMIN, and only a SUPER ADMIN manages administrator accounts. The full model, the
standard matrix and the upgrade from v5: **`docs/RBAC.md`**.

## Authentication — closed registration

There is no public sign-up. The sign-in form is the only authentication feature visible to the public.

- **First run.** On an empty project the sign-in screen shows "Set up the administrator" once. That account is created through GoTrue sign-up and, if its email is on a Group IT domain, the database trigger makes it the first SUPER ADMIN. This is the only sign-up the trigger ever accepts.
- **Every other account** is created by an administrator: Staff → Create a profile (staff), or Cases → Create student (students). With the `account.write` permission the administrator issues a temporary password at the same time. The browser calls lpl-api's `admin-users` endpoint, which verifies the caller may manage that account (only a SUPER ADMIN manages administrators) and creates the identity with the service role key on the server. The service role key never reaches the browser.
- **Anything else** — any public sign-up once the project has an administrator — is refused inside the database transaction by `handle_new_auth_user()`, so no orphan identity is created even if sign-ups are left enabled in the Supabase dashboard. A public sign-up never claims a profile, not even by matching email: only identities created through `admin-users` (stamped in `app_metadata`) are linked. Disable "Allow new users to sign up" in the dashboard after bootstrap for defence in depth.
- **Passwords** must be at least 10 characters and mix three character classes; the rule is enforced in the browser and again by lpl-api.
- **Password resets** are administrator actions (Staff → Set temporary password). There is deliberately no self-service reset on the public screen.
- **Deactivation** removes the role from any live token (policies read `active`) and bans the identity through lpl-api.

## Connecting a server

A production build always talks to one lpl-api, fixed at build time; it never stores records
in the browser.

1. Create a Supabase project. **Choose the region closest to Colombo (Singapore, `ap-southeast-1`).**
2. Apply the schema: `supabase/schema.sql` in the SQL editor for a new project, or the
   **Migrate database** workflow for an existing one (`docs/OPERATIONS.md`).
3. Deploy lpl-api (`server/`, configured through its environment, `server/.env.example`). It
   holds the service role key; the browser never does.
4. Build the web application for it: `VITE_API_URL` (the lpl-api origin, https) and
   `VITE_API_ANON_KEY` (the public anon key). CI does this from repository variables; the build
   refuses a service-role key and a non-https API.
5. For the first account, turn off email confirmation under Authentication → Providers for the
   set-up moment (or confirm the email first), then complete "Set up the administrator" with a
   Group IT address: it becomes the first SUPER ADMIN.
6. Disable "Allow new users to sign up" under Authentication → Providers → Email. The database
   already refuses public sign-ups; this is the second lock.
7. Record the Supabase project and the lpl-api host under Data protection → Standing processors.

Development builds (`npm run dev`) can instead be pointed at a server under Settings → Server
connection, or run in browser storage for a walkthrough.

## Deployment

The web application is one HTML file plus `sw.js`, built for exactly one API origin; lpl-api
is a container. `.github/workflows/ci.yml` deploys both from `main` after every gate passes
(lpl-api to GHCR and the `production` environment with an automatic rollback on a failed smoke
test, the web application to GitHub Pages), `rollback.yml` restores any commit that passed CI,
and `migrate.yml` applies database migrations behind an approval. Setup, variables and secrets:
**`docs/OPERATIONS.md`**. `dist/LPL_Placement_Management_System.html` is the same page as a
single-file deliverable.

## Hardening in the built file

- **Content-Security-Policy** meta injected by `scripts/finalize.mjs`: every inline script is allowed by SHA-256 hash and nothing else may execute; styles are inline (React sets style attributes); images and fonts are `data:` URIs; network access is limited to exactly the API origin the build was made for (plus `LPL_CONNECT_SRC`); `base-uri` and `form-action` are `none`.
- **Error boundary** around the application (`src/main.tsx`): a render error in one view shows a recovery panel with "Back to start" and "Reload" instead of a blank page.
- **Polling** reads four change counters (`change_versions()`) and re-reads only what moved; lists are paged from the server, never downloaded whole.
- **Version** comes from `package.json` at build time (`__APP_VERSION__`) and is shown on the sign-in screen.

## Ownership notice

The attribution is recorded in every layer so that anyone inspecting the product, the source or the database sees it: "Developed by Bhanu Mendis - Group IT" on the frontend and "Copyright © Bhanu Mendis - LGH IT" on the backend. `node scripts/check-attribution.mjs` (run in CI) fails a source file that lacks its form, and any file that still carries the old reserved-rights line.

| Where | How |
|---|---|
| Every source file (`.ts`, `.tsx`, `.css`, `.sql`, `.go`, `.sh`, `.mjs`, `.yml`) | Header comment, frontend or backend form |
| Built HTML | Banner comment at the top, `<meta name="author">` and `<meta name="copyright">` |
| Minified JavaScript inside the built HTML | `/*! @license */` block preserved by the bundler (`esbuild.legalComments: "inline"`) |
| Running application | `window.__LPL_PMS__` object and a console notice on start |
| Database | `COMMENT ON TABLE` on every table in `supabase/schema.sql`, visible in the Table Editor, `psql \d+` and `pg_dump` |
| Repository | `LICENSE` and `package.json` `author` / `license: UNLICENSED` |

## The nine stages

The 31 steps remain the system of record, but nobody works with 31 items on screen. The pipeline groups them into the nine historical stages of the process document (§5); the cross-cutting three-month follow-up (X1, step 31) is presented inside stage 9 so the journey ends where the student does. In the case workspace the stages are an accordion: only the stage containing the current step is expanded by default, with the micro-steps underneath. The student journey uses the same nine stages.

## Prompt Engineer Workspace

An isolated, SUPER ADMIN-only area for authoring, previewing and versioning prompt templates (`{{variable}}` placeholders, sample inputs, compiled preview, version history, import and export). Nothing in it calls any model or external API from the browser and no student data is sent anywhere. Templates are stored in the `prompts` table under SUPER ADMIN-only policies.

## Data protection

Closes absences 2 and 3 of §10 of the process document and feeds the three compliance metrics in §11.

**Cross-border transfer register.** A record is written automatically whenever personal data leaves Sri Lanka: step 11, step 18 and step 23. Safeguards default to **None recorded** deliberately — the register is there to show the gap.

**Retention.** Cases enter a schedule when they exit, complete or go dormant. Disposal **anonymises rather than deletes**: outcomes, dates, destinations, programmes, institutions and the transfer register survive; names, contact details, passport numbers, academic records, sponsor and health information, document filenames and the case narrative are destroyed. A **legal hold** suspends disposal.

## Accessibility

WCAG 2.2 AA is verified in a real browser on every change: `npm run test:ui` runs axe (colour
contrast included) over every role's pages in the production bundle at 1440×900, 1280×800,
1024×768, 768×1024, 390×844, 375×812 and 360×800, plus dark at 1440, and fails on sideways
scrolling or console errors. Token contrast is held at AAA (`npm run contrast`). Dialogs trap
focus, every chart prints its values as text, motion respects reduced-motion, and Windows
forced-colours mode has real borders on every surface.

Still needing a real person: a screen-reader pass (NVDA or VoiceOver) through the counsellor
"complete a step" flow and the student profile form.

## Security note

The production build always talks to lpl-api and refuses to fall back to browser storage.
Browser-storage mode (with client-side SHA-256 password hashing) exists only in development
builds, for walkthroughs, never for real student data. Controls and what operators own:
**`docs/SECURITY.md`**.

## Status

v6.0.0 (25 September 2026). The release report (production readiness, residual risks and what
remains to be done by people) is in the pull request that introduced v6; `docs/OPERATIONS.md`
has the release checklist. Not in this release: storage of uploaded document files (the system
records each document's details and review, not the file), and a screen-reader pass by a
person.

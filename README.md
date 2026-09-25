# Lyceum Placements — Placement Management System (v5)

Production build of the Placement Management System for Lyceum Placements (Private) Limited.
React 18 + Vite 5 + TypeScript, built as a single HTML file, backed by Supabase.
Copyright (c) 2026 Bhanu Mendis. All rights reserved.
Built on process document LGH/IMS/PROC/LPL/001: 31 process steps, presented as 9 stages, with Team Leader gates at steps 16 and 19 and three tracked service level clocks (CIS, offer lapse, follow-up).

## Build

```bash
npm install
npm run verify       # typecheck + eslint + vitest (unit, component, axe, performance guards) + contrast
npm run test         # vitest only
npm run contrast     # WCAG AAA verification of every design-token pair, both themes
npm run build        # verify, then -> dist/LPL_Placement_Management_System.html (single file) and dist/sw.js
```

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
| `supabase/schema.sql` | Tables, helper functions, row-level security mirroring the permission matrix, closed-registration trigger, case write guard, v5 audit columns, notifications and push subscriptions |
| `supabase/migrations/20260912_notifications_audit.sql` | The v5 additions for a project already provisioned from the v4 schema |
| `server/` | **lpl-api** (Go): serves `/rest/v1`, `/auth/v1` and `/functions/v1/admin-users` in place of Supabase's request path, and runs the background work (Web Push delivery, service-level reminders, the shared dashboard, notification retention) that Edge Functions and pg_cron did before v6. See `server/README.md` |
| `.github/workflows/pages.yml` | Builds and publishes the test site to GitHub Pages on every push to `main` |
| `.github/workflows/server.yml` | Builds and tests `server/` against a Postgres carrying `supabase/schema.sql` |
| `LICENSE` | Ownership notice, all rights reserved |

## Application shell

One shell for every signed-in role. A utility bar carries the brand, search (Ctrl/⌘ K), the notification bell and the profile menu; primary navigation is a **floating dock** at the top centre (Alt 1–9 jumps to a destination). Under 1024 px the dock becomes a bottom tab bar with a More sheet. Pages render on a solid ground; only floating things (bar, dock, popovers, sheets, toasts) are glass.

### Counsellor student rail

Roles whose case scope is *assigned* get a rail on the **left edge that is always minimised**: a launcher and one progress ring per assigned student, the ring drawn in the colour of the student's current stage, with a severity dot and an unseen-updates dot. Pressing the launcher slides the **quick view** open from the left: a caseload summary (active, needing attention, average progress), search, and every student grouped by urgency with their **percentage, stage (n of 9), current step**, nine-stage track and most urgent item. Each row expands inline to a student summary (service-level clocks, documents, gate, recent updates, shortcuts to the current step, documents and timeline). Pressing a ring in the strip opens the panel with that student already expanded. Escape or the scrim closes it; opening a student closes it and navigates to the case workspace. On phones the same quick view opens as a bottom sheet from the Students tab.

## Dashboards

- **Counsellor:** greeting and one-line position; stat strip (active, overdue, awaiting Team Leader, documents to review); needs-attention queue with direct actions; caseload by stage (click filters the caseload); recent activity; performance (collapsed).
- **Team Leader:** decisions awaiting me with Review deep links; service-level exposure; open cases by stage; counsellor load; team performance.
- **Administrator:** system position; stage flow and counsellor load; compliance strip; system health; recent activity from the audit log; performance.
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

`npm run verify` runs typecheck, eslint and vitest: unit tests for logic, signals, audit, store, motion and hooks; component tests for the shell, dock, palette, rail, notifications, dashboards, cases list and audit explorer; an axe-core WCAG 2.1 A/AA suite over the main screens for every role in both themes; and performance guards (a quiet poll re-renders nothing, the server load reads no audit rows, blur stays on the float tier). Colour contrast is verified by `npm run contrast` rather than axe because jsdom does not compute styles.

## Theme

Lyceum palette: royal blue `#1240b3`, navy `#0b1f4b`, white `#ffffff`, midnight black `#000000`.
Light mode is white ground with black ink; dark mode is a pure `#000000` ground with white ink and a sky-royal accent. There are no grey surfaces in dark mode — panels separate by hairline and glow.
Every text token is verified at **7:1 or better (WCAG 2.1 AAA)** against every surface it is composed on, and every graphic token at 3:1, in both themes — including the eight spectrum hues. Run `npm run contrast` to see the table; it reads the tokens from `tokens.css`, so the numbers cannot drift from what ships.

## Access control

### Permission matrix

Every protected resource exposes the same five actions and a role either holds a cell or does not:

| Action | Meaning |
|---|---|
| View | The area, list or summary is visible and can be navigated to |
| Read | The full record and its field values can be opened |
| Write | Records can be created or changed |
| Delete | Records can be removed, disposed of or reset |
| Download | Data or files can be exported out of the system |

Resources: cases, special-category fields, counsellor assignment, documents, document review, Team Leader gates, SLA escalations, team analytics, staff profiles, sign-in accounts, roles and permissions, audit log, organisation settings, data protection, Prompt Engineer Workspace.

Case visibility is scoped on top of the matrix: **own** (student), **assigned** (counsellor), **all** (Team Leader, Administrator). Both the matrix and the scope are edited under Roles and permissions and apply immediately.

Two cells are fixed by design and cannot be changed by configuration:

- **Administrator** is the system owner and holds every cell.
- **Prompt Engineer Workspace** belongs to the Administrator only and cannot be granted to any other role.

### Standard model

| Resource | Administrator | Team Leader | Counsellor | Student |
|---|---|---|---|---|
| Cases | all | view read write download | view read write download | view read write (own case) |
| Special-category fields | all | view read write | view read write | view write (supplies own) |
| Counsellor assignment | all | view write | view | view |
| Documents | all | view read download | view read write download | view read write download (own) |
| Document review | all | view write | view write | view |
| Team Leader gates | all | view read write | view read | — |
| SLA escalations | all | view read | — | — |
| Team analytics | all | view read download | — | — |
| Staff profiles | all | view read | view | — |
| Sign-in accounts | write delete | — | — | — |
| Roles and permissions | all | — | — | — |
| Audit log | all | view read | — | — |
| Organisation settings | all | — | — | — |
| Data protection | all | view read write download | — | — |
| Prompt Engineer Workspace | all (locked) | — | — | — |

### How it is enforced

Row-level security, not application code. Every data-access policy in `supabase/schema.sql` calls `app_can('resource.action')`, which reads the configured matrix out of `org_config` (falling back to `permission_defaults`) for the calling user's role, and `case_in_scope()` for visibility. A `before update` trigger on `cases` enforces the cells that live inside the case JSON: gate decisions need `gate.write`, uploads `document.write`, reviews `review.write`, removals `document.delete`, reassignment `assignment.write`, disposal `dataprotection.delete`, legal holds `dataprotection.write`; decided gates and uploaded file records are immutable; events are append-only and attributed to the caller; a student can change only their step-2 answers, their own uploads and the two confirmations at steps 26 and 29. Audit rows are attributed by a trigger, never by the client. `org_config` is split by key: `permissions`/`caseScope` need `role.write`, `processors` need `dataprotection.write`, everything else `settings.write`. Workspace backup and restore are Administrator-only.

`prompts` is Administrator-only in every policy, regardless of configuration. No table is granted to the anonymous role; an anonymous caller can only ask `needs_bootstrap()`.

## Authentication — closed registration

There is no public sign-up. The sign-in form is the only authentication feature visible to the public.

- **First run.** On an empty project the sign-in screen shows "Set up the administrator" once. That account is created through GoTrue sign-up and the database trigger makes it the Administrator because it is the first profile. This is the only sign-up the trigger ever accepts.
- **Every other account** is created by an administrator: Staff → Create a profile (staff), or Cases → Create student (students). With the `account.write` permission the administrator issues a temporary password at the same time. The browser calls lpl-api's `admin-users` endpoint, which verifies the caller is an active Administrator and creates the identity with the service role key on the server. The service role key never reaches the browser.
- **Anything else** — any public sign-up once the project has an administrator — is refused inside the database transaction by `handle_new_auth_user()`, so no orphan identity is created even if sign-ups are left enabled in the Supabase dashboard. A public sign-up never claims a profile, not even by matching email: only identities created through `admin-users` (stamped in `app_metadata`) are linked. Disable "Allow new users to sign up" in the dashboard after bootstrap for defence in depth.
- **Passwords** must be at least 10 characters and mix three character classes; the rule is enforced in the browser and again by lpl-api.
- **Password resets** are administrator actions (Staff → Set temporary password). There is deliberately no self-service reset on the public screen.
- **Deactivation** removes the role from any live token (policies read `active`) and bans the identity through lpl-api.

## Connecting a server

Without a server the application stores everything in the browser, which is fine for a walkthrough and not fine for real student records.

1. Create a Supabase project. **Choose the region closest to Colombo (Singapore, `ap-southeast-1`).**
2. Run `supabase/schema.sql` in the project's SQL editor.
3. Deploy lpl-api (`server/`, see `server/README.md`) against the project's database and GoTrue. It holds the service role key; the browser never does.
4. For the first administrator, either turn off email confirmation under Authentication → Providers for the set-up moment, or confirm the email from the inbox before signing in.
5. In the application: Settings → Server connection → paste the **lpl-api** URL and the **anon** key → Test connection → Connect.
6. Sign out, then complete "Set up the administrator" on the sign-in screen.
7. Add the project to Data protection → Standing processors.

Alternatively, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time (see `.env.example`) to bake the connection in. A connection entered in Settings overrides the build-time one.

**Go service instead of Supabase's request path.** `server/` holds `lpl-api`, which speaks the same contract this file uses, so the project URL entered in Settings (or baked in at build time) can point at it. The built file's Content-Security-Policy only admits `*.supabase.co`; when the API lives elsewhere, build with `LPL_CONNECT_SRC="https://api.example.com" npm run build` so that origin is admitted too. See `server/README.md` and `server/docs/CUTOVER.md`.

**Never put the `service_role` key in the browser.** Only the anon key belongs here; it grants nothing on its own.

After the first connection, disable "Allow new users to sign up" under Authentication → Providers → Email. The database already refuses public sign-ups; this is the second lock.

## Deployment

The build is one HTML file, so it can be hosted anywhere static files are served. Two arrangements are in use:

- **Test site (GitHub Pages).** `.github/workflows/pages.yml` runs on every push to `main`: `npm ci`, then `npm run build` (typecheck and AAA contrast check first, so a failure blocks the deploy), then publishes `dist/` to Pages. Enable once per repository under Settings → Pages → Source: GitHub Actions. The current test site is https://bhanumendis.github.io/LPL-PMS/ from the `bhanumendis/LPL-PMS` repository. Without a connected server it runs in browser-storage mode; connect a Supabase project from Settings to test the real backend on the same URL.
- **Deliverable.** `dist/LPL_Placement_Management_System.html` is the file handed over; it carries the version banner, the ownership notice and the Content-Security-Policy described below.

Remotes on the development machine: `personal` → `bhanumendis/LPL-PMS` (test site), `origin` → the Lyceum organisation repository.

## Hardening in the built file

- **Content-Security-Policy** meta injected by `scripts/finalize.mjs`: every inline script is allowed by SHA-256 hash and nothing else may execute; styles are inline (React sets style attributes); images and fonts are `data:` URIs; network access is limited to `*.supabase.co` / `*.supabase.in`; `base-uri` and `form-action` are `none`.
- **Error boundary** around the application (`src/main.tsx`): a render error in one view shows a recovery panel with "Back to start" and "Reload" instead of a blank page.
- **Polling** asks `workspace_version()` (one row, computed under the caller's own row-level security) before downloading anything, and an unchanged poll re-renders nothing.
- **Version** comes from `package.json` at build time (`__APP_VERSION__`) and is shown on the sign-in screen.

## Ownership notice

The copyright is recorded in every layer so that anyone inspecting the product, the source or the database sees it:

| Where | How |
|---|---|
| Every source file (`.ts`, `.tsx`, `.css`, `.sql`, `.mjs`, `.yml`) | Header comment |
| Built HTML | Banner comment at the top, `<meta name="author">` and `<meta name="copyright">` |
| Minified JavaScript inside the built HTML | `/*! @license */` block preserved by the bundler (`esbuild.legalComments: "inline"`) |
| Running application | `window.__LPL_PMS__` object and a console notice on start |
| Database | `COMMENT ON TABLE` on every table in `supabase/schema.sql`, visible in the Table Editor, `psql \d+` and `pg_dump` |
| Repository | `LICENSE` (all rights reserved) and `package.json` `author` / `license: UNLICENSED` |

## The nine stages

The 31 steps remain the system of record, but nobody works with 31 items on screen. The pipeline groups them into the nine historical stages of the process document (§5); the cross-cutting three-month follow-up (X1, step 31) is presented inside stage 9 so the journey ends where the student does. In the case workspace the stages are an accordion: only the stage containing the current step is expanded by default, with the micro-steps underneath. The student journey uses the same nine stages.

## Prompt Engineer Workspace

An isolated, Administrator-only area for authoring, previewing and versioning prompt templates (`{{variable}}` placeholders, sample inputs, compiled preview, version history, import and export). Nothing in it calls any model or external API from the browser and no student data is sent anywhere. Templates are stored in the `prompts` table under Administrator-only policies.

## Data protection

Closes absences 2 and 3 of §10 of the process document and feeds the three compliance metrics in §11.

**Cross-border transfer register.** A record is written automatically whenever personal data leaves Sri Lanka: step 11, step 18 and step 23. Safeguards default to **None recorded** deliberately — the register is there to show the gap.

**Retention.** Cases enter a schedule when they exit, complete or go dormant. Disposal **anonymises rather than deletes**: outcomes, dates, destinations, programmes, institutions and the transfer register survive; names, contact details, passport numbers, academic records, sponsor and health information, document filenames and the case narrative are destroyed. A **legal hold** suspends disposal.

## Accessibility

WCAG 2.1 AAA target. Contrast is computed (`npm run contrast`); the nine-stage accordion uses `button[aria-expanded][aria-controls]` headers with `role="region"` panels and arrow-key movement; dialogs are `role="dialog"` + `aria-modal` with focus trapped, a fixed header, an internally scrolling body and a sticky action row so long forms are completable on any screen height; every chart prints its values as text; Windows forced-colours mode has real borders on every surface.

Still needing a real machine and a real person: a screen-reader pass (NVDA or VoiceOver) through the counsellor "complete a step" flow and the student profile form.

## Security note

With no server, passwords are hashed client-side (SHA-256) and stored with the workspace. That is acceptable for a controlled walkthrough and **not** acceptable for anything internet-facing. Connect a server before real student data goes in.

## Status and outstanding checks

v5.0.0 (13 September 2026, branch `redesign/v5`): typecheck, eslint, 111 vitest tests including the axe suite, and every token pair at AAA in both themes, all green; `server/` Go tests green. Checked in a browser at 1440, 768 and 375 px for the administrator, Team Leader and counsellor: no page scrolls sideways, no section fails to draw. The single-file build is 747 KB, above the 700 KB budget the redesign set; the growth is the notification, audit, rail and motion code, not assets. The acceptance record is `docs/superpowers/plans/2026-09-12-acceptance.md`.

Still to be done by hand before real student data goes in:

1. Exercise the Supabase path end to end on a real project (schema or migration, lpl-api with its workers, bootstrap, create profile with sign-in, complete a step, Team Leader decision, notification fan-out, service-level reminders, audit explorer paging, a push to a real device). The server code is consistent and unit-tested but has not yet run against a live project.
2. A screen-reader pass (NVDA or VoiceOver) through "complete a step", the student rail quick view and the student profile form.
3. Windows forced-colours mode on a real machine.
4. Workspace backups taken while connected to a server no longer include audit rows; export the audit log from the Audit log page instead.

# Lyceum Placements — Placement Management System (v4)

Production build of the Placement Management System for Lyceum Placements (Private) Limited.
React 18 + Vite 5 + TypeScript, built as a single HTML file, backed by Supabase.
Copyright (c) 2026 Bhanu Mendis. All rights reserved.
Built on process document LGH/IMS/PROC/LPL/001: 31 process steps, presented as 9 stages, with Team Leader gates at steps 16 and 19 and three tracked service level clocks (CIS, offer lapse, follow-up).

## Build

```bash
npm install
npm run typecheck    # tsc --noEmit
npm run contrast     # WCAG AAA verification of every design-token pair, both themes
npm run build        # -> dist/LPL_Placement_Management_System.html (single file)
```

No runtime dependency beyond React and lucide-react. The Supabase client is hand-rolled over `fetch` so the single-file build stays dependency-free. Fonts (Poppins, Lora) are embedded as base64 WOFF2 subsets.

There is no sample or seed data anywhere in the build. A new workspace starts empty.

## Layout

| Path | Purpose |
|---|---|
| `src/lib/spine.ts` | The 31 steps and their fields; the **9-stage pipeline** (`PIPELINE`) that users see; document checklists, exit codes, data-protection reference tables |
| `src/lib/logic.ts` | Step state machine, gates, SLA clocks, pipeline progress, retention and transfer engine, analytics |
| `src/lib/rbac.ts` | The resource × action permission matrix, case visibility scope, locked cells |
| `src/lib/store.ts` | Persistence. Picks an adapter: server → `window.storage` → `localStorage` → memory |
| `src/lib/server.ts` | Supabase adapter — PostgREST for data, GoTrue for identity, Edge Function for account administration |
| `src/lib/defaults.ts` | Empty-workspace shapes and configuration normalisation |
| `src/lib/ui.tsx`, `src/lib/charts.tsx` | Design-system primitives and SVG charts |
| `src/styles/app.css` | Lyceum theme tokens (light and true-black dark), glass surfaces, forced-colours, motion, print |
| `src/views/*` | Sign-in, staff shell and pages, case workspace, step panel, documents, student shell, Prompt Engineer Workspace |
| `scripts/contrast.mjs` | Computes every token pair's contrast ratio from the stylesheet; `npm run build` runs it (and the typecheck) first and stops on any pair below AAA |
| `supabase/schema.sql` | Tables, helper functions, row-level security mirroring the permission matrix, closed-registration trigger, case write guard |
| `supabase/functions/admin-users/` | Edge Function through which administrators create sign-ins and set temporary passwords |

## Theme

Lyceum palette: royal blue `#1240b3`, navy `#0b1f4b`, white `#ffffff`, midnight black `#000000`.
Light mode is white ground with black ink; dark mode is a pure `#000000` ground with white ink and a sky-royal accent. There are no grey surfaces in dark mode — panels separate by hairline and glow.
Every text token is verified at **7:1 or better (WCAG 2.1 AAA)** against every surface it is composed on, and every graphic token at 3:1, in both themes. Run `npm run contrast` to see the table; it reads the tokens from `app.css`, so the numbers cannot drift from what ships.

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
- **Every other account** is created by an administrator: Staff → Create a profile (staff), or Cases → Create student (students). With the `account.write` permission the administrator issues a temporary password at the same time. The browser calls the `admin-users` Edge Function, which verifies the caller is an active Administrator and creates the identity with the service role key on the server. The service role key never reaches the browser.
- **Anything else** — any public sign-up once the project has an administrator — is refused inside the database transaction by `handle_new_auth_user()`, so no orphan identity is created even if sign-ups are left enabled in the Supabase dashboard. A public sign-up never claims a profile, not even by matching email: only identities created by the Edge Function (stamped in `app_metadata`) are linked. Disable "Allow new users to sign up" in the dashboard after bootstrap for defence in depth.
- **Passwords** must be at least 10 characters and mix three character classes; the rule is enforced in the browser and again in the Edge Function.
- **Password resets** are administrator actions (Staff → Set temporary password). There is deliberately no self-service reset on the public screen.
- **Deactivation** removes the role from any live token (policies read `active`) and bans the identity through the Edge Function.

## Connecting a server

Without a server the application stores everything in the browser, which is fine for a walkthrough and not fine for real student records.

1. Create a Supabase project. **Choose the region closest to Colombo (Singapore, `ap-southeast-1`).**
2. Run `supabase/schema.sql` in the project's SQL editor.
3. Deploy the Edge Function: `supabase functions deploy admin-users` (the platform injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; no other secret is needed).
4. For the first administrator, either turn off email confirmation under Authentication → Providers for the set-up moment, or confirm the email from the inbox before signing in.
5. In the application: Settings → Server connection → paste the project URL and the **anon** key → Test connection → Connect.
6. Sign out, then complete "Set up the administrator" on the sign-in screen.
7. Add the project to Data protection → Standing processors.

Alternatively, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time (see `.env.example`) to bake the connection in. A connection entered in Settings overrides the build-time one.

**Never put the `service_role` key in the browser.** Only the anon key belongs here; it grants nothing on its own.

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

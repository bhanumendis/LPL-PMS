# LPL PMS v5 — UI/UX reimagination: audit, blueprint and gate

Lyceum Placements — Placement Management System. Developed by Bhanu Mendis - Group IT
Prepared 12 September 2026 for the Phase 3 hard gate. Nothing in production code has been changed.

---

## 0. Read this first: the product is a placement pipeline, not an LMS

The brief describes an LMS with Student, Counsellor, Parent and Admin roles and with courses, attendance, assessments and messaging. The application in this repository is the **Placement Management System**: one case per student, 31 process steps grouped into 9 stages, two Team Leader gates (steps 16 and 19), three service-level clocks, document checklists at steps 10 and 15, a retention and transfer register. Its roles are **Administrator, Team Leader, Counsellor, Student**.

The redesign therefore maps the brief onto the real domain instead of inventing data the schema does not hold:

| Brief says | In this product | Redesign uses |
|---|---|---|
| Students assigned to a counsellor | Cases where `counsellorId` is the counsellor (scope `assigned`) | The counsellor rail lists the assigned caseload |
| Subject progress (Mathematics 78%) | Case completion over applicable steps; 9-stage pipeline progress | Completion ring + 9-segment stage track per case |
| Subjects requiring attention | SLA clocks (CIS due, offer lapse, follow-up), returned gates, documents awaiting review, student profile awaiting confirmation | "Attention" signals, one derivation shared by rail, dashboards and lists |
| Attendance, assessments, courses | Do not exist | Not invented. Nothing is shown that the record does not contain |
| Messages / unread communication | No messaging exists; cases have an append-only event timeline | "Unseen updates" marker: events on a case since the counsellor last opened it (client-side last-seen marker, no schema change) |
| Parent role | Does not exist in `app_users.role`, the matrix, RLS or the Edge Function | **Not added.** Adding a role is a security-model change that needs its own approval (decision D1) |
| Team Leader | Exists, not in the brief | Gets its own information priorities (approvals first) |
| Existing notification system, bell, send-notification, notification Edge Functions | **None exist.** There is a toast context for transient messages, derived attention logic, the audit log and case events. The only Edge Function is `admin-users` | A notification subsystem is designed from those signals (section 6) and reuses the existing store, polling probe, RLS helpers and Edge Function pattern |

---

## 1. Phase 1 — audit findings

### 1.1 Architecture

| Area | Finding |
|---|---|
| Stack | React 18.3, Vite 5, TypeScript strict, `lucide-react`. No router, no state library, no CSS framework, no test runner, no linter. Build is **one HTML file** (`vite-plugin-singlefile`), fonts and logo embedded as base64; 635 KB. Also opened as `file://` deliverable and served on GitHub Pages |
| Routing | Hash routes parsed in `src/App.tsx:52-71` (`#/`, `#/{page}`, `#/{page}/{id}`, `#/case/{id}`, `#/case/{id}/step/{n}`, `#/case/{id}/{tab}`). `go()` in `App.tsx:119` |
| Session | `SessionCtx` (`App.tsx:20-35`): snapshot, user, `can()`, `isAdmin`, route, `go`, `log`, theme. Whole tree re-renders on any store emit |
| Shells | `StaffShell.tsx` (left sidebar 260px + 60px top bar, mobile drawer) and `StudentShell.tsx` (top bar with segmented nav). Page chosen by `switch` on `route.page` with permission checks (`StaffShell.tsx:72-85`) |
| Data | `store.ts` picks a backend: Supabase → `window.storage` → `localStorage` → memory. Server mode polls `workspace_version()` every 8 s and re-downloads **everything** (org, users, all visible cases, 600 audit rows, prompts) when the hash moves (`store.ts:298-323`, `server.ts:326-357`) |
| RBAC | Resource × action matrix in `rbac.ts`, mirrored by `app_can()` and RLS in `schema.sql`; case scope own/assigned/all. Interface consults every cell |
| Auth | GoTrue password grant, refresh, closed registration (DB trigger), `admin-users` Edge Function for account creation. Session id kept in `sessionStorage`; server token in `localStorage` |
| Audit | Flat table `audit(id, at, actor_*, action, target, detail)`; actor attributed by trigger; `action` is free text: **51 distinct strings** from 4 `appendAudit` call sites and ~45 `log()` sites (inventory in §1.4); page filters client-side over the 600-row window and renders 200 (`Audit.tsx`); index only on `at desc`. Delete needs `settings.delete`. Gaps: no sign-in/sign-out event, no event for workspace reset, server connect/disconnect or restore-collision; Escalations writes nothing |
| Notifications | None. `ToastProvider` (`ui.tsx:167-187`) for transient feedback; `StoreErrorToasts` for write failures |
| Go façade (`server/`) | Uncommitted Phase 2 work. Allow-lists tables/columns (`contract/tables.go`), RPCs (`functions.go`) and a query grammar of `eq/neq/is`, `order`, `limit`, `offset`, `select=*` only (`query.go`). **Any new table, column, RPC or operator the frontend uses must be added there or the façade refuses it** |
| CSP | `scripts/finalize.mjs`: `script-src` by hash, `connect-src *.supabase.co` (+ `LPL_CONNECT_SRC`), no `worker-src`. Everything except the two HTMLs is deleted from `dist/` |
| Design tokens | `app.css:17-158`: brand, ink, semantic status, glass, shadows, type, radius, motion (`--spring`, `--ease`, `--t-fast/med/slow`), `--sidebar-w`. AAA contrast verified by `scripts/contrast.mjs` (93 pairs) on every build |
| Motion | Tokens `--spring`, `--ease`, `--t-fast/med/slow`; six keyframes (`fade`, `rise`, `pop`, `sheet`, `spin`, `drift`); `.page` and `.stagger` entry with a 9-step delay ladder; chart durations hard-coded (0.9 s, 1 s, 1.1 s) outside the tokens; reduced-motion kills all animation globally (`app.css:749-753`) |
| Glass | **Every** panel, card, modal, toast, sidebar and top bar uses `backdrop-filter: blur(24px)` (`app.css:238-243`) — 10-20 blurred surfaces per page |
| Responsive | Seven CSS breakpoints that do not line up: 1100 (grids), 1023 (shell, workspace, prompt layout), 960/480 (filter bars), 900 (auth), 720 (student nav), 640 (everything else). No JS layout queries. Sidebar → drawer under 1024; dialogs → bottom sheets under 640; tables scroll horizontally (`min-width` 720-1180); one hand-rolled filter grid in Data protection has no breakpoint at all |
| Accessibility | Strong: axe clean on 20 screens × 2 themes, AAA tokens, 44 px targets, focus trap in `Modal`, accordion keyboarding, forced-colours rules, skip link. Outstanding: screen-reader pass |
| Loading | One full-screen spinner ("Opening the workspace…", `App.tsx:142`); no skeletons anywhere; busy labels on some buttons ("Creating…", "Saving…", "Signing in…", "Testing…"); Approvals, Data protection, Documents and Roles have no busy state at all |
| Empty | `Empty` primitive (`ui.tsx:59-68`) with title/hint/action on Cases, Staff, Approvals, Escalations, Data protection, Prompt Engineer, Audit, dashboards; hand-rolled `muted` paragraphs ("No decisions recorded yet.", "None.", "No activity yet.") in Approvals, Escalations, Overview; Roles and Settings have no empty states (they never need one) |
| Errors | Top-level `ErrorBoundary`; toasts for write failures (`StoreErrorToasts`); `Notice tone="bad" role="alert"` in Auth, Staff, Cases, StepPanel, Student profile; Documents reports validation only as toasts; Data protection has no error path of its own; `Denied` panel for permissions; "This case is not available" |
| Tests / lint | None in the frontend. `npm run typecheck` (clean today) and `npm run contrast` are the gates; Go has unit + integration suites |

### 1.2 What to preserve, refactor, redesign, replace, extract

| Preserve unchanged | `lib/logic.ts`, `lib/spine.ts`, `lib/rbac.ts`, `lib/defaults.ts`, `lib/types.ts` (extended additively), `StepPanel.tsx`, `Documents.tsx`, every mutation helper, every `can()` check, `schema.sql` RLS and guards (extended additively), `admin-users`, the Go façade internals |
| Refactor | `store.ts` / `server.ts` (audit leaves the snapshot; notification and audit queries added; `useStore(selector)`), `ui.tsx` (split into primitives), `charts.tsx` (interaction added), `app.css` (tokens extracted, glass tiered) |
| Redesign | `App.tsx` shell selection, `StaffShell`, `StudentShell`, `Overview.tsx` (both dashboards), `Audit.tsx`, `Cases.tsx` list composition, `CaseWorkspace.tsx` header/composition, `StudentShell` home |
| Replace | Left sidebar and student segmented nav → one dock; spinner → skeleton shells; free-text `log()` → typed audit events |
| Extract into primitives | Focus trap (from `Modal`), popover/sheet, tooltip, skeleton, empty state, stat capsule, mini stage track, progress ring sizes, rail row, notification item, filter bar, responsive table→cards |

### 1.3 Domain facts the new components depend on

- Nine pipeline stages (`PIPELINE`, `spine.ts:442`): Capture · Qualify and profile · Match · Feasibility gate · Apply · Offer management · Accept and pay · Visa · Depart and arrive. Step order is stage order (`ORDERED_STEP_NUMBERS`), not numeric: 21 sits in stage 7, 20 in stage 9.
- Student-action steps: 2, 10, 15, 26, 29. Gates: 16 and 19 (Team Leader). Optional: 5, 12, 24, 25. Decision steps: 3, 8, 27. Document steps: 10 (8 kinds) and 15 (7 kinds).
- Progress has two meanings and both are kept: `caseProgress()` = done ÷ applicable steps (drives the ring and the %), `pipelineProgress()` = per-stage done/total over non-optional steps (drives the 9-segment track).
- Attention signals available today: `slaFlags()` (CIS, additional CIS, offer lapse, three-month follow-up; `ok` / `due-soon` / `breached`), `latestGate()` (pending / returned-unaddressed), `pendingReviewCount()`, `steps[2].studentSubmittedAt` without `done`, `retentionState()`, holds past their review date.
- Case reference prefix is `config.entityCode`; the org name is `config.orgName`; SLA windows are `config.sla`.
- Team Leader and Administrator scope is `all`; counsellor `assigned`; student `own` (configurable per role).

### 1.4 Current audit vocabulary (to be mapped 1:1 onto typed events)

51 distinct action strings: account (`Administrator account created`, `Profile created`, `Sign-in issued`, `Sign-in not issued`, `Temporary password set`, `Account reactivated/deactivated`), permissions (`Permission granted/removed`, `Permissions reset to default`, `Case scope changed`), settings (`Settings updated`, `Workspace backup exported`, `Workspace restored from backup`), cases (`Case opened`, `Case assigned/reassigned`, `Case exported`, `Reopen case`, `Place case on hold`, `Defer intake`, `Exit case`, `Complete`), steps (`Step n completed / marked not applicable / reopened / confirmed by student`), gates (`Gate n submitted / resubmitted / approved / returned`), documents (`Document uploaded / accepted / returned / removed`), student (`Profile submitted`), data protection (`Case record disposed`, `Legal hold placed/lifted`, `Transfer record updated`, `Transfer register exported`, `Standing processor added/removed`), prompts (`Prompt template created/duplicated/deleted/saved`, `Prompt templates exported/imported`), exports (`Staff list exported`, `Overview exported`). Every one keeps its label; each gains `event_type`, `entity_type`, `entity_id`, `summary` and, for updates, `changes`.

### 1.5 Problems the redesign must fix (not cosmetic)

1. **Audit in the hot path.** 600 audit rows travel with every workspace reload; every write anywhere bumps `workspace_version()` and triggers that reload for every connected user.
2. **Derived signals recomputed everywhere.** `slaFlags`, `latestGate`, `pendingReviewCount` run 3-4 times per case per render across nav badges, dashboard, cases list.
3. **Blur on every surface.** Expensive on tablets and integrated GPUs; also flattens hierarchy (everything is glass, so nothing floats).
4. **No notification model.** Attention is visible only on the page that computes it.
5. **Whole-tree re-render** on every store emit; acceptable today, not with a rail, a bell and a palette mounted permanently.
6. **Loading experience** is a blank spinner; the shell could paint immediately.
7. **Audit events are prose**, so filtering by entity or type is string matching and change detail is a sentence.

---

## 2. Phase 2 — design blueprint

### A. Application shell

One `AppShell` for every authenticated role. Three layers:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⟐ Lyceum   ╭──────────────────────────────────────╮        🔍  🔔³  ◐  (BM) │  ← Bar: 64px, sticky, glass (float tier)
│            │ ⌂ Home  ▣ Cases  ✓ Approvals  ⏱ Esc… │                          │  ← Dock: floating capsule, centred
│            ╰──────────────────────────────────────╯                          │
├─────────────────────────────────────────────────────────┬────────────────────┤
│  Page (ground tier, no glass)                           │  MY STUDENTS  ⟩    │  ← Rail (counsellor), 300px,
│                                                         │  🔍 search         │     docked ≥1280, collapses to
│  ┌──────────────┐  ┌────────────────────────────┐       │  ● Nimal P.  ▮▮▮▯▯ │     a 64px avatar strip
│  │  Attention   │  │  Caseload flow (9 stages)  │       │    Stage 5 · 3d    │
│  │  queue       │  │  ▁▃▅▇▅▃▁▁▁                 │       │  ● Sithmi J. ▮▮▯▯▯ │
│  └──────────────┘  └────────────────────────────┘       │  ○ Kavindu  ▮▮▮▮▯  │
└─────────────────────────────────────────────────────────┴────────────────────┘
```

- **Bar** (left → right): wordmark (logo only at < 1280); the **dock**, centred; utilities: command search (⌘K / Ctrl K), notification bell with unread count, profile avatar → menu (name, role, branch, connection status with the existing `LiveBadge` semantics, appearance toggle, sign out).
- **Page** region: `main#main` with a page header (title, one-line context, actions) and content. Max width 1360 as today; when the rail is docked the page keeps ≥ 880 px.
- **Rail** slot on the right, present only for roles whose case scope is `assigned` (section E).
- Surfaces: three tiers (section H). The bar and dock float; the page does not.

Files: `src/shell/AppShell.tsx`, `TopBar.tsx`, `Dock.tsx`, `ProfileMenu.tsx`, `CommandPalette.tsx`, `nav.ts`, `StudentRail.tsx`.

### B. Global navigation model

Destinations are declared once in `src/shell/nav.ts` as `{ id, label, icon, route, when(session), badge(signals) }` and rendered by the dock, the mobile tab bar, the command palette and breadcrumbs. Routes and deep links stay exactly as they are today (`#/cases`, `#/case/{id}/step/{n}`, `#/staff`, `#/roles`, `#/audit` …) so nothing bookmarked breaks.

Dock behaviour:
- Active item: sliding highlight (FLIP on one absolutely-positioned pill; spring 320 ms; reduced motion → instant).
- Hover: label brightens, icon lifts 1 px; tooltip with the full label and shortcut (`Alt+1…`) after 400 ms.
- Keyboard: roving `tabindex`, Arrow keys, Home/End, Enter/Space; `aria-current="page"`; `nav[aria-label="Main"]`.
- Badges: counts from the shared signals (unassigned, to review, pending gates, breaches, retention overdue), `aria-label="3 needing attention"` as today.
- Contextual actions: the dock does not carry page actions; the page header does. The bar gains a **context chip** to the left of the dock when inside a case (`⟵ Cases · LPL-2026-0012`), which is the back affordance.
- Collapse: ≥ 1280 icon + label; 1024-1279 icon only, labels in tooltips, active item shows its label; < 1024 the dock leaves the bar and becomes a **bottom tab bar** (section J).

### C. Dashboard information architecture

Principle: a dashboard is a **workspace that answers "what needs me now, where does everything stand, what moved"** in that order. Composition is asymmetrical (main column + side column), sections are few and large, detail is disclosed on interaction.

Common section grammar (all roles):
1. **Attention** (queue with inline actions) — the thing you act on.
2. **Position** (pipeline flow strip; stat capsules with deltas) — where everything stands.
3. **Movement** (recent events / activity) — what changed.
4. **Performance** (funnel, volume, service levels, load) — below the fold, collapsible, remembered per user.

Stat tiles become one **stat strip** (a single surface with 3-5 capsules, each clickable, each with a "vs previous period" delta computed from `monthlyVolume`/`slaCompliance`), not four separate cards.

### D. Role-specific navigation and priorities

| Role | Dock (in order) | Home priorities |
|---|---|---|
| Counsellor | Home · Cases (My caseload) · Approvals (if `gate.view`) | Attention queue (overdue → due soon → returned gate → to review → profile to confirm) with inline "Open step / Review documents"; caseload flow (stage strip); movement on my cases; rail always present |
| Team Leader | Home · Cases · Approvals · Escalations · People (if `staff.read`) · Governance (if `dataprotection.view`/`audit.view`) | Approvals queue first (oldest submission first, age shown), escalations strip, team flow, counsellor load, then performance |
| Administrator | Home · Cases · Approvals · Escalations · People · Governance · More (Settings, Prompt Engineer) | System position: flow, load, compliance (retention overdue, transfers without safeguard), users (active staff/students, profiles without sign-in), activity (audit head via the new page query), connection health; then performance |
| Student | Home · Profile · Documents · Journey | "Where you are now" hero (kept), what we need from you (checklist with CTA), coming next, counsellor card, key details, recent updates; bell present |

Grouped destinations keep their routes: **People** = `#/staff` and `#/roles` (segmented switch on the page); **Governance** = `#/dataprotection` and `#/audit`. A role holding only one of the pair sees that page directly. (Decision D6 lets you keep them flat instead.)

### E. Counsellor persistent student rail

Present for any role whose configured case scope is `assigned` (counsellor by default; if the matrix is changed so counsellors see `all`, the rail switches to attention-only mode instead of listing every case). Mounted in `AppShell`, outside the routed page, so it survives every navigation including the case workspace, settings and the notification center.

```
 MY STUDENTS                     ⟩ collapse
 🔍 Search name or reference
 ─ Needs attention (3) ─────────────
 ● Nimal Perera        LPL-2026-0012
   ▮▮▮▮▯▯▯▯▯  Stage 4 · Feasibility     ⏱ CIS 2d overdue
 ● Sithmi Jayasinghe   LPL-2026-0009
   ▮▮▮▮▮▮▯▯▯  Stage 6 · Offer            ↩ Gate 16 returned
 ─ In progress (11) ────────────────
 ○ Kavindu Silva       ▮▮▯▯▯▯▯▯▯  Stage 2 · 61%     •unseen
 …
 ─ On hold · deferred (2) ▸ (collapsed)
 ─ Completed · exited (7) ▸ (collapsed)
```

Row: initials avatar, name, reference, 9-segment mini stage track (done/current/pending), completion %, one attention chip (highest severity), unseen-updates dot. Sorted by severity then `updatedAt`.

Interactions:
- Click row → case workspace (`#/case/{id}`), with a view transition from the row to the workspace header (section G).
- Chevron or `→` key → **inline preview** (expands in place, no navigation): completion ring 56 px, current stage/step, the three SLA clocks with days, documents awaiting review, latest gate state, last three events, quick actions (Open current step, Documents, Timeline). Hover on desktop opens the same preview after 500 ms as a popover anchored to the row; Escape closes.
- Search filters by name, reference, destination (client-side over the loaded caseload).
- Collapsed strip (64 px): avatars with severity ring; hover shows name; click opens the workspace; the strip keeps the unseen dot.
- Empty: "No students assigned yet — cases appear here once an administrator or Team Leader assigns them to you. Ask your Team Leader, or open a case yourself if you hold the case.write permission."

Responsive: docked ≥ 1280 (300 px), avatar strip 1024-1279 with click-to-overlay, slide-over from the right on tablet (bar button "My students · 3"), bottom sheet on mobile from the tab bar. Rail state (docked/strip, collapsed groups) is remembered in `localStorage`.

Data: no new queries. The caseload is already in the snapshot for this role; signals come from `deriveCaseSignals()` memoised by `cases.rev`. Last-seen markers in `localStorage` (`lpl:pms:seen:{userId}:{caseId}` = `updatedAt`).

### F. Notification architecture

Two kinds, one center:

1. **Notifications** (persisted, per recipient, read/unread, server-side). Produced by **database triggers**, never by the browser, so they cannot be forged, work through Supabase and the Go façade alike, and stay correct when several users act at once.
2. **Reminders** (derived live from the three SLA clocks and returned gates on the caller's own caseload; not stored; disappear when resolved). Shown in the same center under a separate heading so the counsellor sees deadlines without a scheduler being installed.

Schema (additive, idempotent, appended to `supabase/schema.sql` and copied to `supabase/migrations/20260912_notifications_audit.sql` for already-provisioned projects):

```sql
create table if not exists public.notifications (
  id            text primary key default gen_random_uuid()::text,
  recipient_id  text not null,                 -- app_users.id
  at            timestamptz not null default now(),
  type          text not null,                 -- gate_submitted | gate_decided | document_uploaded | document_reviewed
                                               -- profile_submitted | step_completed | case_assigned | status_changed
                                               -- sla_due | sla_breached | account | system
  priority      text not null default 'normal' check (priority in ('low','normal','high')),
  title         text not null,
  body          text,
  case_id       text, case_ref text, step integer,
  link          text,                          -- hash route, e.g. #/case/{id}/step/16
  group_key     text,                          -- case_id for grouping in the center
  dedupe_key    text unique,                   -- one row per (recipient, event) even if a trigger re-fires
  read_at       timestamptz,
  pushed_at     timestamptz                    -- set by push-dispatch
);
create index if not exists notifications_unread_idx on public.notifications (recipient_id, at desc) where read_at is null;
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, at desc);
```

- RLS: `select` and `update` where `recipient_id = current_app_user_id()`; a `before update` guard permits changing `read_at` only; `insert`/`delete` denied to `authenticated` (rows are written by `security definer` trigger functions and pruned by a retention function).
- Fan-out trigger `notify_case_change()` after update on `cases` (and after insert for assignment): compares old/new gates, documents, steps, status, counsellor; recipients resolved in SQL (counsellor of the case; team leaders and administrators holding `gate.write` via a `roles_holding(perm)` helper over `org_config`/`permission_defaults`; the student's `student_user_id`). SQL writes only structured facts (`type`, `case_id`, `case_ref`, `step`, `link`) plus a generic `title` ("Step 16 approved"); the client renders the display title from `STEP_BY_N` (student wording for students) so copy never drifts between SQL and UI. Push payloads carry the generic title.
- SLA notifications: `emit_sla_notifications()` SQL function, scheduled with `pg_cron` on Supabase (`cron.schedule('lpl-sla','0 3 * * *', …)`) or a ticker in the Go service; dedupe by `dedupe_key = case_id || ':' || clock || ':' || due_date`. Until scheduled, the Reminders section covers the same ground live.
- RPCs (allow-listed in `functions.go`): `notification_state()` → `{unread int, latest timestamptz}` (one row, polled with the existing 8 s tick, no full reload); `notifications_page(p_before timestamptz, p_limit int, p_unread_only bool)`; `mark_notifications_read(p_ids text[])`; `mark_all_notifications_read()`; `prune_notifications(p_days int)` (administrator).
- Client: `useNotifications()` keeps a small paged list in memory, optimistic mark-as-read with rollback on failure, grouping by `group_key` and day, priority ordering within a group. Browser-storage modes get a local implementation over a `lpl:pms:notifications` blob so the feature is demonstrable offline.

Notification center UI: opens from the bell as a 420 px popover anchored top-right (sheet on mobile); `role="dialog"` non-modal with focus management; tabs All / Unread / Reminders; grouped by case with the case reference as the group header; each item: type glyph, title, body, relative time, priority accent, deep link; "Mark all as read" in the header; keyboard: Arrow keys move, Enter opens, `r` marks read, Escape closes; live region announces new unread count; empty state per tab.

**Browser push** (progressive, hosted builds only — a service worker cannot be embedded in a single HTML file or run from `file://`):
- `sw.js` built from `src/sw.ts` by a small `esbuild` call inside `scripts/finalize.mjs` (esbuild is already a Vite dependency; the single-file plugin is not involved), kept in `dist/`, copied by `pages.yml`; CSP gains `worker-src 'self'`. Registration is feature-detected (`https:` origin, `serviceWorker`, `PushManager`).
- Permission UX: never on load. A dismissible card in the notification center ("Get notified on this device") appears after the user has opened the center once; the browser prompt fires only on that click; denial is remembered and explained in Notification settings; permission state (`granted/denied/default/unsupported`) shown there.
- Subscriptions: `push_subscriptions(id, user_id, endpoint unique, p256dh, auth, user_agent, created_at, last_seen_at, revoked_at)`, RLS own-rows; multiple devices per user; revoke on sign-out from that device; stale endpoints removed on 404/410.
- Dispatch: Edge Function `push-dispatch` (VAPID keys as function secrets; service role never in the browser), invoked either by a Supabase Database Webhook on insert into `notifications` or by a one-minute `pg_cron` schedule that drains `pushed_at is null`; both are dashboard configuration, and the function checks a shared secret header. Retries with backoff on 5xx; dedupe by `pushed_at`; endpoints answering 404/410 are revoked. The Go service gets the same job as a goroutine later (out of this scope).
- Offline: the SW caches nothing of the app (the app is one file); it only receives pushes and focuses/opens the deep link on click.
- Caveat stated plainly: the server path of this repository has **never run against a live Supabase project**. Trigger fan-out, RLS and dispatch will be written and unit-checked in SQL, but end-to-end verification needs a project (see section 4).

### G. Motion system

Tokens in `tokens.css`: `--d-1: 120ms`, `--d-2: 200ms`, `--d-3: 320ms`, `--d-4: 480ms`; `--ease-out: cubic-bezier(.22,.61,.36,1)`, `--ease-inout`, `--spring: cubic-bezier(.34,1.28,.5,1)` (kept, used only for ≤ 12 px movements). Nothing decorative exceeds 480 ms; chart value transitions ≤ 900 ms.

| Interaction | Motion |
|---|---|
| Dock active change | Highlight pill slides (FLIP transform), 320 ms spring; icon tint crossfade 120 ms |
| Page → page | Content crossfade + 6 px rise, 200 ms; no stagger on repeat visits (stagger only on first mount per page id) |
| Row → case workspace | View Transitions API where supported: rail row/case row header morphs into the workspace header (`view-transition-name: case-{id}`); fallback: crossfade |
| Popover / notification center / profile menu | Scale 0.96 → 1 and fade from the trigger's corner (transform-origin computed), 200 ms ease-out; close 120 ms |
| Rail preview expand | Height auto via `grid-template-rows: 0fr → 1fr`, 240 ms; content fades in 120 ms after |
| Rail reorder (severity change) | FLIP on rows, 320 ms, only when ≤ 30 rows change |
| Sheets (mobile) | Translate from bottom 320 ms; scrim fade 200 ms; drag-to-dismiss with velocity |
| Buttons | Existing: 1 px lift on hover, 0.98 scale on press |
| Lists (notifications, attention) | Enter: 16 ms stagger, max 8 items animated |
| Charts | Existing mount draw; hover crosshair/tooltip 120 ms; series switch crossfade 240 ms |
| Skeleton → content | Crossfade 200 ms; shimmer 1.6 s loop (off under reduced motion) |
| Toasts | Kept (`rise`) |

`prefers-reduced-motion`: the existing global rule stays; View Transitions are not started; FLIP and shimmer are skipped; state changes remain instant and complete.

### H. Liquid-glass visual language

Keep the Lyceum identity: royal `#1240b3` / navy `#0b1f4b` / white / true black, Poppins for UI, Lora for reading text, AAA-verified tokens in both themes. What changes is **where depth lives**:

| Tier | Surfaces | Treatment |
|---|---|---|
| Ground | page background | The existing drifting glow (`body::before`), calmer: two radials, 12 px blur, drift 120 s |
| Surface | panels, cards, tables, forms, rail body | **Solid** `--surface` (white / `#050810`), hairline border, 1-level shadow; **no backdrop blur** |
| Float | bar, dock, popovers, notification center, sheets, profile menu, tooltips, selected dock item, toasts | Glass: `backdrop-filter: blur(18px) saturate(150%)`, `--glass` fill, inner highlight `--inset-hi`, edge light on top border, 2-level shadow |
| Emphasis | primary buttons, active states, attention accents | Solid accent; a soft glow only on the primary action |

Rules: text never sits on blurred glass without the `--glass-strong` fill (≥ 0.9 alpha, contrast-verified); no gradients on text; one accent hue; status hues carry state only; shadows are cool navy in light, hairline+glow in dark (kept). Dark mode stays pure black with hairlines; glass in dark is `rgba(0,0,0,.7)` over the glow so the dock reads as a lit surface.

New tokens (all added to `contrast.mjs` PAIRS): `--surface`, `--surface-2`, `--float`, `--float-strong`, `--edge-light`, `--e-1/2/3` shadows, `--unread` (accent), `--severity-bad/warn/info` (aliases of existing), `--z-ground 0, --z-page 1, --z-rail 20, --z-bar 30, --z-dock 31, --z-popover 50, --z-sheet 60, --z-modal 70, --z-toast 80`, spacing `--s-1: 4px … --s-8: 40px`.

### I. Component hierarchy

```
AppShell
├─ TopBar ── Wordmark · ContextChip · Dock · CommandPalette(trigger) · NotificationBell · ProfileMenu
├─ StudentRail (assigned scope) ── RailSearch · RailGroup* ── RailRow* ── StudentPreview
├─ Page (routed) ── PageHeader · page content
├─ MobileTabBar (< 1024)
├─ NotificationCenter (Popover | Sheet)
├─ CommandPalette (Dialog)
└─ ToastViewport (existing)

primitives (src/lib/ui/*): Surface{tier} · Popover · Sheet · Tooltip · Skeleton · EmptyState · StatCapsule/StatStrip ·
  ProgressRing(56/116/176) · MiniStageTrack · SeverityChip · SegmentedSwitch · FilterBar · ResponsiveTable ·
  Modal (existing, uses useFocusTrap) · Tabs (existing) · Pill/Notice/Avatar/Field* (existing)
hooks: useFocusTrap · useFlip · useViewTransition · useMediaQuery · useLocalPref · useStore(selector) · useCaseSignals
lib: signals.ts (deriveCaseSignals) · audit.ts (typed events, change summary) · notifications.ts (client model) · push.ts
```

### J. Responsive behaviour

| Width | Bar / dock | Rail | Case workspace | Tables |
|---|---|---|---|---|
| ≥ 1440 | Full dock with labels | Docked 320 px | Spine 324 + panel | Full |
| 1280-1439 | Full dock | Docked 288 px | Spine + panel | Full |
| 1024-1279 | Icon-only dock, active label shown | Avatar strip 64 px, overlay on click | Spine + panel | Full, horizontal scroll inside the surface |
| 768-1023 | Dock leaves the bar → bottom tab bar (4 + More); bar keeps wordmark, search, bell, avatar | Slide-over from the right via "My students" button in the bar | Spine collapses behind the existing stage button | Card rows for Cases and Audit; other tables scroll |
| < 768 | Bottom tab bar with safe-area inset; bar 56 px | Bottom sheet from the tab bar ("Students" tab for counsellors) | Single column; step panel full width; sticky action row | Card rows everywhere; filters in a sheet |

Mobile is designed, not shrunk: thumb-reach primary actions in the tab bar, sheets instead of popovers, 44 px targets (already), no hover-only affordances (every hover preview has a tap/keyboard path).

### K. Accessibility strategy

Keep the AAA gate and axe-clean status. Additions: dock roving tabindex and shortcuts; `complementary` landmark for the rail with `aria-label="My students"`; expandable rows `button[aria-expanded][aria-controls]` + `region`; popovers and sheets use `useFocusTrap` (extracted from `Modal`), Escape, return-focus; notification center `aria-live="polite"` for count changes and `role="list"` semantics; command palette `combobox`/`listbox` with `aria-activedescendant`; skeletons `role="status" aria-busy`; chart tooltips mirrored to a visually hidden live region and dots focusable; new tokens in the contrast script; forced-colours rules for dock, rail, popovers, tab bar; view transitions disabled under reduced motion; every icon-only control has a name and a tooltip. A screen-reader pass (NVDA) is scheduled in Stage 11 on the counsellor flow, the rail and the notification center.

### L. Performance strategy

1. Audit leaves `Backend.load()`; the poll payload shrinks accordingly.
2. `notification_state()` is one small RPC per tick; no Realtime.
3. `deriveCaseSignals()` memoised per `cases.rev`; consumers read a `Map<caseId, Signals>`.
4. `useStore(selector)` with `useSyncExternalStore`; shell parts subscribe to slices; rail rows and notification items are `memo`.
5. Blur only on float surfaces (≤ 3 on screen at once).
6. View transitions and FLIP limited to small element counts; `will-change` applied only during the animation.
7. No new runtime dependency; bundle growth budget +60 KB minified (fonts dominate the 635 KB).
8. Audit and notifications paginate server-side (keyset by `at`, 50 per page); details lazy-load on expand.
9. Pages that render large tables virtualise only if a list exceeds 200 rows (cases page at pilot scale does not); Audit explorer virtualises its list window.

### M. Audit-log architecture

Additive schema on the existing `audit` table (old rows stay valid; `event_type is null` renders as "legacy"):

```sql
alter table public.audit
  add column if not exists event_type   text,      -- create|update|delete|login|logout|permission|auth|notification|file|case|gate|document|system
  add column if not exists entity_type  text,      -- case|step|gate|document|user|account|role|settings|dataprotection|prompt|session
  add column if not exists entity_id    text,
  add column if not exists entity_label text,
  add column if not exists outcome      text not null default 'success',   -- success|failure
  add column if not exists source       text,      -- web|edge|api
  add column if not exists session_id   text,
  add column if not exists summary      text,      -- "Updated student profile"
  add column if not exists changes      jsonb,     -- [{field, label, old, new}] (sensitive fields redacted), updates only, ≤ 40 entries
  add column if not exists meta         jsonb;
create index if not exists audit_actor_idx  on public.audit (actor_id, at desc);
create index if not exists audit_entity_idx on public.audit (entity_type, entity_id, at desc);
create index if not exists audit_type_idx   on public.audit (event_type, at desc);
```

Attribution trigger unchanged (actor id/name/role/time set by the database). Two RPCs, `security invoker` so RLS applies: `audit_page(p_before timestamptz, p_actor text, p_event_type text, p_entity_type text, p_entity_id text, p_from timestamptz, p_to timestamptz, p_q text, p_limit int)` returning the narrow columns (no `changes`/`meta`), keyset-paginated on `(at, id)`, default window the last 30 days so free-text `ilike` never scans the whole table; `audit_detail(p_id text)` returning `changes` and `meta` for one row. Both listed in the Go façade contract.

Client: `src/lib/audit.ts` exports a typed `audit(event)` with a closed vocabulary (`case.opened`, `case.assigned`, `case.status.changed`, `step.completed`, `step.reopened`, `step.na`, `gate.submitted`, `gate.decided`, `gate.resubmitted`, `document.uploaded`, `document.reviewed`, `document.removed`, `profile.submitted`, `user.created`, `user.updated`, `account.signin.issued`, `account.signin.failed`, `account.deactivated`, `role.matrix.changed`, `settings.changed`, `dataprotection.*`, `prompt.*`, `session.signin`, `session.signout`, `notification.read`, `export.*`). The existing `action` text is kept as the human label so exports and history stay continuous; `summary` and `changes` are generated by a diff helper with a field whitelist and sensitive-field redaction from `spine.ts`.

Audit explorer UI: filter bar (date range, actor, event type, entity type, free text), keyset "Load more" (50), rows show time · actor · summary · entity chip · outcome; expanding a row lazy-loads `audit_detail` and shows a field-by-field old/new table; export honours the current filter and pages through the RPC. Sign-in and sign-out are recorded from the client at the moment they happen (`session.signin` after the profile resolves; `session.signout`), plus `account.signin.failed` from the Auth screen (without the password, obviously). Browser-storage modes keep the 600-entry blob and paginate it locally through the same `Backend.auditPage()` interface.

### N. Loading and skeleton strategy

- First paint: the shell chrome renders as soon as the theme is applied, with a **shell skeleton** (dock placeholder, bar, page skeleton matched to the route: dashboard, list, workspace). When `snap.loaded` flips, content crossfades in. No spinner.
- Route change: pages render synchronously from the snapshot (no fetch), so no skeleton; only the entry motion.
- Notification center, audit explorer, rail preview: local skeletons for the first page; inline progress on "Load more".
- Writes: buttons show busy labels (existing) and the affected row gets `aria-busy`; optimistic mark-as-read and rail last-seen updates.
- Stale/sync state: the profile menu shows the `LiveBadge` states; a thin top progress line (2 px, accent) appears while a poll reload is in flight longer than 600 ms.

### O. Empty and error states

`EmptyState` primitive: glyph (small inline SVG per area), title (what is empty), reason (why it may be), action (what next). Copy, per area:

| Area | Title | Why | Next |
|---|---|---|---|
| Rail | No students assigned yet | Cases appear here once an administrator or Team Leader assigns them to you | Ask your Team Leader · Open a case (if `case.write`) |
| Notifications | You're all caught up | Gate decisions, document reviews, assignments and reminders arrive here | Notification settings |
| Reminders | No deadlines in the next 21 days | Reminders come from the three service-level clocks on your open cases | — |
| Attention (dashboard) | Nothing needs attention | Service clocks, returned gates and unreviewed documents appear here | View caseload |
| Approvals | No gates waiting | Counsellors submit financial verification (16) and visa file (19) gates here | — |
| Escalations | No breaches | Cases within their service levels do not appear here | — |
| Audit | No events match | Change the date range or filters | Clear filters |
| Cases (existing copy kept) | No cases yet / No cases assigned to you / No cases match | as today | Create student / clear filters |
| Reports/performance | Not enough history yet | Charts fill as cases move through the nine stages | — |

Errors: `ErrorBoundary` kept at the root and added per page region so a failing panel does not blank the shell; write failures stay as toasts plus an inline `Notice` where the action happened; a `notification_state` failure degrades the bell silently (no count) and retries on the next tick; "Not permitted" and "not available" panels kept, re-skinned.

### P. Design tokens, Q. Typography, R. Iconography, S. Interaction patterns

- **Tokens**: `src/styles/tokens.css` holds everything from §H plus spacing `--s-1..8`, radius `--r-sm 10 / md 14 / lg 20 / xl 26 / pill 999`, elevation `--e-1..3`, motion, z-index, type scale. `app.css` split into `base.css`, `shell.css`, `components.css`, `pages.css` (single CSS bundle unchanged).
- **Typography**: Poppins UI at 12.5 / 13.5 / 14.5 / 16 / 19 / 26 / 32 (new display size for the hero numbers), Lora for body copy and descriptions, tabular numerals on every metric, tighter tracking on display (‑0.02em). Headings never wrap in chrome; they scale with `clamp()`.
- **Iconography**: `lucide-react` kept (already bundled); 18 px in chrome, 16 px in buttons, 14 px in chips; one glyph per notification type and per audit entity; the dock uses a fixed set so the highlight pill measures consistently.
- **Interaction patterns**: click = navigate, chevron/hover = preview, long lists = search first, popovers anchor to their trigger, sheets on touch, Escape always closes the topmost layer, `⌘K` opens search from anywhere, `Alt+1…9` switches dock items, `?` shows shortcuts, optimistic read state, destructive actions keep their dialogs.

---

## 3. Phase 3 — the gate: what changes, what stays, how it migrates

### 3.1 What is changing

- Both shells replaced by one `AppShell` with a floating top-centre dock, utility bar, notification bell for every role, command palette, profile menu.
- Counsellor persistent rail with previews and quick actions.
- Notification subsystem (tables, triggers, RPCs, center, reminders, push architecture).
- Dashboards recomposed per role; interactive charts; stat strip with deltas.
- Audit: structured columns, typed client vocabulary, paginated explorer with lazy detail; audit removed from the workspace snapshot.
- Design tokens extracted; glass tiered; motion system; skeletons; empty states; responsive strategy with bottom tab bar and sheets.
- Store: selector subscriptions; signals memoised; notification/audit adapters for every backend kind.
- Build: `sw.js` second output, CSP `worker-src`, Pages workflow copies it; version 5.0.0.
- Go façade contract: new tables/columns/RPCs allow-listed (`tables.go`, `functions.go`, contract test). No handler logic changes.

### 3.2 What is staying

Every business rule and mutation helper (`logic.ts`), the 31-step/9-stage spine, the permission matrix and `can()` checks on every control, RLS policies and guards (extended, not altered), closed registration and `admin-users`, the hash routes and deep links, Supabase adapter semantics (upsert/patch/delete shapes), the browser-storage fallbacks, the theme (palette, fonts, true-black dark), AAA contrast gate, the accordion/step/document/gate flows, dialogs, Prompt Engineer Workspace, Data protection pages, exports, forced-colours support, copyright layers.

### 3.3 Migration strategy

- Branch `redesign/v5` in `lpl-pms/` (git root). No commits or pushes until you say so; the Go work stays uncommitted and untouched.
- Stages 1-13 as in the brief, each ending with `npm run typecheck`, `npm run contrast`, `npm run build`, a route walk in the browser for each role in browser-storage mode (the only mode runnable on this machine), and a review of RLS/contract diffs. Tooling added in Stage 1: `vitest` for pure logic (signals, notification grouping, audit summariser, nav model) and `eslint` (typescript-eslint + react-hooks), both dev-only (decision D8).
- Old shells are deleted in Stage 2 only when every route renders in the new shell for every role.
- Schema changes land in `schema.sql` (idempotent) and as a dated migration file; the Go contract is updated in the same change; SQL is checked with the Go integration suite when a Postgres is available, otherwise by review.
- Push dispatch (Edge Function) is written and documented but marked unverified until a live project exists.

### 3.4 Decisions needed before code (defaults in bold)

| ID | Decision | Options |
|---|---|---|
| D1 | Product identity | **Redesign the PMS as it is; no Parent role, no LMS entities** · or scope a Parent role as a separate security project |
| D2 | Team Leader | **Own dashboard priorities (approvals first)** · or share the Administrator layout |
| D3 | Rail | **Right side, docked/strip/slide-over/sheet, assigned-scope roles only** · left side · also for Team Leaders in attention-only mode |
| D4 | Notifications backend | **DB triggers + `notifications` table + polling + Reminders; push via SW + `push_subscriptions` + `push-dispatch` Edge Function** · in-app only now, push later |
| D5 | Audit | **Additive columns + `audit_page`/`audit_detail` RPCs; audit leaves the snapshot; façade contract extended** · keep the 600-row window and only restyle |
| D6 | IA grouping | **People (Staff + Roles), Governance (Data protection + Audit), More (Settings, Prompt Engineer)** · keep all destinations flat with a 2-row dock |
| D7 | Visual identity | **Keep palette, fonts, AAA gate; change surfaces, depth, composition** · new palette (would re-run the contrast work) |
| D8 | Tooling | **Add vitest + eslint (dev-only)** · typecheck + contrast only |
| D9 | Versioning | **v5.0.0 on branch `redesign/v5`, no commits until asked** |

### 3.5 Consistency check

- Dock, rail, bell and palette read from the snapshot through selectors; none of them fetch. New fetches are: `notification_state` (per tick), `notifications_page`, `audit_page`, `audit_detail`, mark-read RPCs, push subscription upserts. All are RLS-scoped and allow-listed.
- No RLS policy is loosened; all additions are new tables (own-rows) or new columns on `audit` (insert already open to signed-in users, attribution still by trigger, select still `audit.read`).
- The Go façade continues to refuse anything outside its contract; the contract diff is enumerable (2 tables, 10 columns, 7 RPCs).
- The single-file deliverable keeps working (push and SW simply do not activate off `file://`).
- Browser-storage modes implement every new backend method locally, so the redesign is fully demonstrable without a server.

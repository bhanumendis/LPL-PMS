# LPL PMS v5 UI/UX Reimagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar-based shells with one premium application shell (floating top-centre dock, utility bar, notification center, counsellor rail), recompose every dashboard per role, add a trigger-driven notification subsystem with web-push architecture, and restructure the audit log for precision and pagination, without changing any business rule, RLS policy or API contract semantics.

**Architecture:** The React tree gets a single `AppShell` that owns chrome (bar, dock, rail, layers) while routed pages stay pure functions of the store snapshot. Cross-cutting facts (attention signals, notifications, audit) become typed modules with one implementation per backend kind (Supabase RPCs / browser-storage blobs). The database gains additive tables, columns, triggers and RPCs; the Go façade's allow-list is extended to match. Visual depth moves from "everything is glass" to three tiers (ground / surface / float) driven by tokens.

**Tech Stack:** React 18.3, TypeScript 5.6 strict, Vite 5 + vite-plugin-singlefile, lucide-react, hand-rolled fetch Supabase client, PostgreSQL/Supabase (RLS, plpgsql), Deno Edge Functions, Go façade (`server/`), vitest + jsdom + @testing-library/react (new), eslint flat config + typescript-eslint + react-hooks (new).

**Spec:** `docs/superpowers/specs/2026-09-12-ui-reimagination-design.md`

## Global Constraints

- No new runtime dependency; build stays a single HTML file; bundle growth ≤ 60 KB minified over 635 KB.
- Every text token pair ≥ 7:1 and graphic pair ≥ 3:1 in both themes; every new token goes into `scripts/contrast.mjs` PAIRS.
- Palette, fonts (Poppins UI / Lora body), true-black dark mode, 44 px targets, forced-colours support are kept.
- No RLS policy loosened; new tables are own-rows; `audit` insert stays open to signed-in users and attributed by trigger.
- Every table/column/RPC/operator the frontend sends must exist in `server/internal/contract/{tables,functions}.go`; the façade grammar stays `eq/neq/is`, `order`, `limit`, `offset`, `select=*`.
- Hash routes and deep links unchanged: `#/`, `#/{page}`, `#/{page}/{id}`, `#/case/{id}`, `#/case/{id}/step/{n}`, `#/case/{id}/{tab}`, `#/{page}/step/{n}`.
- All existing `can()` checks and `caseScopeOf()` scoping stay on every control; `isAdmin` still gates Prompt Engineer.
- Reduced motion: no animation may change layout or block interaction; View Transitions and FLIP are skipped under `prefers-reduced-motion`.
- Version becomes 5.0.0. Branch `redesign/v5`. No commits or pushes unless the user asks (the user has asked for none so far; tasks say "checkpoint" where a commit would normally go — run the verify gate instead and do not commit).
- Copyright header comment on every new source file, same text as existing files.
- Domain vocabulary: case, student, counsellor, Team Leader, Administrator, stage (9), step (31), gate (16, 19), Course Information Sheet, offer lapse, follow-up.
- Tests: pure logic in vitest; component behaviour with @testing-library/react in jsdom. No E2E framework.
- Verify gate after every task: `npm run verify` = typecheck + lint + test + contrast; `npm run build` after every stage.

---

## File structure (locked)

```
src/
  main.tsx                         entry (imports tokens.css, base.css, components.css, shell.css, pages.css)
  App.tsx                          session context, routing, theme; renders <AppShell/> or <AuthScreen/>
  lib/
    store.ts                       + audit/notification/push backend methods, useStore selectors
    server.ts                      + RPC wrappers for the new functions, new row mappers
    types.ts                       + AuditEntry extension, NotificationRow, PushSubscriptionRow
    signals.ts                     NEW deriveCaseSignals / useCaseSignals
    audit.ts                       NEW typed audit events, diffChanges, builders
    hooks.ts                       NEW useMediaQuery, useLocalPref, useReducedMotion, useSessionId
    ui/index.ts                    NEW re-exports (keeps `@/lib/ui` imports working)
    ui/core.tsx                    Pill, Notice, Panel, Kpi, CountUp, Avatar, Tabs, Switch, fields (moved from ui.tsx)
    ui/modal.tsx                   Modal (uses useFocusTrap)
    ui/toast.tsx                   ToastProvider/useToast
    ui/focus.ts                    useFocusTrap
    ui/layer.tsx                   Layer (popover | sheet), Tooltip
    ui/skeleton.tsx                Skeleton, PageSkeleton
    ui/empty.tsx                   EmptyState
    ui/stats.tsx                   StatStrip, StatCapsule
    ui/progress.tsx                MiniStageTrack, SeverityChip
    ui/segmented.tsx               SegmentedSwitch
    ui/table.tsx                   ResponsiveTable helpers (CardList)
    charts.tsx                     + AreaChart tooltip/keyboard, Donut hover, Ring onClick
  shell/
    nav.ts                         destination model
    AppShell.tsx                   frame
    TopBar.tsx                     brand, context chip, dock slot, utilities
    Dock.tsx                       floating dock
    MobileTabBar.tsx               < 1024 px navigation
    ProfileMenu.tsx                avatar popover
    CommandPalette.tsx             ⌘K search
    pages.tsx                      route → page element with permission checks (from StaffShell/StudentShell)
    rail/StudentRail.tsx           counsellor rail container (docked/strip/slide-over/sheet)
    rail/RailRow.tsx               one student row
    rail/StudentPreview.tsx        inline/popover preview
    rail/seen.ts                   last-seen markers
  notifications/
    types.ts                       NotificationRow, NotificationType, Reminder
    fanout.ts                      reference fan-out rules (TS), used by browser-storage mode and tests
    reminders.ts                   derive Reminder[] from signals
    useNotifications.ts            hook
    NotificationBell.tsx
    NotificationCenter.tsx
    NotificationItem.tsx
    push.ts                        subscription management
    settings.tsx                   NotificationSettings card (permission UX)
  sw.ts                            service worker source (built to dist/sw.js by finalize.mjs)
  views/
    home/Overview.tsx              role router
    home/CounsellorHome.tsx, TeamLeaderHome.tsx, AdminHome.tsx, StudentHome.tsx
    home/sections/*.tsx            AttentionQueue, StageFlow, MovementFeed, PerformanceSection, CounsellorLoad, ComplianceStrip, SystemHealth, StudentHero, StudentTasks
    student/ProfilePage.tsx, DocumentsPage.tsx, JourneyPage.tsx   (moved out of StudentShell.tsx)
    staff/AuditExplorer.tsx        replaces Audit.tsx
    staff/*.tsx                    existing pages, re-composed onto surfaces
    CaseWorkspace.tsx, StepPanel.tsx, Documents.tsx, Auth.tsx   kept, header recomposed
  styles/
    tokens.css, base.css, shell.css, components.css, pages.css  (app.css split)
  test/setup.ts                    testing-library matchers, matchMedia polyfill
supabase/
  schema.sql                       + audit columns/indexes/RPCs, notifications, push_subscriptions, triggers, grants
  migrations/20260912_notifications_audit.sql   same additions for provisioned projects
  functions/push-dispatch/index.ts NEW Edge Function
server/internal/contract/tables.go, functions.go, contract_test.go   allow-list additions
scripts/finalize.mjs               + sw.js build, worker-src
scripts/contrast.mjs               reads tokens.css; new pairs
.github/workflows/pages.yml        copies sw.js
eslint.config.js, vitest.config.ts NEW
```

---

## Stage 1 — Tooling, tokens, foundations

### Task 1: Test and lint tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `eslint.config.js`, `src/test/setup.ts`, `src/lib/logic.test.ts`

**Interfaces:**
- Produces: `npm run test`, `npm run lint`, `npm run verify`; vitest with jsdom and `@` alias; ESLint flat config.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest@^5 jsdom@^30 @testing-library/react@^16 @testing-library/jest-dom@^6 eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^7 globals@^16
```
If `typescript-eslint@8` refuses `eslint@9` peers, use the eslint major it lists. Node is 24; npm 11.

- [ ] **Step 2: Add scripts**

In `package.json` `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest",
"lint": "eslint src scripts --max-warnings 0",
"verify": "npm run typecheck && npm run lint && npm run test && npm run contrast",
"build": "npm run verify && vite build && node scripts/finalize.mjs"
```
Set `"version": "5.0.0"`.

- [ ] **Step 3: vitest config**

`vitest.config.ts`:
```ts
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";
export default mergeConfig(viteConfig, defineConfig({
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}"], css: false },
}));
```
`src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
if (!window.matchMedia) {
  window.matchMedia = (q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
class RO { observe() {} unobserve() {} disconnect() {} }
(window as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
```
Add `"vitest/globals"` is NOT used; tests import from `vitest`. Add `"types": ["vite/client", "@testing-library/jest-dom"]` to tsconfig only if the matcher types fail to resolve.

- [ ] **Step 4: ESLint flat config**

`eslint.config.js`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "server/**", "docs/**", "supabase/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, __APP_VERSION__: "readonly" } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  { files: ["scripts/**/*.mjs", "*.config.{js,ts}"], languageOptions: { globals: { ...globals.node } } },
);
```
If `reactHooks.configs.recommended` is not the flat export in the installed version, use `reactHooks.configs["recommended-latest"]` or `reactHooks.configs.flat.recommended` (check `node_modules/eslint-plugin-react-hooks/package.json` exports).

- [ ] **Step 5: First test (pure logic, proves the harness)**

`src/lib/logic.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { caseProgress, currentStep, stepState } from "./logic";
import type { CaseRecord } from "./types";
export function blankCase(over: Partial<CaseRecord> = {}): CaseRecord {
  const now = "2026-09-01T00:00:00.000Z";
  return { id: "c1", ref: "LPL-2026-0001", student: { name: "Nimal Perera", email: "n@example.com", phone: "0770000000" }, status: "open", steps: { 1: { status: "done", completedAt: now, completedBy: "u1", values: { source: "Website" } } }, documents: [], gates: [], events: [], createdAt: now, updatedAt: now, rev: 1, ...over };
}
describe("logic baseline", () => {
  it("step 2 is the current step of a fresh case", () => { expect(currentStep(blankCase())).toBe(2); });
  it("progress counts done over applicable", () => { const p = caseProgress(blankCase()); expect(p.done).toBe(1); expect(p.pct).toBeGreaterThan(0); });
  it("stepState is safe for missing steps", () => { expect(stepState(blankCase(), 30).status).toBe("pending"); });
});
```

- [ ] **Step 6: Run and fix lint baseline**

Run `npm run test` → 3 pass. Run `npm run lint`; fix every reported error in existing code minimally (unused vars → prefix `_`, `any` → `unknown`, hooks deps → wrap or add deps only where behaviour is unchanged; where a dependency change would alter behaviour, keep the existing `eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line reason). Run `npm run verify` → all green.

- [ ] **Step 7: Checkpoint** — `npm run verify` green; `git status` shows only intended files. No commit (user has not asked).

### Task 2: Design tokens and surface tiers

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/components.css`, `src/styles/shell.css`, `src/styles/pages.css`
- Modify: `src/styles/app.css` (deleted at the end of this task), `src/main.tsx`, `scripts/contrast.mjs`

**Interfaces:**
- Produces CSS custom properties: spacing `--s-1..--s-8` (4, 8, 12, 16, 20, 24, 32, 40 px); radius `--r-sm 10 / --r-md 14 / --r-lg 20 / --r-xl 26 / --r-pill 999px`; motion `--d-1 120ms / --d-2 200ms / --d-3 320ms / --d-4 480ms / --d-chart 900ms`, `--ease-out`, `--ease-inout`, `--spring`; z `--z-page 1 / --z-rail 20 / --z-bar 30 / --z-dock 31 / --z-popover 50 / --z-sheet 60 / --z-modal 70 / --z-toast 80`; surfaces `--surface`, `--surface-2`, `--surface-border`, `--float`, `--float-strong`, `--float-border`, `--edge-light`, `--e-1`, `--e-2`, `--e-3`; type `--t-display 32px`; colours `--unread` (= `--accent`), `--sev-bad` (= `--exit`), `--sev-warn` (= `--warn`), `--sev-info` (= `--accent`).
- Produces classes: `.surface` (solid panel), `.surface-2` (inset soft), `.float` (glass), `.float-strong`; legacy `.panel`, `.card`, `.soft` remain and now map to `.surface`; `.glass` maps to `.float`; `.modal`, `.toast` keep glass.

- [ ] **Step 1: Split app.css** — Move lines 17-158 (`:root` and dark block) into `tokens.css` verbatim; add the new tokens at the end of each block:

```css
/* light additions, inside :root */
--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-7: 32px; --s-8: 40px;
--r-pill: 999px;
--d-1: 120ms; --d-2: 200ms; --d-3: 320ms; --d-4: 480ms; --d-chart: 900ms;
--ease-out: cubic-bezier(0.22, 0.61, 0.36, 1); --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
--z-page: 1; --z-rail: 20; --z-bar: 30; --z-dock: 31; --z-popover: 50; --z-sheet: 60; --z-modal: 70; --z-toast: 80;
--t-display: 32px;
--surface: #ffffff; --surface-2: #f2f5fa; --surface-border: #e3e8f0;
--float: rgba(255, 255, 255, 0.78); --float-strong: rgba(255, 255, 255, 0.94); --float-border: rgba(255, 255, 255, 0.9); --edge-light: rgba(255, 255, 255, 0.95);
--e-1: 0 1px 2px rgba(11, 31, 75, 0.05), 0 4px 14px rgba(11, 31, 75, 0.06);
--e-2: 0 2px 6px rgba(11, 31, 75, 0.08), 0 14px 36px rgba(11, 31, 75, 0.12);
--e-3: 0 4px 10px rgba(11, 31, 75, 0.10), 0 28px 64px rgba(11, 31, 75, 0.18);
--unread: #1240b3; --sev-bad: #8f1414; --sev-warn: #d97706; --sev-info: #1240b3;
--rail-w: 300px; --bar-h: 64px; --tabbar-h: 64px;
```
```css
/* dark additions, inside html[data-theme="dark"] */
--surface: #000000; --surface-2: #05080f; --surface-border: rgba(255, 255, 255, 0.12);
--float: rgba(0, 0, 0, 0.72); --float-strong: rgba(0, 0, 0, 0.94); --float-border: rgba(255, 255, 255, 0.14); --edge-light: rgba(255, 255, 255, 0.10);
--e-1: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 4px 14px rgba(0, 0, 0, 0.5);
--e-2: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 14px 36px rgba(0, 0, 0, 0.65);
--e-3: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 28px 64px rgba(0, 0, 0, 0.8);
--unread: #5b9cff; --sev-bad: #ff8a80; --sev-warn: #f59e0b; --sev-info: #5b9cff;
```
`base.css` = reset, typography, utilities, forms, buttons, pills, notices, avatar, tables, tabs, kpi, progress, charts, modal/toast, empty/loading, sign-in, motion keyframes, reduced motion, print, forced colours (everything from old app.css that is not shell or page specific). `shell.css` = the old `.shell/.sidebar/.topbar/.nav*` rules (to be replaced in Task 8; keep for now so the old shells still render). `pages.css` = workspace/spine/timeline/journey/task/documents/prompt-engineer/RBAC/filters. `components.css` = new primitives (empty for now except the surface tiers below).

- [ ] **Step 2: Surface tiers in components.css**

```css
.surface { background: var(--surface); border: 1px solid var(--surface-border); border-radius: var(--r-lg); box-shadow: var(--e-1); position: relative; }
.surface-2 { background: var(--surface-2); border: 1px solid var(--surface-border); border-radius: var(--r-md); }
.float { background: var(--float); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%); border: 1px solid var(--float-border); box-shadow: var(--e-2), inset 0 1px 0 var(--edge-light); }
.float-strong { background: var(--float-strong); }
@media (forced-colors: active) { .surface, .surface-2, .float { background: Canvas; border: 1px solid CanvasText; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; } }
```
Change the legacy rule in base.css so that **only** `.modal, .toast, .glass` keep `backdrop-filter`; `.panel` and `.card` become `background: var(--surface); border: 1px solid var(--surface-border); box-shadow: var(--e-1)` (no blur). `.soft` → `var(--surface-2)`.

- [ ] **Step 3: main.tsx imports** — replace `import "./styles/app.css"` with `tokens.css`, `base.css`, `components.css`, `shell.css`, `pages.css` in that order. Delete `app.css`.

- [ ] **Step 4: contrast.mjs** — read `../src/styles/tokens.css`; add pairs: `["--ink","--surface",7,"panel text"]`, `["--ink2","--surface",7]`, `["--muted","--surface",7]`, `["--ink","--surface-2",7]`, `["--muted","--surface-2",7]`, `["--ink","--float-strong",7,"dock, popovers"]`, `["--ink2","--float-strong",7]`, `["--muted","--float-strong",7]`, `["--accent-text","--float-strong",7]`, `["--on-accent","--unread",7,"unread badge"]`, `["--unread","--surface",3]`, `["--sev-bad","--surface",3]`, `["--sev-warn","--surface",3]`, `["--sev-info","--surface",3]`, `["--surface-border","--surface",1.2,"hairline (informational)"]` — drop that last one if the script has no sub-3 category; hairlines are not verified.

- [ ] **Step 5: Run `npm run contrast`** — all pass (if `--float` at 0.78 alpha fails a text pair, text never sits on `--float`; only `--float-strong` carries text, which is the pair listed).

- [ ] **Step 6: Run `npm run verify` and `npm run build`**; open `dist/index.html` in the browser preview and walk staff + student routes in browser-storage mode: panels are now solid, dialogs and toasts still glass, both themes.

- [ ] **Step 7: Checkpoint.**

### Task 3: Store selectors and shared hooks

**Files:**
- Modify: `src/lib/store.ts`
- Create: `src/lib/hooks.ts`, `src/lib/hooks.test.ts`, `src/lib/store.test.ts`

**Interfaces:**
- Produces in `store.ts`: `export function useSnapshot(): Snapshot` and `export function useStoreSelect<T>(selector: (s: Snapshot) => T, isEqual?: (a: T, b: T) => boolean): T` built on `useSyncExternalStore(store.subscribe, () => store.snap)`; `store.subscribe` already calls the listener immediately — keep that, `useSyncExternalStore` tolerates it.
- Produces in `hooks.ts`: `useMediaQuery(query: string): boolean`; `useReducedMotion(): boolean`; `useLocalPref<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void]` (localStorage-backed, try/catch, JSON); `useSessionId(): string` (from `sessionStorage` key `lpl:pms:sid`, created with `uid()`); `useIsTouch(): boolean` (`(pointer: coarse)`).
- Breakpoint constants: `export const BP = { mobile: "(max-width: 767px)", tablet: "(max-width: 1023px)", compact: "(max-width: 1279px)", wide: "(min-width: 1440px)" }`.

- [ ] **Step 1: Tests**

`src/lib/store.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { store, useStoreSelect } from "./store";
describe("useStoreSelect", () => {
  it("re-renders only when the selected slice changes", async () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useStoreSelect((s) => s.backend); });
    expect(result.current).toBe(store.kind);
    const before = renders;
    await act(async () => { await store.refresh(); });
    expect(renders).toBe(before); // backend kind unchanged → no re-render
  });
});
```
`src/lib/hooks.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalPref, useMediaQuery } from "./hooks";
describe("hooks", () => {
  it("useLocalPref round-trips through localStorage", () => {
    const { result } = renderHook(() => useLocalPref("lpl:test:pref", { open: true }));
    act(() => result.current[1]({ open: false }));
    expect(JSON.parse(localStorage.getItem("lpl:test:pref")!)).toEqual({ open: false });
  });
  it("useMediaQuery returns false in jsdom", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Implement** `useSnapshot`, `useStoreSelect` (with `useSyncExternalStore` and a `useRef` cache comparing with `isEqual ?? Object.is`), and `hooks.ts` as specified. `useMediaQuery` subscribes with `matchMedia(query).addEventListener("change", …)` guarded for old Safari (`addListener`).

- [ ] **Step 3: Run tests → pass. Step 4: `npm run verify`. Step 5: Checkpoint.**

### Task 4: Case signals

**Files:**
- Create: `src/lib/signals.ts`, `src/lib/signals.test.ts`

**Interfaces (produces):**
```ts
export type Severity = "bad" | "warn" | "info" | "none";
export const SEVERITY_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2, none: 3 };
export type AttentionKind = "sla" | "gate-returned" | "gate-pending" | "review" | "profile" | "hold-review" | "retention";
export interface AttentionItem { id: string; caseId: string; kind: AttentionKind; label: string; severity: Exclude<Severity, "none">; step?: number; days?: number }
export interface CaseSignals {
  id: string; ref: string; name: string; status: CaseStatus; counsellorId?: string; studentUserId?: string;
  progress: Progress; stages: PipelineProgress[]; currentStep: number | null; stage: PipelineStage;
  flags: SlaFlag[]; breached: number; dueSoon: number;
  gatePending?: 16 | 19; gateReturned?: 16 | 19; docsToReview: number; profileSubmitted: boolean;
  retention: RetentionState; holdReviewDue: boolean;
  attention: AttentionItem[]; severity: Severity; updatedAt: string; lastEventAt?: string; lastEventBy?: string;
}
export function deriveCaseSignals(c: CaseRecord, config: OrgConfig): CaseSignals;
export function deriveAll(cases: Record<string, CaseRecord>, config: OrgConfig): Map<string, CaseSignals>;
export function compareSeverity(a: CaseSignals, b: CaseSignals): number; // severity asc, then updatedAt desc
export function useCaseSignals(): Map<string, CaseSignals>; // useMemo keyed on snap.cases.rev, snap.org.config.rev
export function countBadges(signals: Iterable<CaseSignals>, opts: { mineId?: string }): { unassigned: number; toReview: number; pendingGates: number; breaches: number; returned: number; retentionOverdue: number };
```
Attention labels (exact): SLA → `${flag.label} · ${days<0 ? `${-days}d overdue` : days===0 ? "due today" : `${days}d left`}`; gate returned → `Gate ${g} returned with suggestions` (bad); gate pending → `Gate ${g} awaiting Team Leader` (info); review → `${n} document${n===1?"":"s"} awaiting your review` (info); profile → `Student submitted profile — confirm it` (info); hold-review → `Hold review date passed` (warn); retention → `Retention overdue — dispose or hold` (warn). Severity of the case = the highest severity among attention items. Attention only for `status === "open"` except retention (any) and hold-review (`hold`/`deferred`).

- [ ] **Step 1: Tests** (use `blankCase` from `logic.test.ts`; export it from a new `src/test/fixtures.ts` instead and import there):
```ts
it("flags a returned gate as bad and sorts first", () => {
  const c = blankCase({ gates: [{ id: "g1", gate: 16, round: 1, submittedAt: iso, submittedBy: "u1", status: "returned", decidedAt: iso, decidedBy: "tl", suggestions: "x" }] });
  const s = deriveCaseSignals(c, defaultConfig());
  expect(s.gateReturned).toBe(16); expect(s.severity).toBe("bad");
  expect(s.attention[0]).toMatchObject({ kind: "gate-returned", label: "Gate 16 returned with suggestions" });
});
it("counts documents awaiting review as info", …);
it("a closed case has no attention", …);
it("deriveAll returns one entry per case and compareSeverity orders bad before none", …);
```

- [ ] **Step 2: Implement** using `slaFlags`, `latestGate`, `pendingReviewCount`, `caseProgress`, `pipelineProgress`, `currentStep`, `currentPipeline`, `retentionState`, `stepState` from `logic.ts`. `useCaseSignals` uses `useStoreSelect` for `cases` and `config` then `useMemo`.

- [ ] **Step 3: Tests pass. Step 4: verify. Step 5: Checkpoint.**

### Task 5: UI primitives

**Files:**
- Create: `src/lib/ui/{index.ts,core.tsx,modal.tsx,toast.tsx,focus.ts,layer.tsx,skeleton.tsx,empty.tsx,stats.tsx,progress.tsx,segmented.tsx,table.tsx}`, tests `src/lib/ui/layer.test.tsx`, `src/lib/ui/progress.test.tsx`
- Modify: `src/lib/ui.tsx` → delete after moving; `src/styles/components.css`

**Interfaces (produces):**
```ts
// focus.ts
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, opts?: { initial?: "first" | "container"; returnFocus?: boolean; onEscape?: () => void }): void;
// layer.tsx
export interface LayerProps { open: boolean; onClose: () => void; anchorRef?: RefObject<HTMLElement>; label: string; variant?: "auto" | "popover" | "sheet"; placement?: "bottom-end" | "bottom-start" | "bottom"; width?: number; modal?: boolean; children: ReactNode; className?: string; id?: string }
export function Layer(props: LayerProps): JSX.Element | null;   // portal; popover positioned from anchor rect with transform-origin at the anchor corner; sheet under BP.mobile; Escape + outside click close; role="dialog" aria-modal only when modal
export function Tooltip({ label, children, shortcut }: { label: string; children: ReactElement; shortcut?: string }): JSX.Element; // wraps child, adds aria-describedby, shows after 400 ms on hover/focus
// skeleton.tsx
export function Skeleton({ kind, width, height, lines }: { kind: "text" | "block" | "avatar" | "ring" | "row"; width?: number | string; height?: number; lines?: number }): JSX.Element; // aria-hidden
export function PageSkeleton({ variant }: { variant: "dashboard" | "list" | "workspace" | "settings" }): JSX.Element; // role="status" aria-busy aria-label="Loading"
// empty.tsx
export function EmptyState({ glyph, title, reason, action, compact }: { glyph?: "students" | "inbox" | "clock" | "check" | "search" | "chart" | "shield"; title: string; reason?: string; action?: ReactNode; compact?: boolean }): JSX.Element;
// stats.tsx
export interface Stat { id: string; label: string; value: number | string; delta?: { value: number; label: string }; tone?: Tone; onClick?: () => void; icon?: ReactNode }
export function StatStrip({ stats, label }: { stats: Stat[]; label: string }): JSX.Element; // one surface, capsules; each clickable capsule is a <button>
// progress.tsx
export function MiniStageTrack({ stages, size }: { stages: PipelineProgress[]; size?: "xs" | "sm" }): JSX.Element; // 9 segments, role="img" aria-label "Stage x of 9, n of m steps"
export function SeverityChip({ severity, children }: { severity: Severity; children: ReactNode }): JSX.Element;
// segmented.tsx
export function SegmentedSwitch<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }): JSX.Element; // role="radiogroup"
// table.tsx
export function CardList<T>({ items, render, keyOf, label }: { items: T[]; render: (t: T) => ReactNode; keyOf: (t: T) => string; label: string }): JSX.Element; // <ul> of .card-row
```
`index.ts` re-exports everything the old `ui.tsx` exported plus the new primitives, so `import { … } from "@/lib/ui"` keeps working (Vite resolves `@/lib/ui` to `ui/index.ts` once `ui.tsx` is deleted).

- [ ] **Step 1: Move** the contents of `ui.tsx` into `core.tsx`, `modal.tsx`, `toast.tsx` unchanged except `Modal` now calls `useFocusTrap(ref, open, { onEscape: onClose, returnFocus: true })` (the extracted logic; identical behaviour, `onClose` via ref).
- [ ] **Step 2: Tests**
```tsx
// layer.test.tsx
it("closes on Escape and returns focus to the anchor", async () => { … render a button + <Layer open …>; fireEvent.keyDown(document, { key: "Escape" }); expect(onClose).toHaveBeenCalled(); });
it("closes on outside mousedown", …);
it("renders as a sheet on mobile (variant auto)", () => { mock matchMedia to match BP.mobile; expect(container.querySelector(".sheet")).toBeTruthy(); });
// progress.test.tsx
it("MiniStageTrack marks done, current and pending segments", () => { … expect(segments[0]).toHaveClass("done"); expect(track).toHaveAttribute("aria-label", expect.stringContaining("Stage 2 of 9")); });
```
- [ ] **Step 3: Implement primitives and CSS** (`components.css`): `.layer` (float-strong, `--e-3`, radius `--r-lg`, `transform-origin` from `--origin`), `.layer.enter` animation `scale(.96)→1` + fade `var(--d-2) var(--ease-out)`, `.sheet` (fixed bottom, radius top `22px`, translateY animation `var(--d-3)`), `.tooltip` (float-strong, 12.5px, `--z-popover`), `.skeleton` (surface-2 with a `--shimmer` gradient animation 1.6 s, disabled under reduced motion), `.empty-state` (surface-2 dashed, glyph 28px accent), `.stat-strip` (surface, `display:grid; grid-auto-flow:column; gap:0`; capsule = `button.stat` with 30px value, delta chip), `.mini-track` (grid of 9 `span.seg` 4px high, done=green, current=accent with glow, pending=hair), `.sev-chip`, `.segmented`, `.card-row` (surface, radius md, padding 12/14).
- [ ] **Step 4: Tests pass; `npm run verify`; `npm run build`; visual check: existing pages unchanged.** Checkpoint.

---

## Stage 2 + 3 — Application shell and floating dock

### Task 6: Navigation model

**Files:**
- Create: `src/shell/nav.ts`, `src/shell/nav.test.ts`

**Interfaces (produces):**
```ts
export type DestId = "home" | "cases" | "approvals" | "escalations" | "people" | "governance" | "more" | "profile" | "documents" | "journey";
export interface Destination { id: DestId; label: string; icon: LucideIcon; page: string; pages: string[]; badge?: (b: Badges) => number | undefined; shortcut?: string; children?: { id: string; label: string; page: string }[] }
export interface Badges { unassigned: number; toReview: number; pendingGates: number; breaches: number; retentionOverdue: number; returned: number }
export interface NavInput { role: Role; can: (p: Permission) => boolean; isAdmin: boolean; seesAll: boolean }
export function destinationsFor(i: NavInput): { primary: Destination[]; more: Destination[] };
export function activeDestination(page: string, dests: Destination[]): DestId | undefined;  // "case" → "cases"; "" → "home"
export function pageTitle(page: string, i: NavInput): string; // "Overview" | "My dashboard" | "Cases" | "My caseload" | existing TITLES
```
Rules: staff `primary` = home; cases (if `case.view` and scope ≠ none; label "My caseload" when !seesAll); approvals (`gate.view`); escalations (`escalation.view`); people (`staff.read` → page "staff", `role.view` → adds child "roles"; if only `role.view`, page = "roles"); governance (`dataprotection.view` → "dataprotection", `audit.view` → child "audit"; if only audit → page "audit"). `more` = settings (`settings.view`), prompts (`isAdmin`) rendered as a "More" dock item only when non-empty. Students: home("My placement"), profile, documents, journey. Shortcuts `Alt+1..9` by position.

- [ ] **Step 1: Tests** — counsellor default gets home/cases("My caseload")/approvals and no more; team leader gets people+governance without more; admin gets 6 primary + more(2); student gets 4; `activeDestination("case")` = "cases"; `activeDestination("roles")` = "people"; `activeDestination("audit")` = "governance".
- [ ] **Step 2: Implement. Step 3: pass. Step 4: verify. Checkpoint.**

### Task 7: Dock component

**Files:**
- Create: `src/shell/Dock.tsx`, `src/shell/Dock.test.tsx`; CSS in `src/styles/shell.css` (replace old sidebar rules progressively; keep old rules until Task 8 deletes the old shells)

**Interfaces:**
- Consumes: `Destination`, `Badges` from nav.ts; `Tooltip` from ui.
- Produces: `export function Dock({ items, activeId, onNavigate, badges, compact }: { items: Destination[]; activeId?: DestId; onNavigate: (page: string) => void; badges: Badges; compact: boolean }): JSX.Element`

Behaviour: `<nav className="dock float" aria-label="Main">` with `<ul role="list">`; each item `<button type="button" className="dock-item" aria-current={active ? "page" : undefined} tabIndex={roving} aria-label={label + (badge ? `, ${badge} needing attention` : "")}>`; icon 18 px; label hidden when `compact` except on the active item; badge `<span class="badge">`; keyboard ArrowLeft/Right/Home/End move focus, Enter/Space activate; global `Alt+N` handled in TopBar (Task 8). Sliding highlight: a single `<span class="dock-pill" aria-hidden>` whose `transform: translateX(var(--x))` and `width: var(--w)` are set from the active button's `offsetLeft/offsetWidth` in `useLayoutEffect` (re-measured on `ResizeObserver` of the nav and on `compact` change); CSS `transition: transform var(--d-3) var(--spring), width var(--d-3) var(--spring)`; under reduced motion transition none. "More" destination opens a `Layer` listing its children.

- [ ] **Step 1: Tests**
```tsx
it("marks the active item and moves focus with arrow keys", () => { render(<Dock … activeId="cases" />); expect(screen.getByRole("button", { name: /cases/i })).toHaveAttribute("aria-current", "page"); const first = screen.getAllByRole("button")[0]; first.focus(); fireEvent.keyDown(first, { key: "ArrowRight" }); expect(document.activeElement).toBe(screen.getAllByRole("button")[1]); });
it("shows a badge with an accessible name", …);
it("navigates on click", () => { … expect(onNavigate).toHaveBeenCalledWith("approvals"); });
```
- [ ] **Step 2: Implement + CSS**: `.dock { display:inline-flex; gap:2px; padding:4px; border-radius: var(--r-pill); position: relative; height: 48px }`, `.dock-item { position:relative; z-index:1; min-width:44px; height:40px; padding:0 12px; border-radius: var(--r-pill); display:inline-flex; align-items:center; gap:8px; font: 500 13.5px var(--ui); color: var(--ink2) }`, `.dock-item[aria-current="page"] { color: var(--ink); font-weight:600 }`, `.dock-pill { position:absolute; top:4px; left:0; height:40px; border-radius: var(--r-pill); background: var(--accent-soft); border:1px solid var(--accent-line); box-shadow: var(--e-1) }`, compact: `.dock.compact .dock-item:not([aria-current]) .lbl { display:none }`. Forced colours: pill → `Highlight`, active text `HighlightText`.
- [ ] **Step 3: pass, verify. Checkpoint.**

### Task 8: AppShell, TopBar, ProfileMenu, MobileTabBar, page router; retire old shells

**Files:**
- Create: `src/shell/AppShell.tsx`, `TopBar.tsx`, `ProfileMenu.tsx`, `MobileTabBar.tsx`, `pages.tsx`, `src/views/student/{ProfilePage,DocumentsPage,JourneyPage}.tsx`, `src/views/home/StudentHome.tsx` (moved `HomePage` from StudentShell, unchanged for now), tests `src/shell/AppShell.test.tsx`
- Modify: `src/App.tsx`, `src/styles/shell.css`
- Delete: `src/views/StaffShell.tsx`, `src/views/StudentShell.tsx` (after parity), old `.shell/.sidebar/.nav*/.student-*` CSS

**Interfaces:**
- `pages.tsx`: `export function renderPage(route: Route, s: SessionCtx): ReactNode` — the `switch` from StaffShell (with the same `can()` guards and `Denied`) plus the student pages when `s.user.role === "student"` (`home` → StudentHome, `profile`, `documents`, `journey`, else StudentHome; no case for a student without a linked case → the existing `Empty` copy).
- `AppShell`: reads session; computes `destinationsFor`, `activeDestination`, `useCaseSignals` → `countBadges`; renders `<div className="app" data-rail={railMode}>` → `<TopBar/>`, `<div className="frame">` → `<main id="main" className="page" tabIndex={-1}>` + rail slot (`{railEnabled && <StudentRail/>}`, added in Task 16; until then renders nothing) + `<MobileTabBar/>` under BP.tablet; layers root for `NotificationCenter` (Task 14) and `CommandPalette` (Task 9).
- `TopBar`: wordmark (logo only under BP.compact), context chip when `route.page === "case"` (`<button class="ctx-chip">← Cases · {ref}</button>` → `go({page:"cases"})`), `<Dock compact={useMediaQuery(BP.compact)}/>` hidden under BP.tablet, utilities: `SearchButton` (Task 9), `NotificationBell` (Task 14 — until then a disabled bell with `aria-label="Notifications"` is NOT rendered; render nothing), `ThemeToggle`? — no: theme lives in ProfileMenu; `ProfileMenu`.
- `ProfileMenu`: avatar button → `Layer` (placement bottom-end, width 280): name, role + branch, `LiveBadge`, appearance switch (`SegmentedSwitch` light/dark), "Notification settings" (Task 15; until then hidden), sign out.
- `MobileTabBar`: `<nav class="tabbar float" aria-label="Main">` first 4 primary destinations + "More" (opens Layer sheet with the rest + rail entry for counsellors in Task 16).
- Global shortcuts in `AppShell`: `Alt+1..9` → nth destination; `Ctrl/⌘+K` → palette; `?` (not in inputs) → shortcuts Layer listing them.
- `App.tsx`: `{!snap.loaded ? <ShellSkeleton/> (Task 10; until then keep the spinner) : !user ? <AuthScreen/> : <AppShell/>}`; `useDocumentTitle(pageTitle(...))` in AppShell.

CSS (`shell.css`, replacing the old): `.app { min-height:100vh; display:flex; flex-direction:column }`, `.topbar { position:sticky; top:0; z-index:var(--z-bar); height:var(--bar-h); display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; padding:0 var(--s-5); }` with `.topbar-l`, `.topbar-c` (dock), `.topbar-r` (justify end, gap 8); bar background: none until scrolled → add class `.scrolled` via a scroll listener (passive) → `.topbar.scrolled { background: var(--float); backdrop-filter: blur(18px); border-bottom: 1px solid var(--surface-border) }`. `.frame { display:grid; grid-template-columns: minmax(0,1fr) auto; flex:1 }`, `.page { max-width:1360px; width:100%; margin:0 auto; padding: var(--s-6) var(--s-7) 56px; min-width:0 }`, `@media (max-width:1023px) { .topbar { grid-template-columns: auto 1fr auto } .page { padding: var(--s-4) var(--s-4) calc(var(--tabbar-h) + 24px) } }`, `.tabbar { position:fixed; left:12px; right:12px; bottom: calc(10px + env(safe-area-inset-bottom)); height: var(--tabbar-h); border-radius: var(--r-xl); display:grid; grid-auto-flow:column; z-index: var(--z-dock) }` shown only ≤1023. `.ctx-chip` (surface-2, pill).

- [ ] **Step 1: Test** — render `<App/>` with a seeded local store for each role (helper `signInAs(role)` in `src/test/session.tsx` that writes a user into `store` via `store.mutateOrg` and sets `sessionStorage` `lpl:pms:session`): assert `nav[aria-label="Main"]` contains the expected destination names per role; assert `#main` exists; assert the old `aside.sidebar` is absent; assert that for a student the dock has "My placement".
- [ ] **Step 2: Implement** all files; move student page components out of StudentShell verbatim; `renderPage` copies the switch exactly (including `Denied`).
- [ ] **Step 3: Delete** StaffShell/StudentShell and old CSS; grep for imports.
- [ ] **Step 4: Tests pass; verify; build; browser walk of every route for admin, team leader, counsellor, student in light and dark, at 1440 / 1100 / 800 / 390 widths. Checkpoint.**

### Task 9: Command palette

**Files:**
- Create: `src/shell/CommandPalette.tsx`, `src/shell/CommandPalette.test.tsx`, `src/shell/commands.ts`

**Interfaces:**
- `commands.ts`: `export interface Command { id: string; group: "Go to" | "Cases" | "People" | "Actions"; label: string; hint?: string; run: () => void; keywords?: string }`; `export function buildCommands(s: SessionCtx, signals: Map<string, CaseSignals>): Command[]` — destinations (+ children), cases visible to the user (`canReadCase`) with `ref · name · destination`, staff (if `staff.view`) opening `staff`, actions: "Create student" (`case.write` and scope all/assigned → `go({page:"cases", id:"new"})` and CasesPage opens the dialog when `route.id === "new"`), "Switch appearance", "Sign out".
- `CommandPalette`: `Layer` modal (variant popover-centred: `placement:"center"` — add to Layer), `role="combobox"` input with `aria-expanded`, `aria-controls`, `aria-activedescendant`; results `role="listbox"`; fuzzy match = case-insensitive substring over `label + keywords`, max 12; Arrow keys/Enter/Escape; grouped headings.

- [ ] **Step 1: Tests** — typing "0001" lists the case; Enter navigates (`window.location.hash` becomes `#/case/c1`); Escape closes.
- [ ] **Step 2: Implement (+ `.palette` CSS: width 620, top 12vh). Step 3: pass, verify. Checkpoint.**

### Task 10: Skeleton first paint and region error boundaries

**Files:**
- Create: `src/shell/ShellSkeleton.tsx`, `src/lib/ui/boundary.tsx`
- Modify: `src/App.tsx`, `src/shell/AppShell.tsx`

- [ ] **Step 1:** `ShellSkeleton` renders the topbar frame with a dock-shaped skeleton and `PageSkeleton variant` chosen from `parseHash()` (`case` → workspace, `cases|staff|audit|approvals|escalations` → list, `settings|roles|dataprotection|prompts` → settings, else dashboard). `role="status" aria-live="polite" aria-label="Opening the workspace"`.
- [ ] **Step 2:** `RegionBoundary` (class component, props `{ label: string; children }`) renders a `surface` with "This section could not be drawn" + Reload button; wrap `renderPage()` output and, later, the rail and the notification center.
- [ ] **Step 3:** App uses `ShellSkeleton` when `!snap.loaded`; crossfade class `.page.enter` on content mount.
- [ ] **Step 4:** verify, build, browser check with throttled network (DevTools) in server-less mode (the skeleton flashes briefly). Checkpoint.

---

## Stage 4 — Notifications

### Task 11: Notification types and reference fan-out

**Files:**
- Create: `src/notifications/types.ts`, `src/notifications/fanout.ts`, `src/notifications/fanout.test.ts`, `src/notifications/reminders.ts`, `src/notifications/reminders.test.ts`
- Modify: `src/lib/types.ts` (re-export `NotificationRow`)

**Interfaces (produces):**
```ts
export type NotificationType = "gate_submitted" | "gate_decided" | "document_uploaded" | "document_reviewed" | "profile_submitted" | "step_completed" | "case_assigned" | "status_changed" | "sla_due" | "sla_breached" | "account" | "system";
export type Priority = "low" | "normal" | "high";
export interface NotificationRow { id: string; recipientId: string; at: string; type: NotificationType; priority: Priority; title: string; body?: string; caseId?: string; caseRef?: string; step?: number; link?: string; groupKey?: string; dedupeKey?: string; readAt?: string }
export interface FanoutContext { actorId: string; users: Record<string, User>; config: OrgConfig; now: string }
export function fanout(prev: CaseRecord | null, next: CaseRecord, ctx: FanoutContext): NotificationRow[];  // ids via uid(); never includes ctx.actorId as recipient
export function rolesHolding(config: OrgConfig, perm: Permission): Role[]; // admin always
export function recipientsHolding(users, config, perm): string[]; // active users whose role holds perm
export interface Reminder { id: string; caseId: string; caseRef: string; name: string; label: string; days: number; severity: "warn" | "bad"; step: number; link: string }
export function deriveReminders(signals: Iterable<CaseSignals>, mineId: string): Reminder[]; // SLA flags due-soon/breached + returned gates on cases assigned to mineId, sorted bad first then days asc
export function displayTitle(n: NotificationRow, viewerRole: Role): string; // step_completed → STEP_BY_N[step].studentTitle for students, title otherwise
```
Rules (both here and in SQL, Task 13): see spec §F and this table:

| Trigger (prev→next) | Recipients | type | priority | title | link | dedupe |
|---|---|---|---|---|---|---|
| counsellorId changed and set | new counsellor | case_assigned | normal | `Case {ref} assigned to you` | `#/case/{id}` | `{id}:assigned:{assignedAt}` |
| new gate (by id) with status pending | recipientsHolding(gate.write) | gate_submitted | high | `Gate {g} submitted on {ref}` (round > 1 → `resubmitted`) | `#/case/{id}/step/{g}` | `{id}:gate:{gid}:pending` |
| gate status pending→approved/returned | counsellorId | gate_decided | returned→high, approved→normal | `Gate {g} approved on {ref}` / `Gate {g} returned on {ref}` | step link | `{id}:gate:{gid}:{status}` |
| new document (by id) | counsellorId when uploadedBy ≠ counsellorId | document_uploaded | normal | `Document uploaded on {ref}: {kind label}` | `#/case/{id}/documents` | `{id}:doc:{did}:uploaded` |
| document status uploaded→accepted/rejected | studentUserId | document_reviewed | rejected→high | `Document accepted: {kind}` / `Document returned: {kind}` | `#/documents` | `{id}:doc:{did}:{status}` |
| steps[2].studentSubmittedAt changed and step 2 not done | counsellorId | profile_submitted | normal | `Profile submitted on {ref}` | `#/case/{id}/step/2` | `{id}:profile:{submittedAt}` |
| step n pending→done by staff | studentUserId | step_completed | low | `Step {n} completed` | `#/journey/step/{n}` | `{id}:step:{n}:done:{completedAt}` |
| step 26/29 done by the student | counsellorId | step_completed | normal | `Step {n} confirmed by student on {ref}` | `#/case/{id}/step/{n}` | same |
| status changed | studentUserId and counsellorId | status_changed | exited/hold→high else normal | `Case {ref} {STATUS_LABEL}` | student `#/`, staff `#/case/{id}` | `{id}:status:{status}:{updatedAt}` |

Kind label = `STEP_BY_N[step].docs.find(d=>d.id===kind)?.label ?? kind`. `groupKey = caseId`.

- [ ] **Step 1: Tests** — one `it` per row of the table plus: "the actor is never a recipient", "a second identical diff yields the same dedupeKey", "no change → []", "deriveReminders sorts breached first".
- [ ] **Step 2: Implement. Step 3: pass, verify. Checkpoint.**

### Task 12: Backend and store support for notifications

**Files:**
- Modify: `src/lib/store.ts`, `src/lib/server.ts`, `src/lib/types.ts`
- Create: `src/notifications/useNotifications.ts`, `src/notifications/useNotifications.test.ts`

**Interfaces (produces):**
```ts
// Backend (store.ts) — new required methods
notificationState(userId: string): Promise<{ unread: number; latest: string | null }>;
notificationsPage(userId: string, before: string | null, limit: number, unreadOnly: boolean): Promise<NotificationRow[]>;
markNotificationsRead(userId: string, ids: string[]): Promise<void>;
markAllNotificationsRead(userId: string): Promise<void>;
// Store
store.notificationState(), store.notificationsPage(before, limit, unreadOnly), store.markNotificationsRead(ids), store.markAllNotificationsRead() — all use the signed-in user id passed by the caller (store keeps `currentUserId`, set by App on sign-in via store.setCurrentUser(id|null))
store.onNotifications(fn: (state: { unread; latest }) => void): () => void  // emitted from the poll tick
// Hook
export function useNotifications(): { unread: number; items: NotificationRow[]; loading: boolean; hasMore: boolean; error?: string; open(): Promise<void>; loadMore(): Promise<void>; markRead(ids: string[]): Promise<void>; markAll(): Promise<void>; filter: "all" | "unread"; setFilter(f): void }
```
Browser-storage (`KvBackend`): blob key `lpl:pms:notifications` = `{ rows: NotificationRow[] }` capped at 500 per recipient; `saveCases(next, prev)` in `KvBackend` gets a new hook: the **store** (not the adapter) computes `fanout(prev.cases[id], next.cases[id], ctx)` in `mutateCases` when `this.backend.kind !== "server"` and calls `backend.appendNotifications(rows)` (new Kv-only method, no-op on server). Dedupe on `dedupeKey`. Server (`SupabaseBackend`): RPCs `notification_state`, `notifications_page`, `mark_notifications_read`, `mark_all_notifications_read` (Task 13 SQL); row mapper `toNotification(r)`.
Polling: in `store.refresh()`, when signed in, call `backend.notificationState(uid)` **in parallel** with `version()`; emit `onNotifications` when `latest` or `unread` changed. Optimistic mark-read in the hook with rollback on rejection.

- [ ] **Step 1: Tests** — using the memory backend: `store.mutateCase` that submits a gate produces a row for a team leader user in the org; `notificationState` counts 1 unread; `markAllNotificationsRead` zeroes it; `useNotifications` `open()` loads a page and `markRead` updates `unread` optimistically.
- [ ] **Step 2: Implement. Step 3: pass, verify. Checkpoint.**

### Task 13: Database schema, migration file, Go contract

**Files:**
- Modify: `supabase/schema.sql` (append), `server/internal/contract/tables.go`, `server/internal/contract/functions.go`, `server/internal/contract/contract_test.go`
- Create: `supabase/migrations/20260912_notifications_audit.sql` (identical SQL to the appended block, so provisioned projects run only this file)

- [ ] **Step 1: SQL — audit columns and RPCs** (append after the audit table):
```sql
alter table public.audit
  add column if not exists event_type text, add column if not exists entity_type text, add column if not exists entity_id text,
  add column if not exists entity_label text, add column if not exists outcome text not null default 'success',
  add column if not exists source text, add column if not exists session_id text, add column if not exists summary text,
  add column if not exists changes jsonb, add column if not exists meta jsonb;
create index if not exists audit_actor_idx  on public.audit (actor_id, at desc);
create index if not exists audit_entity_idx on public.audit (entity_type, entity_id, at desc);
create index if not exists audit_type_idx   on public.audit (event_type, at desc);
comment on column public.audit.changes is 'Field-level diff for updates: [{field,label,old,new}], sensitive values redacted by the client';

create or replace function public.audit_page(p_before timestamptz, p_actor text, p_event_type text, p_entity_type text, p_entity_id text, p_from timestamptz, p_to timestamptz, p_q text, p_limit integer)
  returns table (id text, at timestamptz, actor_id text, actor_name text, actor_role text, action text, target text, detail text, event_type text, entity_type text, entity_id text, entity_label text, outcome text, source text, session_id text, summary text, has_changes boolean)
  language sql stable security invoker set search_path = public as $$
  select a.id, a.at, a.actor_id, a.actor_name, a.actor_role, a.action, a.target, a.detail, a.event_type, a.entity_type, a.entity_id, a.entity_label, a.outcome, a.source, a.session_id, a.summary, (a.changes is not null) as has_changes
  from public.audit a
  where (p_before is null or a.at < p_before)
    and (p_actor is null or a.actor_id = p_actor)
    and (p_event_type is null or a.event_type = p_event_type)
    and (p_entity_type is null or a.entity_type = p_entity_type)
    and (p_entity_id is null or a.entity_id = p_entity_id)
    and a.at >= coalesce(p_from, now() - interval '30 days')
    and (p_to is null or a.at <= p_to)
    and (p_q is null or p_q = '' or a.action ilike '%' || p_q || '%' or a.summary ilike '%' || p_q || '%' or a.target ilike '%' || p_q || '%' or a.entity_label ilike '%' || p_q || '%' or a.actor_name ilike '%' || p_q || '%')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
create or replace function public.audit_detail(p_id text) returns table (id text, changes jsonb, meta jsonb)
  language sql stable security invoker set search_path = public as $$ select a.id, a.changes, a.meta from public.audit a where a.id = p_id $$;
```
- [ ] **Step 2: SQL — notifications**:
```sql
create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  recipient_id text not null,
  at timestamptz not null default now(),
  type text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  title text not null, body text,
  case_id text, case_ref text, step integer, link text, group_key text,
  dedupe_key text unique,
  read_at timestamptz, pushed_at timestamptz
);
create index if not exists notifications_unread_idx on public.notifications (recipient_id, at desc) where read_at is null;
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, at desc);
comment on table public.notifications is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Per-recipient notifications written by database triggers.';

create table if not exists public.push_subscriptions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null, endpoint text not null unique, p256dh text not null, auth text not null,
  user_agent text, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), revoked_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
comment on table public.push_subscriptions is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Web Push subscriptions, one row per device.';

create or replace function public.roles_holding(perm text) returns text[]
  language plpgsql stable security definer set search_path = public as $$
declare cell jsonb; out text[];
begin
  select c.config -> 'permissions' -> perm into cell from public.org_config c where c.id = 'org';
  if cell is not null and jsonb_typeof(cell) = 'array' then select array_agg(x) into out from jsonb_array_elements_text(cell) t(x);
  else select d.roles into out from public.permission_defaults d where d.perm = roles_holding.perm; end if;
  out := array_append(coalesce(out, '{}'), 'admin');
  return out;
end $$;

create or replace function public.notify_insert(p_recipient text, p_type text, p_priority text, p_title text, p_case_id text, p_case_ref text, p_step integer, p_link text, p_dedupe text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_recipient = coalesce(public.current_app_user_id(), '') then return; end if;
  insert into public.notifications (recipient_id, type, priority, title, case_id, case_ref, step, link, group_key, dedupe_key)
  values (p_recipient, p_type, p_priority, p_title, p_case_id, p_case_ref, p_step, p_link, p_case_id, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.notify_case_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ref text := new.ref; cid text := new.id; g jsonb; o jsonb; d jsonb; k text; st jsonb; ost jsonb; r text; kind_label text;
  student text := new.student_user_id; couns text := new.counsellor_id;
begin
  -- assignment
  if new.counsellor_id is not null and new.counsellor_id is distinct from (case when tg_op = 'INSERT' then null else old.counsellor_id end) then
    perform public.notify_insert(new.counsellor_id, 'case_assigned', 'normal', 'Case ' || ref || ' assigned to you', cid, ref, null, '#/case/' || cid, cid || ':assigned:' || coalesce(new.data ->> 'assignedAt', now()::text));
  end if;
  if tg_op = 'INSERT' then return new; end if;
  -- gates
  for g in select * from jsonb_array_elements(coalesce(new.data -> 'gates', '[]'::jsonb)) loop
    select x into o from jsonb_array_elements(coalesce(old.data -> 'gates', '[]'::jsonb)) x where x ->> 'id' = g ->> 'id';
    if o is null and g ->> 'status' = 'pending' then
      for r in select unnest(public.roles_holding('gate.write')) loop
        perform public.notify_insert(u.id, 'gate_submitted', 'high', 'Gate ' || (g ->> 'gate') || case when (g ->> 'round')::int > 1 then ' resubmitted on ' else ' submitted on ' end || ref, cid, ref, (g ->> 'gate')::int, '#/case/' || cid || '/step/' || (g ->> 'gate'), cid || ':gate:' || (g ->> 'id') || ':pending:' || u.id)
        from public.app_users u where u.active and u.role = r;
      end loop;
    elsif o is not null and o ->> 'status' = 'pending' and g ->> 'status' in ('approved','returned') then
      perform public.notify_insert(couns, 'gate_decided', case when g ->> 'status' = 'returned' then 'high' else 'normal' end, 'Gate ' || (g ->> 'gate') || ' ' || (g ->> 'status') || ' on ' || ref, cid, ref, (g ->> 'gate')::int, '#/case/' || cid || '/step/' || (g ->> 'gate'), cid || ':gate:' || (g ->> 'id') || ':' || (g ->> 'status'));
    end if;
  end loop;
  -- documents
  for d in select * from jsonb_array_elements(coalesce(new.data -> 'documents', '[]'::jsonb)) loop
    select x into o from jsonb_array_elements(coalesce(old.data -> 'documents', '[]'::jsonb)) x where x ->> 'id' = d ->> 'id';
    kind_label := d ->> 'kind';
    if o is null then
      if d ->> 'uploadedBy' is distinct from couns then
        perform public.notify_insert(couns, 'document_uploaded', 'normal', 'Document uploaded on ' || ref || ': ' || kind_label, cid, ref, (d ->> 'step')::int, '#/case/' || cid || '/documents', cid || ':doc:' || (d ->> 'id') || ':uploaded');
      end if;
    elsif o ->> 'status' = 'uploaded' and d ->> 'status' in ('accepted','rejected') then
      perform public.notify_insert(student, 'document_reviewed', case when d ->> 'status' = 'rejected' then 'high' else 'normal' end, case when d ->> 'status' = 'rejected' then 'Document returned: ' else 'Document accepted: ' end || kind_label, cid, ref, (d ->> 'step')::int, '#/documents', cid || ':doc:' || (d ->> 'id') || ':' || (d ->> 'status'));
    end if;
  end loop;
  -- profile submitted
  if new.data -> 'steps' -> '2' ->> 'studentSubmittedAt' is distinct from old.data -> 'steps' -> '2' ->> 'studentSubmittedAt' and coalesce(new.data -> 'steps' -> '2' ->> 'status', 'pending') <> 'done' then
    perform public.notify_insert(couns, 'profile_submitted', 'normal', 'Profile submitted on ' || ref, cid, ref, 2, '#/case/' || cid || '/step/2', cid || ':profile:' || (new.data -> 'steps' -> '2' ->> 'studentSubmittedAt'));
  end if;
  -- steps completed
  for k in select jsonb_object_keys(coalesce(new.data -> 'steps', '{}'::jsonb)) loop
    st := new.data -> 'steps' -> k; ost := old.data -> 'steps' -> k;
    if st ->> 'status' = 'done' and coalesce(ost ->> 'status', 'pending') <> 'done' then
      if st ->> 'completedBy' = student then
        perform public.notify_insert(couns, 'step_completed', 'normal', 'Step ' || k || ' confirmed by student on ' || ref, cid, ref, k::int, '#/case/' || cid || '/step/' || k, cid || ':step:' || k || ':done:' || coalesce(st ->> 'completedAt', ''));
      else
        perform public.notify_insert(student, 'step_completed', 'low', 'Step ' || k || ' completed', cid, ref, k::int, '#/journey/step/' || k, cid || ':step:' || k || ':done:' || coalesce(st ->> 'completedAt', ''));
      end if;
    end if;
  end loop;
  -- status
  if new.status is distinct from old.status then
    perform public.notify_insert(student, 'status_changed', case when new.status in ('exited','hold') then 'high' else 'normal' end, 'Case ' || ref || ' ' || new.status, cid, ref, null, '#/', cid || ':status:' || new.status || ':' || new.updated_at::text || ':s');
    perform public.notify_insert(couns, 'status_changed', case when new.status in ('exited','hold') then 'high' else 'normal' end, 'Case ' || ref || ' ' || new.status, cid, ref, null, '#/case/' || cid, cid || ':status:' || new.status || ':' || new.updated_at::text || ':c');
  end if;
  return new;
end $$;
drop trigger if exists cases_notify on public.cases;
create trigger cases_notify after insert or update on public.cases for each row execute function public.notify_case_change();
```
Note: `perform … from public.app_users u where …` inside `notify_insert` calls needs a loop: rewrite as `for u in select id from public.app_users where active and role = r loop perform public.notify_insert(u.id, …); end loop;` — do that in the file (the plan shows intent).

- [ ] **Step 3: SQL — notification RPCs, SLA emitter, prune, RLS, grants**:
```sql
create or replace function public.notification_state() returns table (unread integer, latest timestamptz)
  language sql stable security invoker set search_path = public as $$
  select count(*) filter (where read_at is null)::int, max(at) from public.notifications where recipient_id = public.current_app_user_id() $$;
create or replace function public.notifications_page(p_before timestamptz, p_limit integer, p_unread_only boolean) returns setof public.notifications
  language sql stable security invoker set search_path = public as $$
  select * from public.notifications where recipient_id = public.current_app_user_id()
    and (p_before is null or at < p_before) and (not coalesce(p_unread_only,false) or read_at is null)
  order by at desc, id desc limit least(greatest(coalesce(p_limit, 30), 1), 100) $$;
create or replace function public.mark_notifications_read(p_ids text[]) returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer; begin update public.notifications set read_at = now() where id = any(p_ids) and recipient_id = public.current_app_user_id() and read_at is null; get diagnostics n = row_count; return n; end $$;
create or replace function public.mark_all_notifications_read() returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer; begin update public.notifications set read_at = now() where recipient_id = public.current_app_user_id() and read_at is null; get diagnostics n = row_count; return n; end $$;

create or replace function public.emit_sla_notifications() returns integer
  language plpgsql security definer set search_path = public as $$
declare c record; cfg jsonb; cis int; offer int; fu int; due timestamptz; days int; n integer := 0; tl text;
begin
  select config into cfg from public.org_config where id = 'org';
  cis := coalesce((cfg -> 'sla' ->> 'cisDays')::int, 7); offer := coalesce((cfg -> 'sla' ->> 'offerReminderDays')::int, 21); fu := coalesce((cfg -> 'sla' ->> 'followUpMonths')::int, 3);
  for c in select id, ref, counsellor_id, data from public.cases where status = 'open' loop
    -- CIS: step 3 done, step 4 not done
    if c.data -> 'steps' -> '3' ->> 'status' = 'done' and coalesce(c.data -> 'steps' -> '4' ->> 'status','pending') <> 'done' and (c.data -> 'steps' -> '3' ->> 'completedAt') is not null then
      due := (c.data -> 'steps' -> '3' ->> 'completedAt')::timestamptz + make_interval(days => cis); days := ceil(extract(epoch from (due - now())) / 86400);
      if days <= 2 then perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'high', 'Course Information Sheet ' || case when days < 0 then 'overdue' else 'due' end || ' on ' || c.ref, c.id, c.ref, 4, '#/case/' || c.id || '/step/4', c.id || ':cis:' || case when days < 0 then 'breached' else 'due' end || ':' || due::date); n := n + 1; end if;
    end if;
    -- offer lapse
    if (c.data -> 'steps' -> '13' -> 'values' ->> 'offerLapseDate') is not null and coalesce(c.data -> 'steps' -> '14' ->> 'status','pending') <> 'done' then
      due := (c.data -> 'steps' -> '13' -> 'values' ->> 'offerLapseDate')::timestamptz; days := ceil(extract(epoch from (due - now())) / 86400);
      if days <= offer then perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'high', case when days < 0 then 'Offer lapsed on ' else 'Offer lapse approaching on ' end || c.ref, c.id, c.ref, 13, '#/case/' || c.id || '/step/13', c.id || ':offer:' || case when days < 0 then 'breached' else 'due' end || ':' || due::date); n := n + 1; end if;
    end if;
    -- follow-up
    if c.data -> 'steps' -> '30' ->> 'status' = 'done' and (c.data -> 'steps' -> '30' -> 'values' ->> 'arrivalDate') is not null and coalesce(c.data -> 'steps' -> '31' ->> 'status','pending') <> 'done' then
      due := (c.data -> 'steps' -> '30' -> 'values' ->> 'arrivalDate')::timestamptz + make_interval(months => fu); days := ceil(extract(epoch from (due - now())) / 86400);
      if days <= 7 then perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'normal', 'Three-month follow-up ' || case when days < 0 then 'overdue' else 'due' end || ' on ' || c.ref, c.id, c.ref, 31, '#/case/' || c.id || '/step/31', c.id || ':followup:' || case when days < 0 then 'breached' else 'due' end || ':' || due::date); n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;
-- Schedule on Supabase (dashboard SQL, once): select cron.schedule('lpl-sla', '0 3 * * *', $$select public.emit_sla_notifications()$$);

create or replace function public.prune_notifications(p_days integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer; begin
  if public.current_app_role() is distinct from 'admin' then raise exception 'Pruning notifications requires the Administrator role'; end if;
  delete from public.notifications where at < now() - make_interval(days => greatest(coalesce(p_days, 90), 7)); get diagnostics n = row_count; return n; end $$;

create or replace function public.guard_notification_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then raise exception 'Only read_at may change'; end if;
  return new;
end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications for each row execute function public.guard_notification_update();

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using (recipient_id = public.current_app_user_id());
create policy notifications_update on public.notifications for update to authenticated using (recipient_id = public.current_app_user_id()) with check (recipient_id = public.current_app_user_id());
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function public.notification_state(), public.notifications_page(timestamptz, integer, boolean), public.mark_notifications_read(text[]), public.mark_all_notifications_read(), public.prune_notifications(integer), public.audit_page(timestamptz, text, text, text, text, timestamptz, timestamptz, text, integer), public.audit_detail(text) to authenticated;
```
Also extend `workspace_version()`? **No** — notifications must not trigger workspace reloads; `notification_state()` is polled separately.

- [ ] **Step 4: Migration file** = the same three blocks, verbatim.
- [ ] **Step 5: Go contract** — `tables.go`: add the 10 audit columns (`event_type` Text … `changes` JSONB, `meta` JSONB, `outcome` Text, `session_id` Text), `notifications` (14 columns, pk `id`), `push_subscriptions` (9 columns, pk `id`). `functions.go`: add `notification_state {}`, `notifications_page {p_before,p_limit,p_unread_only}`, `mark_notifications_read {p_ids}`, `mark_all_notifications_read {}`, `prune_notifications {p_days}`, `audit_page {p_before,p_actor,p_event_type,p_entity_type,p_entity_id,p_from,p_to,p_q,p_limit}`, `audit_detail {p_id}`. `contract_test.go` `TestTablesMatchSchema` counts: audit 18, notifications 14, push_subscriptions 9. Check `server/internal/httpapi/rpc.go` binds params as text — `p_limit integer`, `p_unread_only boolean`, `p_ids text[]`, `p_before timestamptz` must be cast: read `rpc.go`/`sql.go`; if every parameter is passed as `text` with Postgres coercion `($1::text)`, add a `Types []string` field on `Function` or pass JSON values through `jsonb_populate_record`-style casts — implement the minimal change that makes `select * from public.notifications_page($1::timestamptz, $2::int, $3::boolean)` work (extend `Function` with `ParamTypes []string` defaulting to `text`), with a unit test in `rpc_test.go` asserting the generated SQL.
- [ ] **Step 6: `cd server && go build ./... && go vet ./... && go test ./...`** (unit suites; integration skips without Postgres). `npm run verify`. Checkpoint.

### Task 14: Notification bell and center

**Files:**
- Create: `src/notifications/NotificationBell.tsx`, `NotificationCenter.tsx`, `NotificationItem.tsx`, `NotificationCenter.test.tsx`; CSS in `components.css`
- Modify: `src/shell/TopBar.tsx`, `src/shell/AppShell.tsx`

**Interfaces:**
- `NotificationBell`: `<button class="icon-btn bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-haspopup="dialog" aria-expanded>` with `<span class="bell-count">`; a `role="status"` visually-hidden live region announcing "{n} new notifications" when `unread` increases while closed.
- `NotificationCenter`: `Layer` anchored to the bell (bottom-end, width 420, sheet on mobile), `label="Notifications"`, header with title + "Mark all as read" button (disabled when unread 0) + settings gear (Task 15); `SegmentedSwitch` All / Unread / Reminders; list `role="list"`, items grouped by `groupKey` (case) then by day (Today / Yesterday / date); group header shows `caseRef · student name` (name from the loaded case when visible, else ref only); item = `NotificationItem` (`<li role="listitem">` containing a `<button>`: type glyph, `displayTitle`, body, relative time, priority accent bar, unread dot; click → `markRead([id])` then `go` to the link (link parsing via `parseHash`-compatible strings; for students `#/journey/step/n` maps to `go({page:"journey", step:n})`); Reminders tab lists `deriveReminders(...)` items with days and a "Open step" action; keyboard: ArrowUp/Down move between item buttons, `r` marks focused item read, Escape closes; "Load more" button at the end when `hasMore`; skeleton rows while `loading && items.length===0`; empty states per tab from spec §O; error `Notice` with retry.
- Under reduced motion: no stagger.

- [ ] **Step 1: Tests** — with the memory backend seeded: bell shows count; opening lists items grouped by case; "Mark all as read" clears the count; clicking an item calls `markRead` and changes `location.hash`; Unread tab hides read items; Reminders tab shows a due-soon CIS reminder.
- [ ] **Step 2: Implement + CSS** (`.bell-count` unread pill top-right, `--unread` bg, `--on-accent` text, 18px; `.ncenter` header/tabs/list; `.nitem` grid `24px 1fr auto`, `.nitem.unread` left accent bar 3px; `.nitem .dot`; group header `.ngroup` uppercase 11px muted).
- [ ] **Step 3: Wire** bell into `TopBar` for every role; center mounted in `AppShell` layers; `AppShell` subscribes `store.onNotifications` → `useNotifications` state.
- [ ] **Step 4: pass, verify, build, browser: submit a gate as a counsellor in local mode, sign in as the team leader (same browser, local mode), bell shows 1.** Checkpoint.

### Task 15: Web push architecture

**Files:**
- Create: `src/notifications/push.ts`, `src/notifications/push.test.ts`, `src/notifications/settings.tsx`, `src/sw.ts`, `supabase/functions/push-dispatch/index.ts`
- Modify: `scripts/finalize.mjs`, `.github/workflows/pages.yml`, `src/lib/store.ts`, `src/lib/server.ts`, `src/lib/types.ts` (`OrgConfig.push?: { vapidPublicKey?: string }`), `src/lib/defaults.ts` (normalize), `src/views/staff/Settings.tsx` (VAPID public key field under a new "Notifications" panel, `settings.write`), `src/shell/ProfileMenu.tsx` ("Notification settings" → opens `NotificationSettings` in a Layer)

**Interfaces (produces):**
```ts
// push.ts
export type PushSupport = "unsupported" | "insecure" | "no-key" | "ready";
export function pushSupport(vapidPublicKey?: string): PushSupport; // needs https or localhost, serviceWorker, PushManager, Notification, key
export function permissionState(): NotificationPermission | "unsupported";
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null>; // navigator.serviceWorker.register("./sw.js", { scope: "./" })
export async function subscribeThisDevice(vapidPublicKey: string): Promise<{ endpoint: string; p256dh: string; auth: string } | null>; // requests permission ONLY here
export async function unsubscribeThisDevice(): Promise<string | null>; // returns endpoint
export function urlBase64ToUint8Array(s: string): Uint8Array;
// Backend
savePushSubscription(userId: string, sub: { endpoint; p256dh; auth; userAgent }): Promise<void>; // upsert on endpoint
revokePushSubscription(userId: string, endpoint: string): Promise<void>; // sets revoked_at (server) / removes (kv)
listPushSubscriptions(userId: string): Promise<{ endpoint: string; createdAt: string; userAgent?: string; thisDevice: boolean }[]>;
```
`NotificationSettings` card: permission state line (granted / denied with how to re-enable in browser settings / default), support line (unsupported / insecure context / no key configured by the administrator), "Enable on this device" button (only when `ready` and permission ≠ denied), "Disable on this device", device list with revoke, and a "Prefer reminders in the center" note (no per-type preferences — YAGNI). The center's settings gear opens the same card; a one-time dismissible hint card appears at the top of the center the second time it opens (`useLocalPref("lpl:pms:push-hint")`) when `pushSupport === "ready"` and permission is `default`.
`sw.ts`: `self.addEventListener("push", …)` → `showNotification(data.title, { body, tag: data.id, data: { link }, icon: undefined })`; `notificationclick` → `clients.matchAll({type:"window"})` → focus the first client and `client.navigate(client.url.split("#")[0] + link)` else `clients.openWindow("./" + link)`. Sign-out revokes this device's subscription (best effort).
`finalize.mjs`: `import { build } from "esbuild"; await build({ entryPoints: ["src/sw.ts"], bundle: true, minify: true, outfile: "dist/sw.js", target: "es2019", legalComments: "inline" })` before the cleanup loop; keep `sw.js` in the keep-list; CSP `worker-src 'self'`. `pages.yml`: `cp dist/sw.js site/sw.js`.
`push-dispatch/index.ts` (Deno): POST with header `x-lpl-dispatch-secret` = `DISPATCH_SECRET`; uses service role client to select `notifications where pushed_at is null order by at limit 200` joined to active `push_subscriptions` of the recipient; sends Web Push (VAPID via `npm:web-push@3`) with payload `{ id, title, body, link }`; on 404/410 sets `revoked_at`; on success/permanent failure sets `pushed_at = now()`; on 5xx leaves for retry (max 5 attempts tracked in a `meta`-free way: add column `push_attempts integer default 0` — include in Task 13 SQL and tables.go (notifications = 15 columns)). Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto), `DISPATCH_SECRET`. Invocation: Database Webhook on `notifications` insert or `pg_cron` every minute via `net.http_post` — documented in README, not automated.

- [ ] **Step 1: Tests** — `pushSupport` returns `insecure` on `http://` non-localhost (mock `location`), `unsupported` without `PushManager`, `no-key` without a key; `urlBase64ToUint8Array("AQAB")` → `[1,0,1]`; settings card renders the denied explanation when `Notification.permission === "denied"`.
- [ ] **Step 2: Implement all files.** Step 3: `npm run verify && npm run build`; confirm `dist/sw.js` exists and `index.html` CSP contains `worker-src 'self'`; `deno check supabase/functions/push-dispatch/index.ts` if Deno is installed, otherwise note it. Checkpoint.

---

## Stage 5 — Counsellor rail

### Task 16: Student rail

**Files:**
- Create: `src/shell/rail/{StudentRail.tsx,RailRow.tsx,StudentPreview.tsx,seen.ts}`, `src/shell/rail/StudentRail.test.tsx`; CSS in `shell.css`
- Modify: `src/shell/AppShell.tsx`, `src/shell/TopBar.tsx` (slide-over toggle on tablet), `src/shell/MobileTabBar.tsx` (Students tab), `src/views/CaseWorkspace.tsx` (mark seen on open)

**Interfaces (produces):**
```ts
// seen.ts
export function lastSeen(userId: string, caseId: string): string | null; export function markSeen(userId: string, caseId: string, updatedAt: string): void; export function hasUnseen(userId: string, s: CaseSignals): boolean; // updatedAt > lastSeen && lastEventBy !== userId
// StudentRail
export type RailMode = "docked" | "strip" | "over" | "sheet";
export function railEnabled(s: SessionCtx): boolean; // caseScopeOf(config, role) === "assigned"
export function StudentRail({ mode, open, onOpenChange }: { mode: RailMode; open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element;
// RailRow
export function RailRow({ s, expanded, unseen, onOpen, onToggle }: { s: CaseSignals; expanded: boolean; unseen: boolean; onOpen: () => void; onToggle: () => void }): JSX.Element;
// StudentPreview
export function StudentPreview({ s, c, onOpenStep, onOpenDocuments, onOpenTimeline }: { s: CaseSignals; c: CaseRecord; … }): JSX.Element;
```
Mode selection in AppShell: `wide/≥1280 → "docked"` (user can collapse to `"strip"` via the rail header; remembered with `useLocalPref("lpl:pms:rail")`), `1024–1279 → "strip"` (click → overlay `"over"`), `768–1023 → "over"` (toggle button in TopBar "My students · n"), `<768 → "sheet"` (Students tab in MobileTabBar). Docked width `--rail-w`; page keeps `minmax(0,1fr)`.
Content: header `MY STUDENTS` + collapse button; search input (`aria-label="Search students"`); groups: `Needs attention` (severity ≠ none, open), `In progress` (open, none), `On hold · deferred`, `Completed · exited` (last two collapsed by default, remembered). Row: `Avatar`, name, ref, `MiniStageTrack size="xs"`, `{pct}%`, `SeverityChip` with the top attention label, unseen dot (`aria-label="Updates since you last opened this case"`). Sorted by `compareSeverity`. Click name → `go({page:"case", caseId})` + `markSeen`; chevron → expanded `StudentPreview` inline (`aria-expanded`, `region`); on pointer devices hovering 500 ms shows the preview in a `Layer` popover anchored to the row (closes on leave/Escape). Preview: `Ring` 56, current stage/step, the three clocks (from `flags`, "—" when not running), documents awaiting review, latest gate state, last three events (`c.events.slice(0,3)`), actions: Open current step (`go({page:"case", caseId, step: currentStep})`), Documents (`tab:"documents"`), Timeline (`tab:"timeline"`). Empty state per spec. Strip mode: 64px column of avatars with severity ring colour and unseen dot; `title` = name; click opens the workspace; a "chevron" button at top expands to `over`.
Persistence: rail survives navigation because it lives in AppShell; CaseWorkspace calls `markSeen` on mount and on `c.updatedAt` change while open.
Perf: rows are `memo`; the list uses `useCaseSignals()`; FLIP reorder added in Task 25.

- [ ] **Step 1: Tests** — counsellor with 3 assigned cases (one with a returned gate) sees the returned case first under "Needs attention"; clicking the name navigates; expanding shows "Gate 16 returned with suggestions"; search filters; team leader (scope all) does not render the rail; empty state for a counsellor with no cases.
- [ ] **Step 2: Implement + CSS** (`.rail { width: var(--rail-w); position: sticky; top: var(--bar-h); height: calc(100vh - var(--bar-h)); overflow:auto; border-left: 1px solid var(--surface-border); padding: var(--s-4) }`, `.rail.strip { width: 64px }`, `.rail.over` = fixed right slide-over (float-strong, width min(360px, 92vw), `--z-sheet`), `.rail-row`, `.rail-group h3` 11px uppercase muted, `.rail-row .unseen` dot).
- [ ] **Step 3: pass, verify, build, browser walk as counsellor across every section: the rail persists.** Checkpoint.

---

## Stage 6 + 7 — Dashboards

### Task 17: Interactive charts

**Files:**
- Modify: `src/lib/charts.tsx`; Create: `src/lib/charts.test.tsx`

**Interfaces:** `AreaChart` gains `onHover?`, internal tooltip: pointer move computes nearest index; renders `<div class="chart-tip" role="status">` with label and each series value; dots get `tabIndex={0}`, `onFocus` shows the tooltip, `aria-label` per dot; `ranges?: { id: string; label: string }[]` + `range`/`onRange` render a `SegmentedSwitch` in the chart header (caller passes 6/12/24 months and recomputes `monthlyVolume`). `Donut` gains hover highlight (segment `opacity .55` for non-hovered; legend `onMouseEnter`). `Ring` gains optional `onClick` and `detail?: ReactNode` rendered in a `Layer` on click. `StageTrack` gains `onSelect?(stageId)` for the StageFlow section. All durations use `var(--d-chart)`.

- [ ] **Step 1: Tests** — focusing a dot shows the tooltip text `Jan: 3 enquiries`; range switch calls `onRange("6")`.
- [ ] **Step 2: Implement (+ `.chart-tip` CSS float-strong).** Step 3: pass, verify. Checkpoint.

### Task 18: Home sections

**Files:**
- Create: `src/views/home/sections/{AttentionQueue,StageFlow,MovementFeed,PerformanceSection,CounsellorLoad,ComplianceStrip,SystemHealth,StudentHero,StudentTasks}.tsx`, `src/views/home/sections/sections.test.tsx`

**Interfaces:**
```ts
AttentionQueue({ items: AttentionItem[]; signals: Map<string, CaseSignals>; limit?: number; title?: string }) // grouped by severity with inline actions: "Open step" (go case+step), "Review documents" (tab documents), "Confirm profile" (step 2); empty state "Nothing needs attention"
StageFlow({ signals: CaseSignals[]; onSelect?(stageId): void; selected?: string }) // 9 columns: stage name, count, bar height relative; click filters; aria: list with counts
MovementFeed({ items: { id; at; text; by; caseId?; caseRef? }[]; limit?: number }) // timeline; empty "No recent activity"
PerformanceSection({ cases: CaseRecord[]; config; canDownload; onExport }) // collapsible (details/summary, remembered via useLocalPref "lpl:pms:perf"), contains Funnel, AreaChart with ranges, Service levels rings, Destination donut, Channel bars, Exits
CounsellorLoad({ counsellors: User[]; signals: CaseSignals[] }) // compact rows: avatar, name, load bar, open, gates, docs, breaches as chips
ComplianceStrip({ cases; config }) // retention overdue, due soon, transfers without safeguard, consent coverage → StatStrip with onClick to dataprotection tabs
SystemHealth({ snap, users }) // backend kind, last sync age, active staff, students, profiles without sign-in (server: auth_id null → toUser has no auth info; use `store.server?` presence + users count only), version
StudentHero({ c, s }) // ring 176, where you are now, coming next (from StudentShell HomePage)
StudentTasks({ c }) // "What we need from you" checklist with CTAs (from StudentShell HomePage)
```
- [ ] **Step 1: Tests** — AttentionQueue renders bad before info and the action button label; StageFlow shows 9 stages and calls onSelect; PerformanceSection collapsed state persists; ComplianceStrip counts.
- [ ] **Step 2: Implement (+ `pages.css` `.attention-row`, `.stage-flow` grid, `.movement`).** Step 3: pass, verify. Checkpoint.

### Task 19: Role dashboards

**Files:**
- Create: `src/views/home/{Overview,CounsellorHome,TeamLeaderHome,AdminHome,StudentHome}.tsx`, `src/views/home/home.test.tsx`
- Delete: `src/views/staff/Overview.tsx`

Layouts (desktop grid `grid-template-columns: minmax(0, 7fr) minmax(0, 5fr)`; single column ≤1023):
- **CounsellorHome**: header "Good {morning|afternoon|evening}, {firstName}" + one line `{open} open · {breached} overdue · {toReview} to review`; StatStrip (Active, Overdue, Awaiting TL / Returned, To review; deltas vs 30 days ago from events); main: AttentionQueue; side: StageFlow (my open cases, click → `go({page:"cases", id:"stage:"+stageId})` which CasesPage reads as a stage filter), MovementFeed (my cases' events); PerformanceSection (my funnel, my destinations) collapsed by default.
- **TeamLeaderHome**: header + StatStrip (Awaiting my decision, Overdue clocks, Unassigned, Documents to review); main: Approvals queue (top 8 pending gates: age, case, counsellor, "Review" → approvals page with `id`) + Escalations strip (breached first); side: StageFlow (all open), CounsellorLoad; PerformanceSection (team funnel, volume with ranges, service levels).
- **AdminHome**: StatStrip (Open cases, Unassigned, Overdue, Retention overdue); main: StageFlow + CounsellorLoad; side: ComplianceStrip, SystemHealth, MovementFeed from `store.auditPage({limit:8})` (Task 22; until then from case events); PerformanceSection.
- **StudentHome**: notices (kept), StudentHero, StudentTasks + counsellor card, key details + recent updates (kept from old HomePage), "Service levels that protect you" when no facts (kept).
- **Overview**: `role === "student" → StudentHome; isAdmin → AdminHome; can("analytics.view") → TeamLeaderHome; else CounsellorHome`.
Every `can()` from the old Overview stays (`analytics.read` gates PerformanceSection with the existing neutral Notice; `analytics.download` gates export; `audit.read` gates the activity feed on AdminHome).

- [ ] **Step 1: Tests** — counsellor sees "Needs attention"; team leader sees "Awaiting my decision"; admin sees "Compliance"; a counsellor without `analytics.read` sees no performance charts.
- [ ] **Step 2: Implement; update `pages.tsx` imports.** Step 3: pass, verify, build, browser check for the four roles. Checkpoint.

### Task 20: Cases, case workspace and page consistency pass

**Files:**
- Modify: `src/views/staff/Cases.tsx`, `src/views/CaseWorkspace.tsx`, `src/views/staff/{Approvals,Staff,Roles,Settings,DataProtection,PromptEngineer}.tsx`, `src/views/Auth.tsx`, `src/styles/pages.css`

- [ ] **Step 1: Cases** — filter bar becomes `FilterBar` (search, status, stage, counsellor, Needs attention) on one `surface-2` row; reads `route.id` for `new` (open dialog) and `stage:{id}` (preset stage); list uses `useCaseSignals()` for chips (SeverityChip with top attention label, MiniStageTrack in the progress cell); ≤767 renders `CardList` rows (ref · name · stage · chips) instead of the table; sort unchanged.
- [ ] **Step 2: CaseWorkspace header** — recomposed: left `Ring 116`, centre name/ref/status/contact/current stage, right counsellor + actions on a `surface-2`; `style={{ viewTransitionName: `case-${c.id}` }}` on the header wrapper (Task 25 drives it); `markSeen` on mount; SLA pills become `SeverityChip`s. Tabs unchanged. Spine unchanged.
- [ ] **Step 3: Consistency pass** — every page: `page-head` becomes `<PageHeader title context actions/>` (new in `ui/core.tsx`: `export function PageHeader({ title, context, actions, children }: …)`), inline `style={{ padding: 12 }}` filter panels → `.filters` class, ad-hoc `gridTemplateColumns` in DataProtection → `.filters.cols-2`, `panel-b muted` empties → `EmptyState compact`, busy labels stay, KPI grids → `StatStrip` where the tiles were counts (Staff, Approvals, Escalations, DataProtection). Auth: card becomes `.surface` (no blur) with the side panel unchanged.
- [ ] **Step 4: verify, build, browser walk every page in both themes at 1440 and 390.** Checkpoint.

---

## Stage 8 — Audit

### Task 21: Typed audit events

**Files:**
- Create: `src/lib/audit.ts`, `src/lib/audit.test.ts`
- Modify: `src/lib/types.ts` (`AuditEntry` gains optional `eventType, entityType, entityId, entityLabel, outcome, source, sessionId, summary, changes, meta`), `src/lib/server.ts` (`fromAudit`/`toAudit` map the new columns; `has_changes` → `hasChanges`)

**Interfaces (produces):**
```ts
export type AuditEventType = "create" | "update" | "delete" | "login" | "logout" | "permission" | "auth" | "notification" | "file" | "case" | "gate" | "document" | "system" | "export";
export type EntityType = "case" | "step" | "gate" | "document" | "user" | "account" | "role" | "settings" | "dataprotection" | "prompt" | "session" | "transfer" | "processor" | "workspace" | "notification";
export interface Change { field: string; label: string; old: unknown; new: unknown }
export interface AuditEvent { action: string; eventType: AuditEventType; entityType: EntityType; entityId?: string; entityLabel?: string; target?: string; detail?: string; outcome?: "success" | "failure"; summary?: string; changes?: Change[]; meta?: Record<string, unknown> }
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>, fields: { id: string; label: string; sensitive?: boolean }[]): Change[]; // sensitive → old/new "[restricted]"; max 40; skips equal
export const EVENTS: {
  caseOpened(c: CaseRecord, source: string): AuditEvent; caseAssigned(c, toName, fromName?): AuditEvent; caseStatus(c, status, detail?): AuditEvent; caseExported(c): AuditEvent;
  stepCompleted(c, n): AuditEvent; stepNa(c, n): AuditEvent; stepReopened(c, n): AuditEvent; stepConfirmedByStudent(c, n): AuditEvent; profileSubmitted(c, changes: Change[]): AuditEvent;
  gateSubmitted(c, g): AuditEvent; gateResubmitted(c, g, note): AuditEvent; gateDecided(c, g, approved: boolean, note?): AuditEvent;
  documentUploaded(c, kind, fileName): AuditEvent; documentReviewed(c, kind, accepted: boolean, note?): AuditEvent; documentRemoved(c, kind): AuditEvent;
  profileCreated(u): AuditEvent; profileUpdated(u, changes): AuditEvent; signInIssued(email, roleLabel): AuditEvent; signInNotIssued(email, error): AuditEvent; temporaryPassword(u): AuditEvent; accountActive(u, active: boolean): AuditEvent; adminBootstrapped(email): AuditEvent;
  permissionChanged(perm, role, granted: boolean): AuditEvent; permissionsReset(): AuditEvent; caseScopeChanged(role, scope): AuditEvent;
  settingsUpdated(changes): AuditEvent; backupExported(): AuditEvent; backupRestored(counts): AuditEvent; workspaceReset(): AuditEvent; serverConnected(url): AuditEvent; serverDisconnected(): AuditEvent;
  disposed(c, basis): AuditEvent; legalHold(c, placed: boolean, reason): AuditEvent; transferUpdated(c, changes): AuditEvent; registerExported(): AuditEvent; processorAdded(name): AuditEvent; processorRemoved(name): AuditEvent;
  promptCreated(p): AuditEvent; promptDuplicated(p): AuditEvent; promptDeleted(p): AuditEvent; promptSaved(p, version): AuditEvent; promptsExported(n): AuditEvent; promptsImported(n): AuditEvent;
  sessionSignIn(u): AuditEvent; sessionSignOut(u): AuditEvent; signInFailed(email, reason): AuditEvent;
  overviewExported(): AuditEvent; staffExported(): AuditEvent; auditExported(filters): AuditEvent; notificationsRead(n): AuditEvent;
};
```
Each builder keeps the existing `action` label from §1.4 of the spec (e.g. `caseAssigned` → "Case assigned" / "Case reassigned"; `caseStatus` → "Reopen case" | "Place case on hold" | "Defer intake" | "Exit case" | "Complete"), sets `eventType`/`entityType`/`entityId` (`c.id`, `u.id`, `p.id`), `entityLabel` (`c.ref`, `u.name`, `p.title`) and a `summary` (e.g. "Updated student profile", "Approved gate 16 (round 2)").

- [ ] **Step 1: Tests** — `diffChanges` redacts sensitive fields and skips equal values; `EVENTS.caseAssigned` yields action "Case reassigned" when `fromName` is given; every builder returns an `entityType` and `eventType`.
- [ ] **Step 2: Implement. Step 3: pass, verify. Checkpoint.**

### Task 22: Audit backend, store API, call-site migration

**Files:**
- Modify: `src/lib/store.ts`, `src/lib/server.ts`, `src/App.tsx`, every file listed in spec §1.4 (Staff, Roles, Settings, Approvals, DataProtection, PromptEngineer, Documents, Cases, CaseWorkspace, StepPanel, StudentHome/ProfilePage/JourneyPage, Auth, home/*)
- Create: `src/lib/audit-store.test.ts`

**Interfaces (produces):**
```ts
export interface AuditQuery { before?: string | null; actorId?: string; eventType?: AuditEventType; entityType?: EntityType; entityId?: string; from?: string; to?: string; q?: string; limit?: number }
// Backend
auditPage(q: AuditQuery): Promise<AuditEntry[]>;  // server: rpc audit_page; kv: filter + slice of the blob (same semantics, default window 30 days)
auditDetail(id: string): Promise<Pick<AuditEntry, "changes" | "meta"> | null>;
// Store
store.audit(event: AuditEvent): Promise<void>; // fills actor from currentUser, sessionId, source "web"; replaces appendAudit for callers
store.auditPage(q), store.auditDetail(id)
// SessionCtx
audit: (e: AuditEvent) => Promise<void>;  // replaces `log`
```
Server `load()` no longer selects `audit`; `Snapshot.audit` stays for Kv modes and for restore; `refresh()` drops the audit comparisons; `LiveBadge` unaffected. Sign-in path (`Auth.tsx` + `App.tsx` session resolve) writes `sessionSignIn`; `signOut` writes `sessionSignOut` before clearing; failed sign-in writes `signInFailed(email, reason)` (no password). Settings reset/connect/disconnect write their events. `Roles` permission toggles write `permissionChanged(perm, role, granted)`. Staff profile edits compute `diffChanges` over name/email/phone/branch/role. Profile submission by a student computes `diffChanges` over the step-2 fields (sensitive flagged from `spine.ts`).

- [ ] **Step 1: Tests** — `store.audit(EVENTS.caseOpened(...))` in memory mode stores `eventType: "create"` and `sessionId`; `auditPage({ eventType: "gate" })` filters; `auditDetail` returns changes; `auditPage` default window excludes a 40-day-old entry.
- [ ] **Step 2: Implement store/server; migrate every call site** (grep `log(` and `appendAudit(` until only `store.ts` remains). Step 3: pass, verify, build. Checkpoint.

### Task 23: Audit explorer

**Files:**
- Create: `src/views/staff/AuditExplorer.tsx`, `src/views/staff/AuditExplorer.test.tsx`; Delete `src/views/staff/Audit.tsx`; Modify `src/shell/pages.tsx`, `src/views/home/AdminHome.tsx` (MovementFeed from `auditPage({limit:8})`)

Behaviour: `PageHeader` "Audit log" + context "Precise, append-only record of every action. Newest first."; `FilterBar`: date range (`SegmentedSwitch` 24h / 7d / 30d / 90d / Custom with two date inputs), actor select (from `users`), event type select (`AuditEventType` labels), entity type select, free text; `audit.read` gates the list (existing neutral Notice otherwise); list = `CardList` rows (time · actor avatar+name+role · summary or action · entity chip · outcome chip); row `button aria-expanded` → lazy `auditDetail(id)` → detail panel: `changes` as a two-column table (label · old → new, "[restricted]" rendered as a `restricted` chip), `meta` as key/value; skeleton rows on first load; "Load more" keyset (`before = last.at`); export (`audit.download`) pages through `auditPage` with the current filters until fewer than `limit` rows return, then downloads CSV with the new columns and writes `EVENTS.auditExported(filters)`; empty state "No events match"; error Notice + retry. Legacy rows (`eventType` undefined) show the action and a "Legacy" chip.

- [ ] **Step 1: Tests** — filters call `auditPage` with `eventType`; expanding a row calls `auditDetail` once and shows old/new; Load more appends and passes `before`.
- [ ] **Step 2: Implement (+ CSS `.audit-row`, `.changes-table`).** Step 3: pass, verify, build, browser check with 30 seeded local events. Checkpoint.

---

## Stage 9 — Motion

### Task 25: Motion refinement

**Files:**
- Create: `src/lib/motion.ts` (`useViewTransition(): (fn: () => void) => void` — wraps `document.startViewTransition` when available and not reduced motion; `useFlip(listRef, keyOf)` — records first rects, after commit animates `transform` from delta over `var(--d-3)`), `src/lib/motion.test.ts`
- Modify: `src/App.tsx` (`go()` wrapped in `useViewTransition` for `case` navigations), `src/shell/rail/StudentRail.tsx` (FLIP on group lists ≤ 30 rows), `src/styles/base.css` (`::view-transition-old(root)`, `::view-transition-new(root)` 200 ms crossfade; `::view-transition-group(case-*)` 320 ms), `src/lib/charts.tsx` durations → tokens, `Layer` transform-origin from anchor corner, `.page.enter` 6 px rise (no stagger after first visit: `useLocalPref("lpl:pms:visited")` set of pages).

- [ ] **Step 1: Tests** — `useViewTransition` calls the callback directly when `startViewTransition` is absent; under reduced motion (mock matchMedia) it also calls directly; `useFlip` applies a transform when a key moves.
- [ ] **Step 2: Implement.** Step 3: pass, verify, build, browser: navigate rail row → workspace (Chromium shows the header morph), toggle reduced motion in DevTools → instant. Checkpoint.

---

## Stage 10 — Responsive

### Task 26: Responsive redesign

**Files:**
- Modify: `src/styles/{shell,components,pages,base}.css`, `src/shell/MobileTabBar.tsx`, `src/views/staff/{Cases,Staff,AuditExplorer}.tsx` (CardList under BP.mobile — Cases done in Task 20; Staff and Audit here), `src/views/staff/DataProtection.tsx` (filters in a `Layer` sheet under BP.mobile via a "Filters" button), `src/lib/ui/layer.tsx` (drag-to-dismiss on sheets: pointer events on the handle, dismiss when dragged > 120 px or velocity > 0.6 px/ms)

- [ ] **Step 1: Consolidate breakpoints** to 1440 / 1280 / 1024 / 768 / 640 (forms keep 640): replace 1100 with 1280 for `grid-3/4`, 960/480 with 768/640 for filters, 900 → 768 for auth, 720 → 768 for student chrome.
- [ ] **Step 2: Tab bar polish** — active indicator dot, labels 11px, safe-area; "Students" tab for rail-enabled roles with unseen count; "More" sheet lists remaining destinations + theme + sign out.
- [ ] **Step 3: Case workspace on mobile** — sticky action row (`.modal-f` pattern) for Step panel actions; spine behind the existing stage button.
- [ ] **Step 4: Verify in the browser preview at 390 × 844, 768 × 1024, 1024 × 768, 1440 × 900 for every role; no horizontal page scroll (`document.documentElement.scrollWidth === clientWidth`).** Checkpoint.

---

## Stage 11 — Accessibility

### Task 27: Accessibility pass

**Files:**
- Create: `src/test/axe.test.tsx` (axe-core over the rendered shell + home + cases + audit + notification center for each role, both themes; fail on any violation of `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` rules)
- Modify: styles (forced-colours for `.dock`, `.dock-pill`, `.tabbar`, `.rail`, `.layer`, `.sheet`, `.stat`, `.mini-track`, `.sev-chip`, `.nitem`), components (missing names, `aria-live` regions, focus order), `scripts/contrast.mjs` (any pair added since Task 2)

- [ ] **Step 1: Write the axe test** using `axe.run(container, { runOnly: [...] })` per screen; run `npm run test`; fix every violation at source.
- [ ] **Step 2: Keyboard walk** in the browser: Tab order bar → dock → utilities → page → rail; Escape closes topmost layer; focus returns; skip link lands on `#main`.
- [ ] **Step 3: Screen-reader notes** — record in README "Outstanding: NVDA pass" remains for a human; list what was verified by axe.
- [ ] **Step 4: verify, build. Checkpoint.**

---

## Stage 12 — Performance

### Task 28: Performance pass

- [ ] **Step 1: Re-render audit** — wrap `RailRow`, `NotificationItem`, `AttentionQueue` rows, `StageFlow` in `memo`; ensure `AppShell` reads `snap` slices via `useStoreSelect`; profile with React DevTools in the preview: a notification poll tick with no change re-renders nothing (add a test: `store.refresh()` with unchanged version → `renders` unchanged for a `useStoreSelect(s => s.cases.rev)` hook).
- [ ] **Step 2: Blur count** — `document.querySelectorAll` in a test asserting no element outside `.float, .modal, .toast, .layer, .sheet, .tooltip, .topbar.scrolled` has `backdrop-filter` (walk computed styles in jsdom is not possible → make it a CSS-source assertion: grep `backdrop-filter` occurrences in the four CSS files ≤ 6).
- [ ] **Step 3: Bundle** — `npm run build`; record `dist/index.html` size; must be ≤ 700 KB; if over, trim lucide imports (ensure only named icon imports) and remove dead CSS (search for classes with no references).
- [ ] **Step 4: Poll payload** — server `load()` no longer includes audit (assert in `server.test.ts` with a fetch mock that no request hits `/rest/v1/audit` on load, and `rpc/notification_state` is called once per refresh).
- [ ] **Step 5: verify. Checkpoint.**

---

## Stage 13 — Consistency audit and documentation

### Task 29: Cross-page audit, docs, acceptance checklist

- [ ] **Step 1: Cross-page sweep** — every page uses `PageHeader`, `surface` tiers, `EmptyState`, `SeverityChip`, tokens (no raw hex outside tokens.css: `grep -rn "#[0-9a-f]\{6\}" src --include=*.tsx --include=*.css | grep -v tokens.css` returns only SVG data URIs and the brand logo), no leftover `.sidebar`/`.student-nav` classes, no `console.log`, no demo data.
- [ ] **Step 2: README** — new sections: Application shell, Notifications (tables, triggers, RPCs, scheduling `emit_sla_notifications`, push setup: VAPID keys, `push-dispatch` secrets, webhook/cron), Audit (columns, RPCs, explorer), Design system (tokens, tiers, motion), Testing (`npm run verify`), version 5.0.0; update the Layout table; update `server/README.md` contract table for the new RPCs/tables; note the unverified live-project items.
- [ ] **Step 3: Acceptance checklist** — go through every `[ ]` in the brief's final acceptance criteria and record the evidence (test name, screenshot path, or "unverifiable without live Supabase: …") in `docs/superpowers/plans/2026-09-12-acceptance.md`.
- [ ] **Step 4: Final `npm run verify && npm run build && (cd server && go test ./...)`; browser walk; deliver `dist/LPL_Placement_Management_System.html` and the checklist to the user.**

---

## Self-review

**Spec coverage:** §A shell → T8; §B nav → T6/T7; §C/§D dashboards → T18/T19; §E rail → T16; §F notifications → T11–T15; §G motion → T25 (+ Layer in T5, dock pill in T7); §H tokens/tiers → T2; §I components → T5/T8; §J responsive → T8/T20/T26; §K a11y → T27 (+ per-component ARIA in each task); §L perf → T3/T12/T22/T28; §M audit → T13/T21–T23; §N skeletons → T5/T10; §O empty states → T5 + each page task; §P–S tokens/type/icons/interactions → T2/T7/T9. Migration strategy → tasks are sequential; old shells removed in T8 only after `renderPage` parity. Go contract → T13.

**Placeholders:** none of "TBD/TODO/later"; every task has file paths, interfaces, test intent with concrete assertions, and the code or CSS contract needed.

**Type consistency:** `CaseSignals`/`AttentionItem` (T4) used by T16/T18/T19/T11; `Destination`/`Badges` (T6) by T7/T8/T9; `NotificationRow` (T11) by T12/T14/T15; `AuditEvent`/`AuditQuery` (T21/T22) by T23/T19; `Layer`/`SegmentedSwitch`/`StatStrip`/`MiniStageTrack`/`SeverityChip`/`EmptyState`/`PageSkeleton` (T5) everywhere after. Store methods named identically in Backend, Store and hooks.

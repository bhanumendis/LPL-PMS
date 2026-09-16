# LPL PMS v5 — acceptance record

Recorded 13 September 2026 against `docs/superpowers/specs/2026-09-12-ui-reimagination-design.md` (§A–§S) and the user's follow-up requests. Branch `redesign/v5`, uncommitted.

Gate at the time of recording: `npm run verify` green (typecheck, eslint, 111 vitest tests, contrast AAA in both themes); `npm run build` green, `dist/LPL_Placement_Management_System.html` 747 KB; `server/` `go vet` and `go test ./...` green. Browser checks ran in the Claude Browser pane against `npm run dev` with a seeded browser-storage workspace (1 administrator, 1 Team Leader, 2 counsellors, 1 student, 12 cases at different steps).

Legend: **Met** — verified by the evidence given. **Met, unverified live** — implemented and tested locally, needs a live Supabase project. **Not met** — with the reason.

## User requests (follow-up, 13 September)

| Requirement | Status | Evidence |
|---|---|---|
| Counsellor sidebar, **always minimised**, opens **from the left** when pressed | Met | `src/shell/rail/StudentRail.tsx` (strip + slide-over); test `stays minimised on the left, slides open…`; browser at 1440 light/dark and 768: strip present, panel slides from the left |
| Shows only the students assigned to that counsellor | Met | same test asserts another counsellor's student is absent |
| Each student's **percentage**, **stage** and **step** as a quick summary | Met | `RailRow.tsx` (ring %, `Stage n/9 · name`, `Step n · title`, nine-stage track); test asserts all three; inline quick view (clocks, documents, gate, updates, shortcuts) |
| Pressing a student in the strip opens their quick view | Met | test `a ring in the strip opens the panel with that student's quick view expanded; Escape closes it`; browser (dark) |
| More colourful and visually interesting, still professional and modern; not only blue stats | Met | eight-hue spectrum tokens in `tokens.css` (all pairs AAA/3:1 in both themes via `npm run contrast`); hued stat tiles with gradient icon badges; spectrum charts, funnel, stage bars and progress rings; aurora wash behind dashboard greetings; browser screenshots light and dark |
| Phones | Met | Students tab opens the same quick view as a bottom sheet (browser at 375) |

## Blueprint §A–§S

| § | Item | Status | Evidence |
|---|---|---|---|
| A | One application shell, utility bar, floating dock, no sidebar navigation | Met | `AppShell.test.tsx`; browser |
| B | Navigation model per role (People / Governance / More), Alt 1–9, ⌘K palette | Met | `nav.test.ts`, `Dock.test.tsx`, `CommandPalette.test.tsx` |
| C/D | Role dashboards (counsellor, Team Leader, administrator, student) | Met | `home.test.tsx`; browser for admin, Team Leader, counsellor |
| E | Counsellor student rail | Met (revised per user request: left, minimised, slide-out) | see above |
| F | Notifications: DB triggers, polling, bell and center, reminders, push | Met, unverified live | `fanout.test.ts`, `useNotifications.test.ts`, `NotificationCenter.test.tsx`, `push.test.ts`; `supabase/migrations/20260912_notifications_audit.sql`; `push-dispatch` not run against a project |
| G | Motion: view transitions, FLIP, page entry, reduced motion | Met | `motion.test.ts`; morph itself needs Chromium by eye |
| H | Surface tiers, blur only on the float tier | Met | `perf.test.tsx` (≤ 6 blur rules; 4 today) |
| I | Component hierarchy (PageHeader, StatStrip, FilterBar, EmptyState, SeverityChip, MiniStageTrack, Layer/sheet, CardList) | Met | used on every staff page; `Empty`/`Kpi` removed |
| J | Responsive 1440 / 1280 / 1024 / 768 / 640; cards on phones; sticky step actions; sheet drag-to-dismiss | Met | browser at 1440, 768, 375 (no horizontal scroll on any checked route); `Cases.test.tsx`; `layer.test.tsx` |
| K | Accessibility: WCAG 2.1 A/AA automated, AAA contrast, forced colours, keyboard | Met (automated) | `src/test/axe.test.tsx` 19 runs; `npm run contrast`; forced-colours blocks for dock, tab bar, rail, layers, sheets, stats, tracks, chips, notification items. Screen-reader and real forced-colours pass: **not done** (needs a person and a Windows machine) |
| L | Performance: slice subscriptions, audit out of the snapshot, memoised rows | Met | `perf.test.tsx` (quiet refresh re-renders nothing; server load reads no audit rows) |
| L | Bundle ≤ 700 KB | **Not met** | 747 KB after removing a duplicate 50 KB font face; remaining growth is feature code (react-dom alone is 130 KB). Dropping a Poppins weight or lazy features would be the next options |
| M | Typed audit events, structured columns, `audit_page`/`audit_detail`, explorer with filters, keyset paging, detail on demand, export | Met, unverified live for RPCs | `audit.test.ts`, `audit-store.test.ts`, `AuditExplorer.test.tsx`; Go contract lists both RPCs |
| N | Skeletons instead of spinners | Met | `ShellSkeleton`, `PageSkeleton`, explorer skeleton rows |
| O | Empty and error states | Met | `EmptyState` on every list; `RegionBoundary` per region |
| P–S | Tokens, type, icons, interactions | Met | palette, Poppins/Lora, lucide, 44 px targets retained |

## Known behaviour changes to note

- Workspace backups taken while connected to a server no longer contain audit rows (the snapshot does not carry them). Export from the Audit log page.
- Failed sign-ins are recorded only in browser-storage mode and only for an email that matches a profile; a server refuses writes before a session exists.

## Outstanding before real student data

1. Run the Supabase path on a live project (schema/migration, both Edge Functions, notification fan-out, scheduled `emit_sla_notifications`, audit paging, a real push).
2. Screen-reader pass (NVDA or VoiceOver) through complete-a-step, the rail quick view and the student profile form.
3. Windows forced-colours mode on a real machine.
4. Decide whether the 747 KB build is acceptable or trim further.

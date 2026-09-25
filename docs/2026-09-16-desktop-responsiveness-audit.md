# Desktop responsiveness audit — 16 September 2026

Copyright (c) 2026 Bhanu Mendis. All rights reserved.  
Author: Bhanu Mendis, Group IT, Lyceum Global Holdings

Raised as: the application "looks like a website that was made for a phone but is in a laptop".
A multi-agent audit swept the shell, the four role dashboards, the dense tables and registers, the
case workspace and the type scale. Every finding was then put to an adversarial verifier that had to
refute it against the real files before it was kept, which is why several plausible-sounding items
about density and taste are absent. 27 findings survived.

## The root cause

One rule accounted for the impression. `.page` was capped at a fixed `1360px`, and there was no
`min-width` media query anywhere in `src/styles/` — all 48 queries were `max-width`. A 2560px monitor
therefore rendered exactly the same 1296px content column as a 1366px laptop, leaving over half the
screen as empty background. Every downstream grid was solving for 1296px regardless of the display,
so widening any one of them in isolation would not have helped until the cap moved.

Measured content width against viewport, before and after:

| Viewport | Content before | Content after |
| --- | --- | --- |
| 1440px | 1296px | 1360px |
| 1680px | 1296px | 1593px |
| 1920px | 1296px | 1608px |
| 2560px | 1296px | 1608px |

## Fixed on 16 September 2026

- **The page column is hard-capped at 1360px and never grows**  
  `src/styles/shell.css:41` — `.page`
- **The top bar is full-bleed while the page is centred, so the chrome is ~292px out of alignment with the content at 1920**  
  `src/styles/shell.css:19` — `.topbar`
- **No min-width breakpoint exists: BP.wide is declared but never used, and every media query in every stylesheet is max-width**  
  `src/lib/hooks.ts:16` — `BP.wide = "(min-width: 1440px)"`
- **Performance analytics is trapped in the 7fr column, so every chart renders at ~219px**  
  `src/styles/pages.css:229` — `.perf-grid (rendered by PerformanceSection, mounted inside .home-main at AdminHome.tsx:74, TeamLeaderHome.tsx:85, CounsellorHome.tsx:53)`
- **.home is a hard 7fr/5fr two-column grid with no breakpoint above 1023px**  
  `src/styles/pages.css:181` — `.home { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 16px; align-items: start; }`
- **Profile form never exceeds 2 columns, so 24 inputs render ~620px wide each**  
  `src/styles/base.css:188` — `.form-grid (used by src/views/student/ProfilePage.tsx:47 and :51)`
- **Panel and card padding never grows — a 1296px panel has the same 20px inner gutter as a phone**  
  `src/styles/base.css:95` — `.panel > .panel-b (also .panel > .panel-h line 93, .card line 97)`
- **Heading sizes are hardcoded px that only ever shrink — h1 stays 26px at any width**  
  `src/styles/base.css:27` — `h1, h2, h3, h4 (base.css:27-30)`
- **StageFlow is locked to a 150px-tall chart with 28px bars regardless of viewport**  
  `src/styles/pages.css:198` — `.stage-flow { grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 6px; height: 150px; } with .sf-bar { width: min(28px, 70%); } at pages.css:204`
- **Workspace layout is identical from 1024px to 2560px — one fixed 324px spine and one tab at a time**  
  `src/styles/pages.css:14` — `.workspace { grid-template-columns: 324px minmax(0, 1fr) } — the only media query is max-width:1023px on line 15`

Supporting change: `--page-max`, `--page-gutter` and `--rail-w` were added to `src/styles/tokens.css`
so the page and the utility bar above it resolve against one shared measure.

## Closed on 25 September 2026

Every outstanding finding below was closed in the v6 release pass, verified by the browser
suite (`scripts/e2e-ui.sh`: the production bundle against lpl-api over 400 generated cases,
every role at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 375×812 and 360×800, plus dark
at 1440; axe WCAG 2.2 A/AA with colour contrast, no sideways scroll, no console errors, a
screenshot of every page). Differences from the recorded fixes:

- **Cases table:** the `page-wide` class is not needed (`--page-max` is already 1720px). The
  table was the problem at 1440 — its natural width pushed Attention and Updated out of the
  panel — so the column floors went, attention chips wrap, and Updated shows date over time.
  All nine columns are visible from 1280px.
- **Staff:** the row actions carry short labels with full accessible names ("Password",
  named "Set a temporary password for …"), and the role donut sits beside the table only from
  1600px, below it otherwise, so all eight columns and every action fit at 1280.
- **Stat tiles:** the two duplicate findings were applied once, at 1280px.
- **Student hero:** the two duplicate findings were applied once (the second, `.hero-txt`
  grid, form).

Found and fixed during the same pass: the hero's 640px stacking rule sat above the 1023px rule
and never applied (phones showed the ring beside a column of three words); page headers
squeezed their title beside the actions on phones; the product name slid under the dock at
1440; empty programme/destination fields left "· —" in case and student headers; the cases
filter bar stacked into a full screen of controls on phones.

## Outstanding (as recorded on 16 September; closed above)

Deferred at the request of the user on 16 September 2026, to be picked up in a later session. Each
entry below carries the verifier's corrected fix, so none of this needs auditing again.

### Cases table is pinned at its own minimum width on a 1920 screen

- **Where:** `src/views/staff/Cases.tsx:122`
- **Selector:** `table.tbl (inline style={{ minWidth: 1180 }}) inside .panel.table-wrap`
- **Severity:** high

**Problem.** The 9-column Cases table declares an inline min-width of 1180px. The widest box it can ever get is the .page content column: max-width 1360px minus var(--s-7)=32px padding each side = 1296px (shell.css:41). So at 1920px the table has 116px of slack across 9 columns (~13px each) and is effectively rendering at its minimum layout, while 560px of viewport sits empty on each side. The per-column floors already claim 900px of that (Reference 140, Student 200, Current step 220, Counsellor 170, plus .tbl .progress-cell min-width 170 at pages.css:164), and the undeclared columns carry an avatar+name, a SeverityChip, and a nowrap full date-time — so the natural width very likely exceeds 1296 and .table-wrap (base.css:239, overflow-x: auto) scrolls the table sideways inside its own box even though the document does not scroll. Either way, a 1920px screen shows exactly the 1366px-laptop table.

**Fix.** Two edits. The width cap is the real finding; the inline min-width is a separate smaller bug fixed in passing.

1) src/styles/shell.css — add immediately after line 41 (`.page { max-width: 1360px; ... }`):

/* Dense, wide-table routes use more of a large screen. Text-led pages keep the
   1360px reading column. min() keeps this safe inside .frame.has-rail, where the
   page column is viewport - 76px. */
@media (min-width: 1440px) {
  .page.page-wide { max-width: min(1760px, 100%); }
}

2) src/shell/AppShell.tsx — the class must be applied by the shell, not the view. At module scope:

const WIDE_PAGES = new Set(["cases", "staff", "audit", "roles", "dataprotection"]);

then change line 114 from:

        <main className="page" id="main" tabIndex={-1}>

to:

        <main className={`page${WIDE_PAGES.has(page) ? " page-wide" : ""}`} id="main" tabIndex={-1}>

(`page` is already in scope — it is used on lines 114-116 for `key` and `activePage`. Verify each id in WIDE_PAGES against the route union before shipping; a wrong id is a silent no-op.)

3) src/views/staff/Cases.tsx:122 — stop the inline style from defeating `.tbl { min-width: 100% }` (src/styles/base.css:240). Change:

          <table className="tbl" style={{ minWidth: 1180 }}>

to:

          <table className="tbl" style={{ minWidth: "max(100%, 1180px)" }}>

This keeps 1180px as a floor for narrow containers (where .table-wrap's `overflow-x: auto` at base.css:239 scrolls it) while letting the table fill the panel at any container >= 1180px, including the new 1696px content box at >=1760px viewports. Apply the same change to the other inline table floors if the same dead-strip shows there: CaseWorkspace.tsx:386 (620), DataProtection.tsx:153 (760), DataProtection.tsx:393 (1040), DataProtection.tsx:497 (820), Roles.tsx:96 (820), Staff.tsx:93 (760).

### .audit-filters forces the date-range switch onto its own full-width row at every width

- **Where:** `src/styles/pages.css:306`
- **Selector:** `.audit-filters`
- **Severity:** high

**Problem.** `.audit-filters { display: flex; flex-direction: column; gap: 10px; }` is unconditional — there is no min-width counterpart. The SegmentedSwitch rendered at AuditExplorer.tsx:144 has five short options (24h / 7d / 30d / 90d / Custom) and measures roughly 300-340px, yet it owns a full 1276px row (1296 content minus .filter-bar's 10px padding, pages.css:163), leaving ~950px of dead space. The four real filters (search, person, event type, entity type) then start on a second row. When range === 'custom' (AuditExplorer.tsx:145-150) a third row of two date inputs stacks below that. On a laptop or desktop the filter bar is three stacked strips of mostly empty space — the single most phone-like thing on this page.

**Fix.** Add a min-width counterpart in src/styles/pages.css immediately after line 306 (the `.audit-filters` rule), leaving line 306 itself unchanged as the mobile/tablet default:

/* desktop: the range switch and the four filters share one row instead of stacking.
   680px basis = the cols-audit grid's min-content (200 + 3*150 + 3*10 gaps). */
@media (min-width: 1280px) {
  .audit-filters { flex-direction: row; flex-wrap: wrap; align-items: center; column-gap: 12px; }
  .audit-filters > .segmented { flex: 0 0 auto; }
  .audit-filters > .filters.cols-audit { flex: 1 1 680px; }
}

Three deliberate differences from the proposed fix:
- `align-items: center` is what actually removes the defect. It cancels the column container's default `align-items: stretch`, which is what was blockifying the `display: inline-flex` `.segmented` (components.css:117) and inflating it to the full 1276px row.
- `flex: 0 0 auto` on `.segmented` stops it shrinking and triggering its own `overflow-x: auto` internal scrollbar on a cramped line.
- `flex: 1 1 680px` (not 640px) matches the grid's real min-content at this breakpoint, so the line-break decision is exact. No `min-width: 0` on the grid item — its automatic min-content min size is what makes it wrap to a second row rather than shrink and overflow the filter bar, which matters in the `range === 'custom'` case.

### Staff gives a 130px donut a third of the page and squeezes an 8-column table into two thirds

- **Where:** `src/views/staff/Staff.tsx:66`
- **Selector:** `.grid.grid-3 > .span2 (table side) + sibling .panel (Donut/Legend, Staff.tsx:122)`
- **Severity:** high

**Problem.** The wrapper is `grid grid-3` (base.css:75, three equal minmax(0,1fr) columns, 14px gap) with the table half carrying `.span2` (base.css:77). At >=1280px the content column is 1296px, so each track is (1296 - 28) / 3 = 422.7px: the table gets 859.3px and the 'Active staff by role' panel gets 422.7px for a 130px donut plus a short legend. The staff table has 8 columns, declares minWidth: 760 inline (Staff.tsx:93), and its last cell is `className="right nowrap"` holding two full-label buttons ('Set temporary password' and 'Deactivate'/'Reactivate', Staff.tsx:108-111) — that cell alone is ~340px unwrappable. The table is therefore crammed (and likely scrolling inside .table-wrap) at 1920px while a donut with nothing else in it holds 423px of prime width. There is no >=1280px rule that rebalances this.

**Fix.** Two-line TSX change plus one scoped CSS block; behaviour below 1280px is byte-identical to today.

1) src/views/staff/Staff.tsx:66 — keep the `grid` class, swap `grid-3` for the named grid:
   FROM: <div className="grid grid-3 stagger">
   TO:   <div className="grid staff-grid stagger">

2) src/views/staff/Staff.tsx:67 — drop `span2`, name the column (the <=1279 span is handled in CSS):
   FROM: <div className="span2 stack">
   TO:   <div className="staff-main stack">

3) Append to src/styles/pages.css:

/* Staff — the accounts table carries eight columns and two nowrap cells; the role donut does
   not need a third of the page. Below 1280 the old two-column fallback is reproduced exactly. */
.staff-grid { grid-template-columns: minmax(0, 1fr) clamp(300px, 24%, 380px); align-items: start; }
.staff-grid > .staff-main { min-width: 0; }
@media (max-width: 1279px) {
  .staff-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .staff-grid > .staff-main { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .staff-grid { grid-template-columns: 1fr; }
  .staff-grid > .staff-main { grid-column: auto; }
}

Effect: at a 1296px content box the table column goes 859px -> 971px and the donut panel 423px -> 311px (capped at 380px if .page is later widened past ~1580px of content, so the panel never grows into dead space again). At 1024-1279px the table still gets the full row and the donut panel still sits below at half width, exactly as now; at <=640px it is a single column, as now. Optional follow-up, not part of this fix: the "Set temporary password" button label at Staff.tsx:109 is ~200px on its own and is the single largest consumer of the table's width.

### Journey stage accordions are 1296px rows holding ~30 characters, with the chevron 1000px away

- **Where:** `src/styles/pages.css:70`
- **Selector:** `.journey-stage summary (chevron pushed right by `.journey-stage summary .chev { margin-left: auto }` at line 76); rendered from src/views/student/JourneyPage.tsx:41-52`
- **Severity:** high

**Problem.** JourneyPage renders nine `<details className="journey-stage panel">` inside a plain `.stack-sm` with no desktop layout of any kind. Each summary is a flex row of a 32px icon, the stage name plus a '3 of 4 steps' sub-line, and a chevron shoved to the far right by margin-left:auto. Stage names are short ('Capture', 'Match', 'Visa', 'Offer management' — 4 to 19 characters), so at 1296px page width each of the nine rows has roughly 1000px of nothing between the label and the chevron. Nine of these stacked is the most phone-like screen in the student area.

**Fix.** Two edits.

1) src/views/student/JourneyPage.tsx line 41 -- give the wrapper its own hook:

  <div className="stack-sm journey-list">

(closing </div> at line 82 is unchanged.)

2) src/styles/pages.css -- append after line 78 (the `.journey-stage .j-steps` rule), inside the "journey (student)" block:

/* Nine collapsed stage rows are ~30 characters of content each; at the 1296px
   content column that leaves about 1000px of dead space per row. Above the
   codebase's existing 1279/1280 desktop boundary, pack them two-up. */
@media (min-width: 1280px) {
  .journey-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 16px;
    align-items: start;
  }
  /* The expanded stage carries the step list and any confirm form, so give it
     the whole row rather than leaving a tall hole beside its sibling.
     JourneyPage.tsx:45 force-opens the current stage, so this always applies. */
  .journey-list > .journey-stage[open] { grid-column: 1 / -1; }
}

Notes on why this is safe: `.journey-list` and `.stack-sm` have equal specificity (0,1,0) but pages.css is imported after base.css (src/main.tsx:17 then :20), so the grid wins. Below 1280px nothing changes -- the element stays the existing `.stack-sm` flex column, and every other journey-adjacent rule in the codebase is a max-width query, so no narrower breakpoint can regress. `minmax(0, 1fr)` supplies the min-width:0 that `base.css:401` grants to `.stack > *` but not to `.stack-sm > *`. `.form-grid` (base.css:188) stays 2-up inside a ~570-640px column, giving ~270-300px fields, which is acceptable.

### Journey step rows use space-between, stranding the title and its status at opposite page edges

- **Where:** `src/views/student/JourneyPage.tsx:61`
- **Selector:** `<div className="flex wrap aic jcb g2"> inside .j-step (pages.css:79)`
- **Severity:** high

**Problem.** `jcb` is `justify-content: space-between` (base.css:65). Inside an open stage, `.j-steps` has 18px side padding, so its content box is about 1204px at a 1296px page and the step body gets ~1172px after the 20px icon and 12px gap. The step title ('Your counsellor confirms your profile') sits hard left and its state ('Action needed', 'Under internal review', or a completion date) sits hard right, with roughly 1000px of blank space between them. Pairing a step with its status means scanning the full width of the screen — the behaviour is correct at 375px and meaningless at 1920px.

**Fix.** Append to src/styles/pages.css immediately after the `.j-step.locked` rule (line 85), no TSX change required:

/* Desktop: keep each step's status beside its title instead of flinging the two to opposite edges of a ~1228px row. */
@media (min-width: 1024px) {
  .j-step > .grow > div:first-child {
    display: grid;
    grid-template-columns: minmax(0, 360px) max-content;
    justify-content: start;
    align-items: baseline;
    column-gap: 20px;
  }
}

Why these values: the capped 360px first column (not 1fr) is what actually moves the status leftward — the longest studentTitle in src/lib/spine.ts is 34 chars, about 240px at --fs-sm: 13.5px, so 360px never wraps a title and the status rail sits about 380px from the step body's left edge instead of ~1010px. Because 360px is identical on every row, the status column's left edge aligns down the whole stage, which is the aligned rail the claim wanted. `justify-content: start` packs the two columns left so the leftover ~840px becomes trailing whitespace rather than an internal gap; do NOT add `text-align: right` to `.j-step .ui.xs.muted` — with the status now adjacent to the title, left alignment is correct. Specificity of `.j-step > .grow > div:first-child` is (0,3,1), which beats `.flex` (0,1,0) and `.aic`, so `display: grid` and `align-items: baseline` win; `column-gap` supersedes `.g2`'s 10px. The `@media (min-width: 1024px)` wrapper is the missing min-width counterpart to the existing max-width:1023px cluster and leaves the current flex/wrap behaviour untouched below 1024px, where space-between is still correct. If you prefer an explicit hook over the positional `div:first-child`, add `className="j-step-head flex wrap aic jcb g2"` at JourneyPage.tsx:61 and target `.j-step-head` inside the same media query.

### align-items: start plus the main/side content split leaves ~800px of dead side column on AdminHome

- **Where:** `src/views/home/AdminHome.tsx:76`
- **Selector:** `div.home-side (children: ComplianceStrip section, Panel 'System', Panel 'Recent activity')`
- **Severity:** medium

**Problem.** .home sets align-items: start (pages.css:181), so the two columns do not equalise height. AdminHome puts three tall blocks in .home-main (StageFlow panel, CounsellorLoad list over every active counsellor, PerformanceSection) and three short ones in .home-side (a 3-stat compact strip ~110px, a 5-row SystemHealth dl ~220px, an 8-row MovementFeed ~350px). The main column runs roughly twice the height of the side column, so the bottom-right of a 1920x1080 screen is a large empty rectangle next to the Performance section. TeamLeaderHome.tsx:87 and CounsellorHome.tsx:55 have the same imbalance (side = StageFlow + one feed, main = queue + exposure + Performance).

**Fix.** Do NOT touch align-items: start (proven a no-op). Fix the content distribution instead: give the 808px Performance block its own full-width row so the two stacks balance and the charts get the desktop width.

1) src/styles/pages.css - add one rule after line 182 (leave lines 181/182/186 exactly as they are):

/* Performance carries a 3-column .perf-grid; inside the 7fr column its cells are only
   233px at 1920 while 533x729px of the side column sits empty. Lifted to its own
   full-width row, cells become 402px and the dead area drops to 95px. Harmless in the
   single-column layout below 1024px. */
.home > .perf { grid-column: 1 / -1; min-width: 0; }

2) src/views/home/AdminHome.tsx - move the existing line 74 <PerformanceSection ... /> out of <div className="home-main"> so it becomes a direct child of <div className="home">, placed after the closing </div> of .home-side. No prop changes: PerformanceSection's root is already <section className="perf surface"> (PerformanceSection.tsx:33), so .home > .perf matches it. Result:

      <div className="home">
        <div className="home-main">
          <Panel title="Open cases by stage"> ... </Panel>
          <Panel title="Counsellor load"> ... </Panel>
        </div>
        <div className="home-side">
          ...unchanged...
        </div>
        <PerformanceSection cases={allCases} config={config} canRead={can("analytics.read")} canDownload={can("analytics.download")} onExport={() => { downloadText("lpl-overview.csv", overviewCsv(all)); void audit(EVENTS.overviewExported()); }} scope="team" />
      </div>

3) src/views/home/TeamLeaderHome.tsx - apply the identical move to its PerformanceSection at line 90 (out of .home-main, to a direct child of .home after .home-side).

4) Do NOT apply this to CounsellorHome.tsx. Its Performance is collapsed by default (scope="mine") and its main column is the SHORT one (260 vs 711) - lifting an already-tiny block would leave the 451px gap untouched. Treat that file as a separate finding.

Narrow-width safety: below 1024px .home is grid-template-columns: 1fr (pages.css:186), where grid-column: 1 / -1 resolves to the single column and changes nothing structurally. The only side effect is DOM order on mobile - Performance moves from third to last - which matches its own docstring ("Below the fold, collapsible"). Nothing above 1024px regresses, since the rule only ever widens a block that was previously capped at 747px.

### ComplianceStrip renders 3 stat tiles at ~174px each inside the 533px side column

- **Where:** `src/styles/components.css:79`
- **Selector:** `.stat-strip { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 4px; gap: 2px; } — instantiated by ComplianceStrip.tsx:26 inside AdminHome.tsx:77`
- **Severity:** medium

**Problem.** grid-auto-flow: column forces all 3 compliance stats onto one row whatever the container width. Inside .home-side (533.347px at 1920) each tile is (533 - 8 padding - 4 gap)/3 = ~174px, and .stat-strip.compact .stat adds 12px 14px padding (pages.css:184) leaving ~146px of text. Labels like 'Transfers without a safeguard' and subs like 'N of M profiled cases' wrap to two or three lines. Meanwhile the top-level StatStrip on the same page (AdminHome.tsx:65) gets 320px per tile. So the desktop view shows the most cramped tiles on the page directly beside the most stretched ones. The only .stat-strip breakpoint is max-width:1023px (components.css:98), which does not help here.

**Fix.** Add to src/styles/pages.css immediately after line 185 (the existing .stat-strip.compact rules), scoped behind a min-width query so it cannot touch any of the existing max-width clusters:

/* The compliance strip is the only stat strip that lives inside the 5fr side column.
   components.css:79 forces grid-auto-flow: column, so its three tiles get
   (533 - 12) / 3 = 174px at 1920 and ~127px at 1024, and the labels wrap to 2-3 lines.
   Every .stat-strip breakpoint is max-width: 1023px, so none of them fire here. */
@media (min-width: 1024px) {
  .home-side .stat-strip {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
  /* a lone tile on the last row fills the width instead of leaving a dead half-cell */
  .home-side .stat-strip .stat:last-child:nth-child(odd) { grid-column: 1 / -1; }
  /* components.css:81 draws the divider as a vertical hairline on the tile's left
     edge; that is wrong the moment tiles stack, so drop it here */
  .home-side .stat + .stat::before { display: none; }
}

Resulting widths: at 1024-1279px the side column is 393-500px, so auto-fit gives one full-width tile per row (~385px, label on one line); at >=1280px it gives two tiles of ~245-262px (text box 217-234px, enough for the 210px "Transfers without a safeguard" label) with the third spanning the full 525px. The min-width: 1024px wrapper means the 1023px / 639px / 359px rules in components.css:98-100 are untouched, so no narrower breakpoint regresses.

### Stat tiles stretch to ~320px but keep phone-scale type and a vertical-only layout

- **Where:** `src/styles/components.css:80`
- **Selector:** `.stat { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; } with .stat-value { font: 600 30px/1 var(--ui); } at components.css:93`
- **Severity:** medium

**Problem.** All four staff homes render a 4-stat StatStrip across the full 1296px content column (AdminHome.tsx:65, TeamLeaderHome.tsx:49, CounsellorHome.tsx:47), so each tile is ~320px wide. The tile content is a 12.5px label, a 30px number and a 12px sub, always stacked in a column, with fixed 14px/18px padding. The result is a ~90px-tall stack of small text floating in a 320px-wide box: the exact 'phone card stretched wide' shape the user is complaining about. There is no min-width rule anywhere; the only size steps are downward at max-width:1023px, 639px and 359px (components.css:98-100).

**Fix.** Append to src/styles/components.css immediately after line 100 (the end of the existing stat-strip media cluster), so it is the first and only >=1280px step for the component:

/* the strip owns the full 1296px column on every staff home; step it up so a 320px
   tile is not a phone card with 150px of dead space to its right */
@media (min-width: 1440px) {
  .stat-strip:not(.compact) .stat { padding: 18px 22px; gap: 6px; }
  .stat-strip:not(.compact) .stat + .stat::before { top: 18px; bottom: 18px; }
  .stat-strip:not(.compact) .stat.hued::after { left: 22px; }
  .stat-strip:not(.compact) .stat-label { font-size: 13.5px; }
  .stat-strip:not(.compact) .stat-value { font-size: 36px; }
  .stat-strip:not(.compact) .stat-delta,
  .stat-strip:not(.compact) .stat-sub { font-size: 12.5px; }
}

Notes on why this exact form:
- `:not(.compact)` keeps ComplianceStrip (ComplianceStrip.tsx:26) at its current size inside the ~533px .home-side column, where 13.5px labels on ~175px tiles would wrap. pages.css:184-185 only covers padding and .stat-value, not .stat-label/.stat-sub, so the guard must be explicit here.
- The `top/bottom: 18px` and `left: 22px` lines re-sync the `.stat + .stat::before` divider (components.css:81) and the `.stat.hued::after` accent bar (components.css:88) with the new 18px/22px padding; the claim's fix omitted both and would have left them visibly off.
- Overriding `font-size` on `.stat-value` is safe: the `font:` shorthand at :93 already set line-height to unitless 1, which is preserved, so the value scales cleanly to 36px.
- Do NOT restructure `.stat` into a two-column grid as the claim's alternative suggests; `.stat.hued::after` is absolutely positioned against the tile and `.stat-label` is a flex row containing `.stat-icon`, so that variant needs markup changes in src/lib/ui/stats.tsx:55-58 and is not a CSS-only fix.

### StudentHome 'Key details' uses .form-grid, which is capped at 2 columns at every width

- **Where:** `src/views/home/StudentHome.tsx:50`
- **Selector:** `<dl className="form-grid"> rendering the `facts` array — styled by .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } at base.css:188`
- **Severity:** medium

**Problem.** .form-grid is a form layout (two columns, only breakpoint is max-width:640px at base.css:189) being reused for a read-only list of short label/value pairs — 'Commencement', 'Travel date', 'Offer lapse date', 'Visa'. Inside .home-main at 1920 the panel body is ~707px, so the dl renders two ~346px columns each holding a 12.5px dt and a 13.5px dd of about 20-30 characters. Most of the 346px is trailing whitespace, and up to 7 facts queue vertically in two columns when four across would fit. The codebase already has the right pattern for this shape one file over: .audit-kv uses repeat(auto-fill, minmax(200px, 1fr)) at pages.css:319.

**Fix.** Two edits.

1) src/styles/pages.css — insert immediately after line 182 (`.home-main, .home-side { ... }`), keeping it in the "v5 home dashboards" block:

.home-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 12px 20px; margin: 0; }
.home-facts dd { overflow-wrap: anywhere; }

2) src/views/home/StudentHome.tsx:50 — swap the class only, leaving the dt/dd utility classes and the inline dd margin alone:

  <dl className="home-facts">{facts.map((f) => <div key={f.label}><dt className="ui xs muted">{f.label}</dt><dd className="ui small" style={{ margin: 0 }}>{f.value}</dd></div>)}</dl>

Rationale for each declaration:
- `repeat(auto-fill, minmax(min(220px, 100%), 1fr))` yields 3 tracks in the ~705px .home-main body at 1920 (3x220 + 2x20 = 700 <= 705) and more if the student home column is ever widened, while the `min(..., 100%)` guard keeps a single track from overflowing a container narrower than 220px. Do not copy `.audit-kv`'s bare `minmax(200px, 1fr)` (pages.css:319) — it carries that latent overflow bug.
- `gap: 12px 20px` — the 20px column gap is what the 3-track arithmetic above assumes; 12px row gap is tighter than .form-grid's 14px because these rows are two short lines, not 44px-tall inputs.
- `margin: 0` — the element is a <dl> and there is no `dl` margin reset in src/styles, so it otherwise carries the UA `margin-block: 1em` inside .panel-b.
- `overflow-wrap: anywhere` on dd — mirrors pages.css:321; needed because the `${s21.values.reference}` fact (StudentHome.tsx:28) can be a long unbroken reference string that would overflow a ~222px track.

No dt/dd font rules are needed: the TSX already applies `.ui .xs .muted` and `.ui .small`, which resolve to the same 12.5px/13.5px the claim describes. Leave .form-grid at base.css:188-189 untouched — it is still correct for the eight genuine form call sites (Auth.tsx:126, CaseWorkspace.tsx:295, Cases.tsx:305, PromptEngineer.tsx:260/285, Staff.tsx:201, StepPanel.tsx:162/174, JourneyPage.tsx:68, ProfilePage.tsx:47/51).

### Student hero text runs to ~1038px line length and the 'Coming next' box stretches under it

- **Where:** `src/styles/pages.css:148`
- **Selector:** `.hero { display: grid; grid-template-columns: 180px 1fr; gap: 26px; } inside .hero-card (pages.css:263), rendered by StudentSections.tsx:24-38 and mounted full-width at StudentHome.tsx:41`
- **Severity:** medium

**Problem.** <StudentHero> sits outside .home, so .hero-card spans the whole 1296px content column. With a 180px ring column, 26px gap and 24px 26px card padding, .hero-txt gets ~1038px. The paragraph at StudentSections.tsx:30 (step studentTitle plus ' — this one needs you.') and the .next-box at StudentSections.tsx:36 both stretch across that full 1038px for one or two lines of text — a measure of roughly 140 characters at 14.5px, far past a readable line and visibly a phone block inflated to laptop width. .next-box (pages.css:152) is a 14px 16px bordered box holding two short lines and is the most obvious offender. The only .hero breakpoints are max-width:640px (pages.css:149) and 767px (pages.css:158).

**Fix.** Append to src/styles/pages.css immediately after the existing `@media (max-width: 1023px)` block that ends at line 160 (must come after line 150 so it overrides `.hero .hero-txt { display: flex }`):

/* The student hero card is the only full-width block on this page, so at laptop width its
   text column is ~1038px holding strings of 35 characters. Sit "Coming next" beside the
   status text instead of stacking it underneath. .next-box lives inside .hero-txt
   (StudentSections.tsx:36), so the second column is declared on .hero-txt, not on .hero.
   The `auto` track collapses to zero when nextStep is undefined on the final step. */
@media (min-width: 1280px) {
  .hero { grid-template-columns: 180px minmax(0, 1fr); }
  .hero .hero-txt {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    row-gap: 8px;
    column-gap: 0;
  }
  .hero .hero-txt > * { grid-column: 1; }
  .hero .hero-txt > .next-box {
    grid-column: 2;
    grid-row: 1 / span 4;
    align-self: center;
    width: 340px;
    margin-left: 26px;
  }
}

Notes on why each value is safe:
- `grid-row: 1 / span 4` is used rather than `1 / -1` because there are no explicit rows, so `-1` would resolve to the end of the explicit grid (row 1) and the box would span only one row. The four preceding children of .hero-txt (StudentSections.tsx:28, 29, 30, 31) are unconditional, so `span 4` is deterministic.
- `.hero .hero-txt > .next-box` is specificity 0-3-0 versus 0-2-0 for `.hero .hero-txt > *`, so column 2 wins regardless of source order.
- `column-gap: 0` plus `margin-left: 26px` on the box means the gap disappears along with the collapsed track when there is no next step, rather than leaving a stray 26px.
- At the 1280px low end: content 1280 − 64 = 1216, card inner 1164, hero text column 958; the box takes 340 + 26, leaving 592px for the prose. Comfortable, no overflow.
- `minmax(0, 1fr)` replaces the bare `1fr` on .hero purely as overflow protection for long university names; it changes nothing below 1280px because the rule is inside the media query.
- Do NOT add the claim's `max-width: 68ch` on the paragraph — no rendered string approaches that length, so it would be dead CSS.

### Audit rows stretch one summary line to ~600px while five fields stay hidden behind a click

- **Where:** `src/styles/pages.css:311`
- **Selector:** `.audit-row-btn`
- **Severity:** medium

**Problem.** `grid-template-columns: 150px minmax(160px, 1fr) minmax(0, 2fr) auto 18px` with a 12px gap. At the 1296px content width the row's inner track is 1264px; after the 150px timestamp, the 18px chevron, four 12px gaps and the ~150px chips, the remaining 898px splits 1fr/2fr, giving the summary column ~599px for a single line of 13.5px text. Meanwhile Event, Target, Detail, Source and Session are all collapsed into the .audit-kv detail panel (AuditExplorer.tsx:191-197) and need a click each. The rule has no min-width counterpart — its only media queries are max-width 1023 and 639 (pages.css:328-329) — so the wide-screen answer is 'make one line longer' rather than 'show another field'.

**Fix.** Surface `detail` (not `target`) as a real sixth column, gated at 1280px (not 1440px).

1. src/styles/pages.css — add beside .audit-what (after line 314):

.audit-extra { display: none; }

2. src/styles/pages.css — add immediately after line 329, as the min-width counterpart the audit rules lack:

/* 1280px is where the five-track row reaches its full 1264px inner width: .page caps at
   1360px with 32px gutters (shell.css:41), so the row never gets wider than this. Above it
   the 2fr summary track sits ~40% empty, so spend the space on a field instead of a
   longer line. `detail` is used because `target` repeats the entityLabel already shown in
   .audit-chips (src/lib/audit.ts:71, 111, 144, 148, 149). */
@media (min-width: 1280px) {
  .audit-row-btn { grid-template-columns: 150px minmax(160px, 1fr) minmax(0, 3fr) minmax(0, 2fr) auto 18px; }
  .audit-extra { display: block; min-width: 0; }
}

3. src/views/staff/AuditExplorer.tsx — insert between the closing </span> of .audit-what (line 182) and the opening <span className="audit-chips"> (line 183):

                        <span className="audit-extra ui xs muted truncate">{e.detail ?? ""}</span>

Render it unconditionally with the "" fallback (not `{e.detail && ...}`) so every row keeps six tracks and the columns stay aligned down the list. `.truncate` already exists at src/styles/base.css:59. Net effect at 1280px+: summary ~539px instead of ~599px, detail ~359px, and one of the five buried fields is visible without a click. If the 1360px .page cap is raised as part of the wider desktop fix, this column widens for free.

### Case header side column capped at 280px forces its buttons to wrap while 800px of header sits empty

- **Where:** `src/styles/pages.css:292`
- **Selector:** `.case-head-grid { grid-template-columns: auto minmax(0, 1fr) minmax(220px, 280px) } with .case-head-side (line 298); rendered at src/views/CaseWorkspace.tsx:175-212`
- **Severity:** medium

**Problem.** At a 1296px page the header's inner width is 1252px (.case-head padding 20px 22px, line 291). The 116px Ring, two 20px gaps and the 280px-capped side column leave an 816px middle column that only carries a name, a one-line ref/date/destination string, two contact links and a one-line 'Stage n of 9' — mostly whitespace. Meanwhile the side column is capped at 280px (256px inside its 12px padding, line 298) and has to hold Hold + Defer + Exit + Export, roughly 340px of btn-sm buttons, so they wrap onto two rows; the .case-owner row above squeezes a 30px Avatar, the counsellor name and a 'Reassign' button into the same 256px, leaving ~130px for the name so `.truncate` (CaseWorkspace.tsx:196) clips it. The cap never relaxes — the widest rule touching .case-head-grid is the max-width:1023px one on line 301.

**Fix.** Add a min-width counterpart immediately after the existing max-width rules in src/styles/pages.css (insert after line 302, keeping lines 292/301/302 unchanged so the 1024-1279px band and the phone layouts are untouched):

/* Desktop counterpart to the max-width cluster above. From 1280px up the page is
   already pinned at its 1296px content column, so the header's middle column runs
   to ~814px of mostly-empty space while the side column is still capped at 280px
   (254px inside its 12px padding and 1px border) -- too narrow for the ~359px of
   btn-sm actions (Hold/Defer/Exit/Export), which wrap to two rows, and too narrow
   for .case-owner, which leaves ~118px for the counsellor name so .truncate clips
   it. Move the spare width from the middle column into the side column. */
@media (min-width: 1280px) {
  .case-head-grid {
    grid-template-columns: auto minmax(0, 1fr) minmax(320px, 420px);
    gap: 24px;
  }
}

Why these exact values: at a 1280px viewport the header's inner width is ~1170px, so the middle column becomes 1170 - 116 (Ring) - 48 (two 24px gaps) - 420 = ~586px, still ample for the name, meta line and stage line; at 1440px and above the inner width is ~1250px and the middle column settles at ~658px. The 420px maximum gives .case-head-side a 394px content box, which clears the ~359px of buttons with margin to spare so the four actions sit on one row, and leaves ~284px for the .case-owner name instead of ~118px, so CaseWorkspace.tsx:196 stops truncating. The 320px minimum only matters if the panel is ever placed in a narrower container.

Do NOT use the claim's alternative of `grid-template-columns: auto minmax(0, 1fr) max-content`. That rule is unscoped, so it would also apply between 1024px and 1279px where the header inner width is as little as ~924px; the ~370px max-content side column would crush the middle column to ~398px and force the student name and meta line to wrap badly at exactly the laptop widths this work is meant to improve.

### Student hero stretches a one-line 'Coming next' box across ~1040px

- **Where:** `src/styles/pages.css:148`
- **Selector:** `.hero { grid-template-columns: 180px 1fr } with .next-box (line 152) and .hero-card (line 263); rendered at src/views/home/sections/StudentSections.tsx:25-37`
- **Severity:** medium

**Problem.** .hero-card is a full-width panel in the 1296px page, so with a 180px ring column and a 26px gap the .hero-txt column is about 1038px. It contains a small uppercase label, a 24px h2, one sentence of `.ink2` text at a ~1038px line length, a pill row, and .next-box — which has no max-width at all, so a 14px 'Coming next' heading plus one short line renders inside a 1038px bordered box. The only breakpoints on .hero are max-width:640px (line 149) and max-width:1023px (line 158); nothing above 1024px.

**Fix.** Do NOT touch src/views/home/sections/StudentSections.tsx — leave .next-box inside .hero-txt. Achieve the third column purely in CSS by making .hero-txt itself a two-column grid above 1280px, so no existing breakpoint (640px, 1023px) is affected at all. Append to src/styles/pages.css immediately after line 159 (after the existing `@media (max-width: 1023px)` block):

/* Desktop: the "Coming next" box sits beside the hero copy instead of
   stretching a two-line panel across the full 1038px text column. */
@media (min-width: 1280px) {
  .hero-txt {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
    column-gap: 24px;
    row-gap: 8px;
    align-content: start;
  }
  .hero-txt > *:not(.next-box) { grid-column: 1; }
  .hero-txt > .next-box { grid-column: 2; grid-row: 1 / span 4; align-self: start; }
  .hero-txt > p { max-width: 72ch; }
}

Notes on why this exact form: (1) `.hero-txt > *:not(.next-box) { grid-column: 1 }` is required — without it the four always-rendered children (p.ui.xs.muted, h2, p.ink2, div.flex.wrap.g1 at StudentSections.tsx:28-35) would auto-flow into column 2 on rows 2-4. (2) `grid-row: 1 / span 4` rather than `1 / -1`: the grid has no explicit rows, so `-1` resolves to the end of the *explicit* grid (row 1) and the box would inflate row 1, pushing the h2 down; `span 4` matches the four fixed siblings and `align-self: start` pins it to the top. (3) `row-gap: 8px` preserves the current flex `gap: 8px`. (4) `max-width: 72ch` matches the existing prose cap already used at base.css:103 (`.page-head p`). (5) Leave `.hero { align-items: center }` and the `180px` ring column alone — the Ring is `size={176}` (StudentSections.tsx:26), so widening that column only adds dead space, and centering still reads correctly once the text block is shorter.

### Student Documents page stacks two panels that fit side by side, each with ~900px-wide empty rows

- **Where:** `src/views/student/DocumentsPage.tsx:29`
- **Selector:** `<div className="stack"> wrapping the two section(10, ...) and section(15, ...) Panels`
- **Severity:** medium

**Problem.** Both 'University application documents' and 'Visa file documents' render as full-width stacked Panels in the 1296px page, so the second is entirely below the fold on a laptop. Because DocumentChecklist is passed `compact` here (line 23), each .doc-row (pages.css:95) is just a label plus a status Pill split to the two edges by `justify-content: space-between`, so a row like 'Passport bio page ............ Not uploaded' has ~900px of empty space in the middle. The page is a phone checklist at desktop scale.

**Fix.** TSX — src/views/student/DocumentsPage.tsx, wrap lines 31-32 only (leave PageHeader as a direct child of .stack so its 18px gap is preserved):

  return (
    <div className="stack">
      <PageHeader title="Documents" context="Everything you upload is reviewed by your counsellor. Accepted documents are shared with universities and visa authorities as required." />
      <div className="doc-columns">
        {section(10, d10, "University application documents", "Required for your applications.", "Your counsellor will open this list once your programme and destination are confirmed and the document checklist has been issued.")}
        {section(15, d15, "Visa file documents", "Required for financial verification and your visa file.", "Your counsellor will open this list once an offer has been received.")}
      </div>
    </div>
  );

CSS — src/styles/pages.css, append to the `/* documents */` block immediately after line 100 (`.doc-row.over { ... }`):

/* the two checklists sit side by side once the page is wide enough */
.doc-columns { display: grid; gap: 18px; }
.doc-columns > * { min-width: 0; }
@media (min-width: 1280px) {
  .doc-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}

Notes on the deltas from the proposed fix: (a) `.doc-columns > * { min-width: 0; }` mirrors the existing guard at base.css:401 (`.grid > *, .stack > *, .workspace > *, .pe-layout > * { min-width: 0; }`), which does NOT reach these Panels once they are nested one level deeper inside .doc-columns; `minmax(0, 1fr)` bounds the track but this also stops any long unbroken filename in the compact row (Documents.tsx:124) from forcing a track wider than its share. Alternatively add `.doc-columns > *` to the base.css:401 selector list instead of the standalone rule. (b) The 18px gap deliberately matches `.stack`'s gap (base.css:71) so vertical and horizontal rhythm stay identical below and above the breakpoint. (c) Keep the base `display: grid` outside the media query so the single-column stacking below 1280px is grid-driven and the gap stays consistent rather than switching layout modes at the breakpoint.

### Timeline rows give a one-line event a ~910px column and stack its metadata beneath

- **Where:** `src/styles/pages.css:56`
- **Selector:** `.tl-item { grid-template-columns: 22px 1fr } with .tl-body .who (line 66); rendered at src/views/CaseWorkspace.tsx:278-286`
- **Severity:** medium

**Problem.** In the workspace Timeline tab the text column is about 910px. Each entry prints a single short line ('Step 4 recorded') across that full width and then drops the '16 Sep 2026, 10:04 · Nimal Perera · step 4' metadata onto a second line beneath it, doubling the row height for no reason. On a desktop the timestamp and actor belong in a right-hand column; the stacked form only earns its place on a phone. Note the same component is reused in a narrow side panel on StudentHome.tsx:69, so the rule must be scoped.

**Fix.** Append to src/styles/pages.css immediately after line 66 (the `.tl-body .who` rule). No TSX change — do NOT move the `.who` paragraph out of `.tl-body`, because `.tl-item`'s base `grid-template-columns: 22px 1fr` would auto-place it into the 22px dot column at every narrower width. Making `.tl-body` itself the two-column grid keeps the existing DOM intact and keeps the fix entirely inside a min-width query.

/* desktop: put the event metadata beside the event text instead of under it.
   Scoped to .workspace so the narrow "Recent updates" panel on the student home
   (src/views/home/StudentHome.tsx:69) keeps the stacked form. */
@media (min-width: 1280px) {
  .workspace .tl-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    column-gap: 20px;
  }
  .workspace .tl-body .who {
    text-align: right;
    white-space: nowrap;
  }
}

Why these values: `minmax(0, 1fr)` lets a long event line wrap normally instead of forcing overflow; `auto` sizes the metadata column to its own content rather than pinning a fixed 280px, so it never starves the text column; `align-items: baseline` lines the metadata up with the first line of the event text; `white-space: nowrap` keeps the timestamp/actor/step on one line. The 1280px gate (not 1024px) is required because at 1024px with the counsellor rail present (shell.css:133, 76px rail) the `.tl-body` box is only about 280px wide. At 1280px the same box is ~720px with the rail and ~800px without, leaving 450px+ for the text after the metadata column. Below 1280px nothing changes, so the phone, tablet and rail layouts are untouched.

### Stat tiles: 30px numerals and 18px padding in tiles that become ~300px wide on desktop

- **Where:** `src/styles/components.css:93`
- **Selector:** `.stat-value (font: 600 30px/1) and .stat (padding: 14px 18px, components.css:80)`
- **Severity:** medium

**Problem.** .stat-strip (components.css:79) is grid-auto-flow: column with 1fr columns, so at 1920px a four-tile strip gives each .stat roughly 300-320px of width, filled by a 30px number, a 12.5px label (.stat-label, components.css:85) and 14px/18px padding. Every media query on this component (components.css:98, 99, 100) only reduces size. The result is a wide strip of mostly empty tile with small phone-scale contents — one of the most visible 'made for a phone' surfaces on the home page.

**Fix.** Append to src/styles/components.css immediately after line 100 (the end of the max-width cluster). Media conditions are disjoint from the 1023/639/359 rules, so nothing narrower is affected, and :not(.compact) keeps the .home-side ComplianceStrip on its existing smaller scale:

/* ---------- stat strip: desktop scale ---------- */
/* .page caps at 1360px (shell.css), so the strip's content box stops at 1296px and each of
   the four tiles plateaus at ~320px from ~1377px up. The type and padding below are fixed px
   and never grow. Scoped to :not(.compact) so the 3-tile sidebar strip (ComplianceStrip in
   .home-side, ~173px tiles, pages.css:184) keeps its smaller scale — pages.css overrides only
   .stat padding and .stat-value there, not .stat-label. */
@media (min-width: 1280px) {
  .stat-strip:not(.compact) .stat { padding: 18px 22px; }
  .stat-strip:not(.compact) .stat-value { font-size: 36px; }
  .stat-strip:not(.compact) .stat-label { font-size: 13.5px; }
  .stat-strip:not(.compact) .stat-delta,
  .stat-strip:not(.compact) .stat-sub { font-size: 12.5px; }
  /* keep the offsets hardcoded at lines 81 and 88 in step with the new padding */
  .stat-strip:not(.compact) .stat + .stat::before { top: 18px; bottom: 18px; }
  .stat-strip:not(.compact) .stat.hued::after { left: 22px; }
}

Notes on why this form: overriding only font-size on .stat-value is safe because line 93 sets it via the `font:` shorthand, so weight, line-height 1 and var(--ui) survive — the same technique line 99 already relies on. Specificity of .stat-strip:not(.compact) .stat-value is (0,3,0), equal to pages.css's .stat-strip.compact .stat-value, but the two never match the same element, so there is no cascade conflict regardless of import order (pages.css loads last, main.tsx:20). Do not use the unscoped clamp() variant from the proposal: a viewport-based clamp keeps growing past 1377px while the tile width does not, since .page is capped.

### Case header and student hero headings/padding are fixed px and never scale up

- **Where:** `src/styles/pages.css:293`
- **Selector:** `.case-head-id h1 { font-size: 24px } (line 293), .hero h2 { font-size: 24px } (line 151), .case-head { padding: 20px 22px } (line 291), .hero-card { padding: 24px 26px } (line 263)`
- **Severity:** low

**Problem.** The student's name is the title of a 1296px-wide header and it renders at 24px — the same size as an h2 inside a card, and identical at 1366, 1920 and 2560px. The header's 22px horizontal padding is barely more than the 16px it drops to on phones (line 302), so at desktop width the panel reads as a phone card that was widened rather than a desktop page header. Nothing in the file scales type or padding above 1024px; the hero's 24px h2 has the same problem inside a 1038px text column.

**Fix.** Leave lines 151, 263, 291 and 293 exactly as they are (zero risk to every existing max-width breakpoint) and APPEND this purely additive block to the end of src/styles/pages.css:

/* ---------- desktop type + padding scale-up (no min-width breakpoint existed above 1024px) ---------- */
@media (min-width: 1280px) {
  .case-head { padding: 26px 30px; }
  .case-head-id h1 { font-size: 28px; }
  .hero-card { padding: 30px 34px; }
  .hero h2 { font-size: 26px; }
}

@media (min-width: 1680px) {
  .case-head { padding: 30px 36px; }
  .case-head-id h1 { font-size: 32px; }
  .hero-card { padding: 34px 40px; }
  .hero h2 { font-size: 28px; }
}

Why this shape rather than the proposed clamps:
- Two tiers (1280 and 1680) mean a 1366px laptop, a 1920px monitor and a 2560px display genuinely differ. The proposed `clamp(24px, 1.1vw + 16px, 30px)` hits its 30px ceiling at a 1273px viewport, so all three sizes would render identically — it does not fix the reported symptom.
- 28px at 1280 and 32px at 1680 for `.case-head-id h1` clear the global `h1 { font-size: 26px; }` (base.css:27) and land on `--t-display: 32px` (tokens.css:99) at the top end, so the case-workspace title finally outranks a generic h1 and matches the home greeting instead of sitting 8px under it.
- `.hero h2` gets a deliberately smaller range (26/28) than the h1 (28/32). Giving both the same clamp, as proposed, would keep an h2 inside a card tied with the page-header h1 — preserving the hierarchy bug rather than fixing it.
- min-width blocks touch nothing below 1280px, so `@media (max-width: 639px) { .case-head { padding: 16px; } }` at line 302, the 1023px `.case-head-grid` collapse at line 301, and the 640px `.hero` stack at line 149 are all provably unaffected regardless of source order. Appending at end of file also guarantees the desktop values win on specificity-tied rules.

Optional, if the parent also wants the `.case-head-id h1` baseline inconsistency fixed at all widths (slightly larger blast radius — changes tablet and phone by 2px, but only to match the global h1 that every other page already uses), additionally change line 293 from `font-size: 24px` to `font-size: 26px`.

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The counsellor's student rail. Always minimised to a slim strip on the left edge: one
 * progress ring per assigned student. Pressing the launcher (or any ring) slides the full
 * quick view open from the left — every student with their percentage, stage and step.
 * On phones the same list opens as a bottom sheet from the Students tab.
 *
 * The list is read from the server a page at a time, worst first (severity, then most recently
 * updated); the summary figures come from the dashboard over the counsellor's own cases, and a
 * student's quick view fetches their case document when it is expanded.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useSession } from "@/App";
import { caseScopeOf } from "@/lib/rbac";
import { SEARCH_MIN, useDebounced, useLocalPref } from "@/lib/hooks";
import { useRowSignals, type CaseSignals } from "@/lib/signals";
import { useCase, useCaseCount, useCasePage, useDashboard } from "@/lib/useRead";
import { EmptyState, EXIT_MS, Layer, leavingAttrs, ListSkeleton, PageFooter, ReadError, Tooltip, useFocusTrap, useLastOpen, usePresence } from "@/lib/ui";
import type { OrgConfig, User } from "@/lib/types";
import { ProgressAvatar, RailRow, stepLine } from "./RailRow";
import { useFlip } from "@/lib/motion";
import { StudentPreview } from "./StudentPreview";
import { hasUnseen, markSeen, useSeen } from "./seen";

export type RailMode = "strip" | "sheet";

export function railEnabled(config: OrgConfig, user: User | null): boolean {
  return !!user && user.role !== "student" && caseScopeOf(config, user.role) === "assigned";
}

type GroupId = "attention" | "progress" | "held" | "closed";
const GROUPS: { id: GroupId; label: string; defaultOpen: boolean }[] = [
  { id: "attention", label: "Needs attention", defaultOpen: true },
  { id: "progress", label: "In progress", defaultOpen: true },
  { id: "held", label: "On hold · deferred", defaultOpen: false },
  { id: "closed", label: "Completed · exited", defaultOpen: false },
];
function groupOf(s: CaseSignals): GroupId {
  if (s.status === "hold" || s.status === "deferred") return "held";
  if (s.status !== "open") return "closed";
  return s.severity === "none" ? "progress" : "attention";
}

const STRIP_MAX = 12;

export interface StudentRailProps {
  mode: RailMode;
  /** Whether the quick-view panel (or sheet) is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentRail({ mode, open, onOpenChange }: StudentRailProps) {
  const { user, cases, go } = useSession();
  const seen = useSeen(user?.id);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useLocalPref<Record<GroupId, boolean>>("lpl:pms:rail-groups", { attention: true, progress: true, held: false, closed: false });
  const launcherRef = useRef<HTMLButtonElement>(null);

  const dash = useDashboard(!!user);
  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= SEARCH_MIN;
  const page = useCasePage(user ? { sort: "severity", ...(searching ? { q: term } : {}) } : null);
  const signals = useRowSignals(page.rows);
  const rows = useMemo(() => page.rows.map((r) => signals.get(r.id)).filter((x): x is CaseSignals => !!x), [page.rows, signals]);
  const assigned = searching ? [] : rows;
  const mine = rows;
  const flagged = useCaseCount(user ? { status: ["open"], attention: true } : null, 1000);
  const total = dash.data?.total ?? rows.length;
  const activeCount = dash.data?.open.total ?? rows.filter((x) => x.status === "open").length;
  const attentionCount = flagged.data ?? 0;
  const avg = dash.data?.open.progressPct ?? 0;
  const detail = useCase(expanded ?? undefined, cases);

  const openCase = useCallback((s: CaseSignals, extra: { step?: number; tab?: string } = {}) => {
    if (user) markSeen(user.id, s.id, s.updatedAt);
    onOpenChange(false);
    go({ page: "case", caseId: s.id, ...extra });
  }, [go, onOpenChange, user]);

  /** Opens the panel, optionally with one student's quick view already expanded. */
  const reveal = useCallback((id?: string) => {
    if (id) {
      const s = signals.get(id);
      if (s) setOpenGroups((o) => ({ ...o, [groupOf(s)]: true }));
      setExpanded(id);
      setQ("");
    }
    onOpenChange(true);
  }, [onOpenChange, setOpenGroups, signals]);

  useEffect(() => {
    if (!open || !expanded) return;
    const t = window.setTimeout(() => document.querySelector(`.rail.over [data-case="${expanded}"], .sheet-rail [data-case="${expanded}"]`)?.scrollIntoView({ block: "nearest" }), 60);
    return () => window.clearTimeout(t);
  }, [open, expanded]);

  if (!user) return null;

  const preview = (s: CaseSignals) => {
    const c = detail.c;
    if (!c || c.id !== s.id) return detail.loading ? <ListSkeleton rows={1} label="Opening quick view" /> : null;
    return <StudentPreview s={s} c={c} onOpenStep={() => openCase(s, s.currentStep ? { step: s.currentStep } : {})} onOpenDocuments={() => openCase(s, { tab: "documents" })} onOpenTimeline={() => openCase(s, { tab: "timeline" })} />;
  };

  const panelBody = (
    <>
      <div className="rail-summary" role="group" aria-label="Caseload summary">
        <div className="rail-sum hue-blue"><span className="rail-sum-v">{activeCount}</span><span className="rail-sum-l">Active</span></div>
        <div className="rail-sum hue-rose"><span className="rail-sum-v">{attentionCount >= 1000 ? "1,000+" : attentionCount}</span><span className="rail-sum-l">Need attention</span></div>
        <div className="rail-sum hue-teal"><span className="rail-sum-v">{avg}%</span><span className="rail-sum-l">Average progress</span></div>
      </div>
      <div className="rail-search">
        <Search aria-hidden />
        <input type="search" className="input" placeholder="Search students (three characters or more)" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {page.error ? <ReadError error={page.error} onRetry={page.reload} /> : page.loading ? <ListSkeleton rows={4} label="Loading your students" /> : !searching && total === 0 ? (
        <EmptyState compact glyph="students" title="No students assigned yet" reason="Cases appear here once an administrator or Team Leader assigns them to you." />
      ) : mine.length === 0 ? (
        <EmptyState compact glyph="search" title="No students match" reason="Try a different name, reference or destination." />
      ) : (
        GROUPS.map((g) => {
          const rows = mine.filter((x) => groupOf(x) === g.id);
          if (!rows.length) return null;
          const isOpen = q.trim() ? true : openGroups[g.id] ?? g.defaultOpen;
          return (
            <section key={g.id} className={`rail-group g-${g.id}`} aria-label={g.label}>
              <button type="button" className="rail-group-h" aria-expanded={isOpen} onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !isOpen }))}>
                <ChevronDown aria-hidden className={isOpen ? "open" : ""} />{g.label}<span className="count">{rows.length}</span>
              </button>
              {isOpen && (
                <FlipList order={rows.map((x) => x.id).join()}>
                  {rows.map((s) => (
                    <RailRow key={s.id} s={s} unseen={hasUnseen(user.id, s, seen)} expanded={expanded === s.id}
                      onOpen={() => openCase(s)} onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}>
                      {expanded === s.id && preview(s)}
                    </RailRow>
                  ))}
                </FlipList>
              )}
            </section>
          );
        })
      )}
      {!page.loading && !page.error && <PageFooter shown={rows.length} total={searching ? null : total} hasMore={page.hasMore} loadingMore={page.loadingMore} onMore={page.loadMore} noun="students" />}
    </>
  );

  const header = (close?: ReactNode) => (
    <div className="rail-head">
      <div className="rail-title">
        <h2>My students</h2>
        <p>{total.toLocaleString()} assigned to {user.name.split(/\s+/)[0]}</p>
      </div>
      {close}
    </div>
  );

  if (mode === "sheet") {
    return (
      <Layer open={open} onClose={() => onOpenChange(false)} label="My students" variant="sheet">
        <div className="rail sheet-rail">{header()}{panelBody}</div>
      </Layer>
    );
  }

  return (
    <>
      <aside className="rail strip" aria-label="My students">
        <Tooltip side="right" label={open ? "Close my students" : "My students"}>
          <button ref={launcherRef} type="button" className="rail-launch" aria-haspopup="dialog" aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} my students, ${total} assigned${attentionCount ? `, ${attentionCount} needing attention` : ""}`}
            onClick={() => (open ? onOpenChange(false) : reveal())}>
            {open ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            {attentionCount > 0 && <span className="badge" aria-hidden="true">{attentionCount}</span>}
          </button>
        </Tooltip>
        <span className="rail-strip-avg" aria-hidden="true" title="Average progress">{avg}%</span>
        <ul className="rail-strip-list" role="list">
          {assigned.slice(0, STRIP_MAX).map((s) => (
            <li key={s.id}>
              <Tooltip side="right" delay={150} label={`${s.name} · ${s.progress.pct}% · Stage ${s.stage.n} ${s.stage.name}`}>
                <button type="button" className="rail-strip-btn" aria-label={`Quick view ${s.name}, ${s.progress.pct} percent complete, stage ${s.stage.n} of 9, ${stepLine(s)}`} onClick={() => reveal(s.id)}>
                  <ProgressAvatar s={s} size={42} unseen={hasUnseen(user.id, s, seen)} />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
        {total > STRIP_MAX && <button type="button" className="rail-more" onClick={() => reveal()} aria-label={`Show all ${total} students`}>+{total - STRIP_MAX}</button>}
      </aside>
      <SlideOver open={open} onClose={() => onOpenChange(false)}>
        {header(<button type="button" className="icon-btn sm" aria-label="Close my students" onClick={() => onOpenChange(false)}><PanelLeftClose aria-hidden /></button>)}
        {panelBody}
      </SlideOver>
    </>
  );
}

/** A rail group list whose rows glide to their new place when urgency reorders them. */
function FlipList({ order, children }: { order: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, [order]);
  return <ul ref={ref} className="rail-list" role="list">{children}</ul>;
}

function SlideOver({ open, children, onClose }: { open: boolean; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const { mounted, leaving } = usePresence(open, EXIT_MS.sheet);
  const content = useLastOpen(children, open);
  useFocusTrap(ref as React.RefObject<HTMLElement>, open, { onEscape: onClose });
  if (!mounted) return null;
  const out = leaving ? " is-leaving" : "";
  return createPortal(
    <>
      <div className={`rail-scrim${out}`} onMouseDown={onClose} />
      <aside ref={ref} className={`rail over float float-strong${out}`} aria-label="My students" role="dialog" aria-modal="true" tabIndex={-1} {...leavingAttrs(leaving)}>{content}</aside>
    </>,
    document.body,
  );
}

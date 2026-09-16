/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The counsellor's student rail. Always minimised to a slim strip on the left edge: one
 * progress ring per assigned student. Pressing the launcher (or any ring) slides the full
 * quick view open from the left — every student with their percentage, stage and step.
 * On phones the same list opens as a bottom sheet from the Students tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useSession } from "@/App";
import { caseScopeOf } from "@/lib/rbac";
import { caseDestination } from "@/lib/logic";
import { useLocalPref } from "@/lib/hooks";
import { compareSeverity, useCaseSignals, type CaseSignals } from "@/lib/signals";
import { EmptyState, Layer, Tooltip, useFocusTrap } from "@/lib/ui";
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
  const signals = useCaseSignals();
  const seen = useSeen(user?.id);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useLocalPref<Record<GroupId, boolean>>("lpl:pms:rail-groups", { attention: true, progress: true, held: false, closed: false });
  const launcherRef = useRef<HTMLButtonElement>(null);

  const assigned = useMemo(() => (user ? [...signals.values()].filter((x) => x.counsellorId === user.id).sort(compareSeverity) : []), [signals, user]);
  const mine = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return assigned;
    return assigned.filter((x) => x.name.toLowerCase().includes(s) || x.ref.toLowerCase().includes(s) || (cases[x.id] ? caseDestination(cases[x.id]).toLowerCase().includes(s) : false));
  }, [assigned, q, cases]);
  const active = assigned.filter((x) => x.status === "open");
  const attentionCount = active.filter((x) => x.severity !== "none").length;
  const avg = active.length ? Math.round(active.reduce((n, x) => n + x.progress.pct, 0) / active.length) : 0;

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
    const c = cases[s.id];
    if (!c) return null;
    return <StudentPreview s={s} c={c} onOpenStep={() => openCase(s, s.currentStep ? { step: s.currentStep } : {})} onOpenDocuments={() => openCase(s, { tab: "documents" })} onOpenTimeline={() => openCase(s, { tab: "timeline" })} />;
  };

  const panelBody = (
    <>
      <div className="rail-summary" role="group" aria-label="Caseload summary">
        <div className="rail-sum hue-blue"><span className="rail-sum-v">{active.length}</span><span className="rail-sum-l">Active</span></div>
        <div className="rail-sum hue-rose"><span className="rail-sum-v">{attentionCount}</span><span className="rail-sum-l">Need attention</span></div>
        <div className="rail-sum hue-teal"><span className="rail-sum-v">{avg}%</span><span className="rail-sum-l">Average progress</span></div>
      </div>
      <div className="rail-search">
        <Search aria-hidden />
        <input type="search" className="input" placeholder="Search students" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {assigned.length === 0 ? (
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
    </>
  );

  const header = (close?: ReactNode) => (
    <div className="rail-head">
      <div className="rail-title">
        <h2>My students</h2>
        <p>{assigned.length} assigned to {user.name.split(/\s+/)[0]}</p>
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
            aria-label={`${open ? "Close" : "Open"} my students, ${assigned.length} assigned${attentionCount ? `, ${attentionCount} needing attention` : ""}`}
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
        {assigned.length > STRIP_MAX && <button type="button" className="rail-more" onClick={() => reveal()} aria-label={`Show all ${assigned.length} students`}>+{assigned.length - STRIP_MAX}</button>}
      </aside>
      {open && (
        <SlideOver onClose={() => onOpenChange(false)}>
          {header(<button type="button" className="icon-btn sm" aria-label="Close my students" onClick={() => onOpenChange(false)}><PanelLeftClose aria-hidden /></button>)}
          {panelBody}
        </SlideOver>
      )}
    </>
  );
}

/** A rail group list whose rows glide to their new place when urgency reorders them. */
function FlipList({ order, children }: { order: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, [order]);
  return <ul ref={ref} className="rail-list" role="list">{children}</ul>;
}

function SlideOver({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useFocusTrap(ref as React.RefObject<HTMLElement>, true, { onEscape: onClose });
  return createPortal(
    <>
      <div className="rail-scrim" onMouseDown={onClose} />
      <aside ref={ref} className="rail over float float-strong" aria-label="My students" role="dialog" aria-modal="true" tabIndex={-1}>{children}</aside>
    </>,
    document.body,
  );
}

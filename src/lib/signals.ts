/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * One derivation of "what does this case need" shared by the rail, the dashboards, the
 * cases list, the dock badges and the notification reminders. Computed once per snapshot
 * (useCaseSignals memoises on the cases revision), never per component.
 */
import { useMemo } from "react";
import type { CaseRecord, CaseStatus, OrgConfig } from "./types";
import {
  caseProgress, currentPipeline, currentStep, daysUntil, latestGate, pendingReviewCount, pipelineProgress, retentionState, slaFlags, stepState,
  type PipelineProgress, type Progress, type RetentionState, type SlaFlag,
} from "./logic";
import { PIPELINE, STEP_BY_N, type PipelineStage } from "./spine";
import { useStoreSelect } from "./useStore";
import { evaluateCase, stepDone, type CaseSummary } from "./summary";

export type Severity = "bad" | "warn" | "info" | "none";
export const SEVERITY_ORDER: Record<Severity, number> = { bad: 0, warn: 1, info: 2, none: 3 };

export type AttentionKind = "sla" | "gate-returned" | "gate-pending" | "review" | "profile" | "hold-review" | "retention";

export interface AttentionItem {
  id: string;
  caseId: string;
  kind: AttentionKind;
  label: string;
  severity: Exclude<Severity, "none">;
  step?: number;
  days?: number;
}

export interface CaseSignals {
  id: string;
  ref: string;
  name: string;
  status: CaseStatus;
  counsellorId?: string;
  studentUserId?: string;
  progress: Progress;
  stages: PipelineProgress[];
  currentStep: number | null;
  stage: PipelineStage;
  flags: SlaFlag[];
  breached: number;
  dueSoon: number;
  gatePending?: 16 | 19;
  gateReturned?: 16 | 19;
  docsToReview: number;
  profileSubmitted: boolean;
  retention: RetentionState;
  holdReviewDue: boolean;
  attention: AttentionItem[];
  severity: Severity;
  updatedAt: string;
  createdAt: string;
  lastEventAt?: string;
  lastEventBy?: string;
}

function daysLabel(days: number): string {
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return "due today";
  return `${days}d left`;
}

export function deriveCaseSignals(c: CaseRecord, config: OrgConfig): CaseSignals {
  const open = c.status === "open";
  const flags = slaFlags(c, config);
  const breached = flags.filter((f) => f.state === "breached").length;
  const dueSoon = flags.filter((f) => f.state === "due-soon").length;
  const attention: AttentionItem[] = [];
  let gatePending: 16 | 19 | undefined;
  let gateReturned: 16 | 19 | undefined;

  if (open) {
    for (const f of flags) {
      if (f.state === "ok") continue;
      attention.push({ id: `${c.id}:sla:${f.id}`, caseId: c.id, kind: "sla", label: `${f.label} · ${daysLabel(f.days)}`, severity: f.state === "breached" ? "bad" : "warn", step: f.step, days: f.days });
    }
    for (const g of [16, 19] as const) {
      const l = latestGate(c, g);
      if (!l) continue;
      if (l.status === "returned" && !l.addressedAt) {
        gateReturned = gateReturned ?? g;
        attention.push({ id: `${c.id}:gate:${g}:returned`, caseId: c.id, kind: "gate-returned", label: `Gate ${g} returned with suggestions`, severity: "bad", step: g });
      } else if (l.status === "pending") {
        gatePending = gatePending ?? g;
        attention.push({ id: `${c.id}:gate:${g}:pending`, caseId: c.id, kind: "gate-pending", label: `Gate ${g} awaiting Team Leader`, severity: "info", step: g });
      }
    }
  }

  const docsToReview = open ? pendingReviewCount(c) : 0;
  if (docsToReview > 0) attention.push({ id: `${c.id}:review`, caseId: c.id, kind: "review", label: `${docsToReview} document${docsToReview === 1 ? "" : "s"} awaiting your review`, severity: "info" });

  const s2 = stepState(c, 2);
  const profileSubmitted = open && !!s2.studentSubmittedAt && s2.status !== "done";
  if (profileSubmitted) attention.push({ id: `${c.id}:profile`, caseId: c.id, kind: "profile", label: "Student submitted profile — confirm it", severity: "info", step: 2 });

  const holdReviewDue = (c.status === "hold" || c.status === "deferred") && !!c.hold?.reviewDate && daysUntil(new Date(c.hold.reviewDate)) < 0;
  if (holdReviewDue) attention.push({ id: `${c.id}:hold`, caseId: c.id, kind: "hold-review", label: "Hold review date passed", severity: "warn" });

  const retention = retentionState(c, config);
  if (retention === "overdue") attention.push({ id: `${c.id}:retention`, caseId: c.id, kind: "retention", label: "Retention overdue — dispose or hold", severity: "warn" });

  attention.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const severity: Severity = attention[0]?.severity ?? "none";

  return {
    id: c.id, ref: c.ref, name: c.student.name, status: c.status, counsellorId: c.counsellorId, studentUserId: c.studentUserId,
    progress: caseProgress(c), stages: pipelineProgress(c), currentStep: currentStep(c), stage: currentPipeline(c),
    flags, breached, dueSoon, gatePending, gateReturned, docsToReview, profileSubmitted, retention, holdReviewDue,
    attention, severity, updatedAt: c.updatedAt, createdAt: c.createdAt, lastEventAt: c.events[0]?.at, lastEventBy: c.events[0]?.by,
  };
}

/**
 * The same signals from a case summary (a row of the read model) rather than the document, so a
 * list can show a case's attention and stage track without downloading it. Differences from
 * deriveCaseSignals, by construction of the summary: one returned and one pending gate at
 * most, and a stage counts as "active" when it holds the current step.
 */
export function signalsFromSummary(s: CaseSummary, config: OrgConfig, now = Date.now()): CaseSignals {
  const st = evaluateCase(s, config, now);
  const open = s.status === "open";
  const flags: SlaFlag[] = st.clocks.map((c) => ({ id: c.id, label: c.label, due: new Date(c.due), days: c.days, state: c.state, step: c.step }));
  const attention: AttentionItem[] = [];
  if (open) {
    for (const f of flags) {
      if (f.state === "ok") continue;
      attention.push({ id: `${s.id}:sla:${f.id}`, caseId: s.id, kind: "sla", label: `${f.label} · ${daysLabel(f.days)}`, severity: f.state === "breached" ? "bad" : "warn", step: f.step, days: f.days });
    }
    for (const g of [16, 19] as const) {
      if (st.gateReturned === g) attention.push({ id: `${s.id}:gate:${g}:returned`, caseId: s.id, kind: "gate-returned", label: `Gate ${g} returned with suggestions`, severity: "bad", step: g });
      else if (st.gatePending === g) attention.push({ id: `${s.id}:gate:${g}:pending`, caseId: s.id, kind: "gate-pending", label: `Gate ${g} awaiting Team Leader`, severity: "info", step: g });
    }
  }
  if (st.docsToReview > 0) attention.push({ id: `${s.id}:review`, caseId: s.id, kind: "review", label: `${st.docsToReview} document${st.docsToReview === 1 ? "" : "s"} awaiting your review`, severity: "info" });
  if (st.profileSubmitted) attention.push({ id: `${s.id}:profile`, caseId: s.id, kind: "profile", label: "Student submitted profile — confirm it", severity: "info", step: 2 });
  if (st.holdReviewDue) attention.push({ id: `${s.id}:hold`, caseId: s.id, kind: "hold-review", label: "Hold review date passed", severity: "warn" });
  if (st.retention === "overdue") attention.push({ id: `${s.id}:retention`, caseId: s.id, kind: "retention", label: "Retention overdue — dispose or hold", severity: "warn" });
  attention.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const stage = PIPELINE[s.stage - 1] ?? PIPELINE[PIPELINE.length - 1];
  const stages: PipelineProgress[] = PIPELINE.map((p) => {
    const req = p.steps.filter((n) => !STEP_BY_N[n].optional);
    const done = req.filter((n) => stepDone(s, n)).length;
    return { ...p, done, total: req.length, active: p.id === stage.id && s.currentStep != null, complete: done === req.length, current: p.id === stage.id };
  });
  return {
    id: s.id, ref: s.ref, name: s.studentName, status: s.status, counsellorId: s.counsellorId ?? undefined, studentUserId: s.studentUserId ?? undefined,
    progress: { done: s.progressDone, applicable: s.progressApplicable, pct: s.progressPct } as Progress, stages, currentStep: s.currentStep, stage,
    flags, breached: st.breached, dueSoon: st.dueSoon, gatePending: st.gatePending ?? undefined, gateReturned: st.gateReturned ?? undefined,
    docsToReview: st.docsToReview, profileSubmitted: st.profileSubmitted, retention: st.retention, holdReviewDue: st.holdReviewDue,
    attention, severity: attention[0]?.severity ?? "none", updatedAt: s.updatedAt, createdAt: s.createdAt,
    lastEventAt: s.lastEventAt ?? undefined, lastEventBy: s.lastEventBy ?? undefined,
  };
}

/** Signals for rows of the read model, memoised on the rows and the configuration. */
export function useRowSignals(rows: readonly CaseSummary[]): Map<string, CaseSignals> {
  const config = useStoreSelect((s) => s.org.config);
  return useMemo(() => {
    const now = Date.now();
    return new Map(rows.map((r) => [r.id, signalsFromSummary(r, config, now)]));
  }, [rows, config]);
}

export function deriveAll(cases: Record<string, CaseRecord>, config: OrgConfig): Map<string, CaseSignals> {
  const out = new Map<string, CaseSignals>();
  for (const c of Object.values(cases)) out.set(c.id, deriveCaseSignals(c, config));
  return out;
}

/** Most urgent first, then most recently updated. */
export function compareSeverity(a: CaseSignals, b: CaseSignals): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.updatedAt.localeCompare(a.updatedAt);
}

export interface Badges { unassigned: number; toReview: number; pendingGates: number; breaches: number; returned: number; retentionOverdue: number }

/** Counts for the dock badges. `mineId` narrows "to review" to one counsellor's caseload. */
export function countBadges(signals: Iterable<CaseSignals>, opts: { mineId?: string } = {}): Badges {
  const b: Badges = { unassigned: 0, toReview: 0, pendingGates: 0, breaches: 0, returned: 0, retentionOverdue: 0 };
  for (const s of signals) {
    if (s.status === "open" && !s.counsellorId) b.unassigned++;
    if (!opts.mineId || s.counsellorId === opts.mineId) b.toReview += s.docsToReview;
    if (s.status === "open" && s.gatePending) b.pendingGates++;
    if (s.status === "open") b.breaches += s.breached;
    if (s.status === "open" && s.gateReturned) b.returned++;
    if (s.retention === "overdue") b.retentionOverdue++;
  }
  return b;
}

/** Dock badges from the dashboard (the caller's own cases, or every case for an all-scope role). */
export function badgesOf(d: { open: { unassigned: number; docsToReview: number; gatesPending: number; breached: number; gatesReturned: number }; retention: { overdue: number } } | null): Badges {
  if (!d) return { unassigned: 0, toReview: 0, pendingGates: 0, breaches: 0, returned: 0, retentionOverdue: 0 };
  return { unassigned: d.open.unassigned, toReview: d.open.docsToReview, pendingGates: d.open.gatesPending, breaches: d.open.breached, returned: d.open.gatesReturned, retentionOverdue: d.retention.overdue };
}

/** Signals for every case in the snapshot, recomputed only when cases or configuration change. */
export function useCaseSignals(): Map<string, CaseSignals> {
  const cases = useStoreSelect((s) => s.cases.cases);
  const config = useStoreSelect((s) => s.org.config);
  return useMemo(() => deriveAll(cases, config), [cases, config]);
}

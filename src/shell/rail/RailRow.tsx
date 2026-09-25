/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * One student in the rail: progress ring, where they are in the process (stage and step),
 * the most urgent item, and an inline quick view.
 */
import { forwardRef, memo, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar, MiniStageTrack, SeverityChip } from "@/lib/ui";
import { STEP_BY_N } from "@/lib/spine";
import type { CaseSignals } from "@/lib/signals";
import { setTransitionSource } from "@/lib/motion";

/** Avatar inside a progress ring drawn in the colour of the student's current stage. */
export function ProgressAvatar({ s, size = 44, unseen = false }: { s: CaseSignals; size?: number; unseen?: boolean }) {
  const stroke = size >= 44 ? 3.5 : 3;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, s.progress.pct));
  const done = s.status === "completed";
  return (
    <span className={`p-avatar sev-${s.severity}`} style={{ width: size, height: size, "--sf": done ? "var(--hue-emerald)" : `var(--stage-${s.stage.n})` } as CSSProperties} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="p-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="p-value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Avatar name={s.name} size={size - stroke * 2 - 5} />
      {s.severity !== "none" && <span className="p-sev" />}
      {unseen && <span className="unseen" />}
    </span>
  );
}

export function stepLine(s: CaseSignals): string {
  if (s.status === "completed") return "All steps complete";
  if (!s.currentStep) return "All steps recorded";
  return `Step ${s.currentStep} · ${STEP_BY_N[s.currentStep]?.title ?? ""}`;
}

export interface RailRowProps {
  s: CaseSignals;
  unseen: boolean;
  expanded: boolean;
  onOpen: () => void;
  onToggle: () => void;
  children?: React.ReactNode;
}

export const RailRow = memo(forwardRef<HTMLLIElement, RailRowProps>(function RailRow({ s, unseen, expanded, onOpen, onToggle, children }, ref) {
  const top = s.attention[0];
  const previewId = `rail-preview-${s.id}`;
  const statusNote = s.status !== "open" ? ` · ${s.status === "hold" ? "on hold" : s.status}` : "";
  return (
    <li ref={ref} className={`rail-row sev-${s.severity} ${expanded ? "expanded" : ""}`} data-case={s.id} data-flip={s.id} style={{ "--sf": `var(--stage-${s.stage.n})` } as CSSProperties}>
      <div className="rail-row-main">
        <button type="button" className="rail-open" onClick={(e) => { setTransitionSource(e.currentTarget.closest("li")); onOpen(); }}
          aria-label={`Open ${s.name}, ${s.ref}, ${s.progress.pct} percent complete, stage ${s.stage.n} of 9 ${s.stage.name}, ${stepLine(s)}${unseen ? ", updates since you last opened it" : ""}`}>
          <ProgressAvatar s={s} size={46} unseen={unseen} />
          <span className="rail-text">
            <span className="rail-name">{s.name}</span>
            <span className="rail-stage"><span className="rail-stage-dot" />Stage {s.stage.n}/9 · {s.stage.name}{statusNote}</span>
            <span className="rail-step">{stepLine(s)}</span>
          </span>
          <span className="rail-pct"><b>{s.progress.pct}</b>%</span>
        </button>
        <button type="button" className="rail-toggle" aria-expanded={expanded} aria-controls={previewId} aria-label={`${expanded ? "Hide" : "Show"} details for ${s.name}`} onClick={onToggle}>
          <ChevronDown aria-hidden />
        </button>
      </div>
      <div className="rail-row-foot">
        <MiniStageTrack stages={s.stages} size="xs" />
        <span className="rail-ref">{s.ref}</span>
      </div>
      {top && !expanded && <SeverityChip severity={top.severity} className="rail-chip">{top.label}</SeverityChip>}
      {expanded && <div id={previewId} role="region" aria-label={`${s.name} details`} className="rail-preview-inline">{children}</div>}
    </li>
  );
}));

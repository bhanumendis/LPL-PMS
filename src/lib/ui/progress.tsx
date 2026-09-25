/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Compact progress: the nine-stage mini track and the severity chip.
 */
import React from "react";
import type { PipelineProgress } from "../logic";
import type { Severity } from "../signals";

export function MiniStageTrack({ stages, size = "sm", label, className = "" }: { stages: PipelineProgress[]; size?: "xs" | "sm"; label?: string; className?: string }) {
  const cur = stages.find((s) => s.current);
  const done = stages.filter((s) => s.complete).length;
  const name = label ?? `Stage ${cur?.n ?? stages.length} of ${stages.length}, ${done} stage${done === 1 ? "" : "s"} complete`;
  return (
    <span className={`mini-track ${size} ${className}`} role="img" aria-label={name}>
      {stages.map((s) => <span key={s.id} className={`seg ${s.complete ? "done" : s.current ? "current" : s.done > 0 ? "partial" : ""}`} />)}
    </span>
  );
}

export function SeverityChip({ severity, children, icon, className = "" }: { severity: Severity; children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return <span className={`sev-chip sev-${severity} ${className}`}>{icon}{children}</span>;
}

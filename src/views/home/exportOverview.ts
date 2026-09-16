/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { PIPELINE } from "@/lib/spine";
import type { CaseSignals } from "@/lib/signals";

/** The overview CSV kept from v4: headline counts plus open cases by stage. */
export function overviewCsv(signals: CaseSignals[]): string {
  const open = signals.filter((s) => s.status === "open");
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Open cases", open.length],
    ["Unassigned", open.filter((s) => !s.counsellorId).length],
    ["Awaiting Team Leader", open.filter((s) => s.gatePending).length],
    ["SLA breaches", open.reduce((n, s) => n + s.breached, 0)],
    ["Documents to review", open.reduce((n, s) => n + s.docsToReview, 0)],
    ["On hold or deferred", signals.filter((s) => s.status === "hold" || s.status === "deferred").length],
    ["Exited", signals.filter((s) => s.status === "exited").length],
    ["Completed", signals.filter((s) => s.status === "completed").length],
    ...PIPELINE.map((p) => [`Stage: ${p.n}. ${p.name}`, open.filter((s) => s.stage.id === p.id).length] as (string | number)[]),
  ];
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function downloadText(name: string, text: string, type = "text/csv"): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

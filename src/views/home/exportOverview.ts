/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { PIPELINE } from "@/lib/spine";
import type { DashboardSummary } from "@/lib/summary";

/** The overview CSV kept from v4: headline counts plus open cases by stage. */
export function overviewCsv(d: DashboardSummary): string {
  const rows: (string | number)[][] = [
    ["Metric", "Value"],
    ["Open cases", d.open.total],
    ["Unassigned", d.open.unassigned],
    ["Awaiting Team Leader", d.open.gatesPending],
    ["SLA breaches", d.open.breached],
    ["Documents to review", d.open.docsToReview],
    ["On hold or deferred", d.status.hold + d.status.deferred],
    ["Exited", d.status.exited],
    ["Completed", d.status.completed],
    ...PIPELINE.map((p) => [`Stage: ${p.n}. ${p.name}`, d.byStage.find((b) => b.stage === p.n)?.open ?? 0] as (string | number)[]),
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

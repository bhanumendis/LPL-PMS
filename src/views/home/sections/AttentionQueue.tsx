/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The queue of things that need someone now, most urgent first, each with the one action
 * that resolves it.
 */
import { memo } from "react";
import { ArrowRight } from "lucide-react";
import { useSession } from "@/App";
import { EmptyState, SeverityChip } from "@/lib/ui";
import type { AttentionItem, CaseSignals, Severity } from "@/lib/signals";

const HEAD: Record<Exclude<Severity, "none">, string> = { bad: "Overdue", warn: "Due soon", info: "To review" };

function actionFor(a: AttentionItem): { label: string; route: { page: string; caseId?: string; step?: number; tab?: string } } {
  switch (a.kind) {
    case "sla": return { label: "Open step", route: { page: "case", caseId: a.caseId, step: a.step } };
    case "gate-returned": return { label: "Open gate", route: { page: "case", caseId: a.caseId, step: a.step } };
    case "gate-pending": return { label: "View", route: { page: "case", caseId: a.caseId, step: a.step } };
    case "review": return { label: "Review documents", route: { page: "case", caseId: a.caseId, tab: "documents" } };
    case "profile": return { label: "Confirm profile", route: { page: "case", caseId: a.caseId, step: 2 } };
    case "hold-review": return { label: "Open case", route: { page: "case", caseId: a.caseId } };
    case "retention": return { label: "Data protection", route: { page: "dataprotection" } };
  }
}

export const AttentionQueue = memo(function AttentionQueue({ items, signals, limit = 12, emptyReason = "Service level clocks, returned gates and unreviewed documents appear here." }: { items: AttentionItem[]; signals: Map<string, CaseSignals>; limit?: number; emptyReason?: string }) {
  const { go } = useSession();
  if (items.length === 0) return <EmptyState glyph="check" title="Nothing needs attention" reason={emptyReason} />;
  const shown = items.slice(0, limit);
  const groups: { sev: Exclude<Severity, "none">; rows: AttentionItem[] }[] = [];
  for (const a of shown) {
    const g = groups[groups.length - 1];
    if (g && g.sev === a.severity) g.rows.push(a); else groups.push({ sev: a.severity, rows: [a] });
  }
  return (
    <div className="attention">
      {groups.map((g) => (
        <section key={g.sev} className={`attention-group sev-${g.sev}`} aria-label={HEAD[g.sev]}>
          <p className="attention-h"><SeverityChip severity={g.sev}>{HEAD[g.sev]}</SeverityChip><span className="muted xs">{g.rows.length}</span></p>
          <ul role="list">
            {g.rows.map((a) => {
              const s = signals.get(a.caseId);
              const act = actionFor(a);
              return (
                <li key={a.id} className="attention-row">
                  <button type="button" className="row-btn ui small" onClick={() => go({ page: "case", caseId: a.caseId })}>{s?.ref ?? a.caseId}</button>
                  <span className="attention-body">
                    <span className="ui small ink2 truncate" style={{ display: "block" }}>{s?.name}</span>
                    <span className="small muted">{a.label}</span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm attention-act" onClick={() => go(act.route)}>{act.label}<ArrowRight aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {items.length > limit && <p className="xs muted" style={{ padding: "8px 4px 0" }}>{items.length - limit} more on the caseload page.</p>}
    </div>
  );
});

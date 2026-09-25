/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Where the open caseload sits across the nine stages. Click a stage to filter the cases page.
 */
import { memo, type CSSProperties } from "react";
import { PIPELINE } from "@/lib/spine";
import { useMounted } from "@/lib/charts";
import type { DashboardSummary } from "@/lib/summary";

export const StageFlow = memo(function StageFlow({ byStage, onSelect, selected, label = "Open cases by stage" }: { byStage: DashboardSummary["byStage"]; onSelect?: (stageId: string) => void; selected?: string; label?: string }) {
  const mounted = useMounted();
  const counts = PIPELINE.map((p) => { const x = byStage.find((b) => b.stage === p.n); return { p, n: x?.open ?? 0, bad: x?.bad ?? 0 }; });
  const max = Math.max(1, ...counts.map((c) => c.n));
  const total = counts.reduce((s, c) => s + c.n, 0);
  return (
    <div className="stage-flow-wrap">
      <ol className="stage-flow" aria-label={`${label}, ${total} open`}>
        {counts.map(({ p, n, bad }) => {
          const h = mounted ? Math.max(n ? 8 : 2, (n / max) * 100) : 2;
          const inner = (
            <>
              <span className="sf-n" aria-hidden="true">{n || ""}</span>
              <span className="sf-col" aria-hidden="true"><span className={`sf-bar ${bad ? "has-bad" : ""}`} style={{ height: `${h}%`, "--sf": `var(--stage-${p.n})` } as CSSProperties} /></span>
              <span className="sf-num">{p.n}</span>
              <span className="sr-only">Stage {p.n} {p.name}: {n} open{bad ? `, ${bad} overdue` : ""}</span>
            </>
          );
          return (
            <li key={p.id} className={`sf-item ${selected === p.id ? "selected" : ""} ${n === 0 ? "empty" : ""}`} title={`${p.n}. ${p.name}: ${n} open`}>
              {onSelect ? <button type="button" className="sf-btn" aria-pressed={selected === p.id} aria-label={`Stage ${p.n} ${p.name}, ${n} open`} onClick={() => onSelect(p.id)}>{inner}</button> : inner}
            </li>
          );
        })}
      </ol>
      <p className="sf-caption xs muted">{selected ? `${PIPELINE.find((p) => p.id === selected)?.name}` : "Capture → Depart and arrive"} · {total} open</p>
    </div>
  );
});

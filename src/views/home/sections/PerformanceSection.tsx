/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Performance: funnel, volume over time, service levels, mix. Below the fold, collapsible,
 * remembered per browser. Gated by analytics.read exactly as the v4 overview was.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { useLocalPref } from "@/lib/hooks";
import { averageLeadTime, caseChannel, caseDestination, countBy, docStats, funnel, monthlyVolume, slaCompliance } from "@/lib/logic";
import { AreaChart, DonutWithLegend, Funnel, HBars, Ring } from "@/lib/charts";
import { EmptyState, Notice } from "@/lib/ui";
import type { CaseRecord, OrgConfig } from "@/lib/types";

const RANGES = [{ id: "6", label: "6 mo" }, { id: "12", label: "12 mo" }, { id: "24", label: "24 mo" }];

export function PerformanceSection({ cases, config, canRead, canDownload, onExport, scope, prefKey = "lpl:pms:perf" }: { cases: CaseRecord[]; config: OrgConfig; canRead: boolean; canDownload?: boolean; onExport?: () => void; scope: "team" | "mine"; prefKey?: string }) {
  const [open, setOpen] = useLocalPref(prefKey, scope === "team");
  const [range, setRange] = useState("12");
  const all = cases;
  const live = useMemo(() => all.filter((c) => c.status !== "exited"), [all]);
  const vol = useMemo(() => monthlyVolume(all, Number(range)), [all, range]);
  const sla = useMemo(() => slaCompliance(all, config), [all, config]);
  const dest = useMemo(() => countBy(live, caseDestination).slice(0, 8), [live]);
  const channels = useMemo(() => countBy(all, caseChannel), [all]);
  const exits = useMemo(() => countBy(all.filter((c) => c.status === "exited"), (c) => c.exit?.code ?? "Other"), [all]);
  const docs = useMemo(() => docStats(all), [all]);
  const lead = useMemo(() => averageLeadTime(all), [all]);

  return (
    <section className="perf surface" aria-labelledby="perf-h">
      <div className="perf-head">
        <h2 id="perf-h">
          <button type="button" className="perf-h" aria-expanded={open} aria-controls="perf-body" aria-describedby="perf-sub" onClick={() => setOpen((o) => !o)}>
            Performance
            <ChevronDown aria-hidden className={open ? "open" : ""} />
          </button>
        </h2>
        <p id="perf-sub" className="perf-sub ui xs muted">{scope === "team" ? "Funnel, volume, service levels and mix across the team" : "Your funnel, volume and mix"}{lead != null ? ` · ${lead} days enquiry to arrival` : ""}{docs.reworkPct ? ` · ${docs.reworkPct}% document rework` : ""}</p>
      </div>
      {open && (
        <div id="perf-body" className="perf-body">
          {!canRead ? (
            <Notice tone="neutral">Your role sees the overview tiles. The analytics.read permission opens the funnel, charts and caseload table.</Notice>
          ) : all.length === 0 ? (
            <EmptyState glyph="chart" title="Not enough history yet" reason="Charts fill as cases move through the nine stages." />
          ) : (
            <>
              <div className="perf-grid">
                <div className="perf-cell">
                  <h3>Enquiry to arrival</h3>
                  <Funnel rows={funnel(all)} />
                  <p className="xs muted mt2">Conversion families per §11 of the process document. Drop percentages are stage to stage.</p>
                </div>
                <div className="perf-cell span2">
                  <h3>Volume</h3>
                  <AreaChart labels={vol.labels} series={[{ name: "Enquiries", values: vol.enquiries }, { name: "Arrivals", values: vol.arrivals, tone: "info" }]} title="Enquiries and arrivals" ranges={RANGES} range={range} onRange={setRange} />
                  <p className="legend flex g3 xs mt1" style={{ flexDirection: "row" }}><span className="flex aic g1"><span className="sw" style={{ background: "var(--hue-blue)" }} aria-hidden="true" />Enquiries</span><span className="flex aic g1"><span className="sw" style={{ background: "var(--hue-teal)" }} aria-hidden="true" />Arrivals</span></p>
                </div>
                <div className="perf-cell">
                  <h3>Service levels</h3>
                  <div className="stack-sm">
                    {sla.map((s) => {
                      const pct = s.total ? Math.round((s.met / s.total) * 100) : null;
                      return (
                        <div key={s.id} className="flex aic g3">
                          <Ring pct={pct ?? 0} size={56} stroke={6} small tone={pct === null ? "" : pct >= 90 ? "ok" : pct >= 70 ? "" : "bad"} label={s.label} />
                          <div className="grow"><p className="ui small strong">{s.label}</p><p className="xs muted">{s.total ? `${s.met} of ${s.total} met` : "No completed clocks yet"}</p></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="perf-cell">
                  <h3>Destination mix</h3>
                  {dest.length === 0 ? <EmptyState compact glyph="chart" title="No destinations yet" /> : <DonutWithLegend data={dest} title="Destination mix" centerSub="cases" />}
                </div>
                <div className="perf-cell">
                  <h3>Enquiry channel</h3>
                  {channels.length === 0 ? <EmptyState compact glyph="chart" title="No enquiries yet" /> : <HBars data={channels} ariaLabel="Enquiries by channel" tone={3} />}
                </div>
                <div className="perf-cell">
                  <h3>Exits by coded reason</h3>
                  {exits.length === 0 ? <p className="small muted">No exits recorded.</p> : <HBars data={exits} ariaLabel="Exits by coded reason" tone={5} />}
                </div>
              </div>
              {canDownload && onExport && <div className="mt3"><button type="button" className="btn btn-secondary btn-sm" onClick={onExport}><Download aria-hidden />Export CSV</button></div>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

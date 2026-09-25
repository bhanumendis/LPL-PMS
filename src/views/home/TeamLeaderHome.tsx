/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The Team Leader's home: decisions waiting on me, exposure, the team's flow and load. Counts
 * come from the dashboard aggregate; the two queues are short pages read from the server (the
 * oldest pending gates, and the cases the dashboard names as most overdue).
 */
import { useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FileSearch, ShieldCheck, UserRoundX } from "lucide-react";
import { useSession } from "@/App";
import { STEP_BY_N } from "@/lib/spine";
import { daysSince } from "@/lib/logic";
import { useRowSignals } from "@/lib/signals";
import { useCasePage, useDashboard } from "@/lib/useRead";
import { Avatar, EmptyState, Panel, SeverityChip, StatStrip, type Stat, PageHeader, PageSkeleton, ReadError, ListSkeleton } from "@/lib/ui";
import { StageFlow } from "./sections/StageFlow";
import { CounsellorLoad } from "./sections/CounsellorLoad";
import { PerformanceSection } from "./sections/PerformanceSection";
import { greeting } from "./greeting";
import { downloadText, overviewCsv } from "./exportOverview";
import { EVENTS } from "@/lib/audit";

export function TeamLeaderHome() {
  const { users, user, snap, go, can, audit } = useSession();
  const config = snap.org.config;
  const dash = useDashboard();
  const d = dash.data;
  const [stage, setStage] = useState<string | undefined>();
  const pending = useCasePage({ gate: "pending", sort: "gate" }, 8);
  const urgent = useCasePage(d && d.urgent.length ? { ids: d.urgent, sort: "urgency" } : null, 25);
  const urgentSignals = useRowSignals(urgent.rows);
  const counsellors = useMemo(() => Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active), [users]);
  if (!user) return null;
  if (!d) return dash.error ? <ReadError error={dash.error} onRetry={dash.reload} /> : <PageSkeleton variant="dashboard" label="Loading the team position" />;

  const waiting = d.open.gatesPending;
  const oldest = pending.rows[0]?.gatePendingAt;
  const stats: Stat[] = [
    { id: "gates", label: "Awaiting my decision", icon: <ShieldCheck aria-hidden />, value: waiting, tone: waiting ? "info" : "neutral", sub: waiting && oldest ? `oldest ${daysSince(oldest)}d ago` : "queue is clear", onClick: can("gate.write") ? () => go({ page: "approvals" }) : undefined },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: d.open.breached, tone: d.open.breached ? "bad" : "ok", sub: `${d.open.dueSoon} due within the window`, onClick: can("escalation.view") ? () => go({ page: "escalations" }) : undefined },
    { id: "unassigned", label: "Awaiting counsellor", icon: <UserRoundX aria-hidden />, value: d.open.unassigned, tone: d.open.unassigned ? "warn" : "neutral", sub: "unassigned open cases", onClick: () => go({ page: "cases" }) },
    { id: "docs", label: "Documents to review", icon: <FileSearch aria-hidden />, value: d.open.docsToReview, tone: d.open.docsToReview ? "warn" : "neutral", sub: "across the team" },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{config.orgName} · {d.open.total.toLocaleString()} open case{d.open.total === 1 ? "" : "s"} · {waiting} decision{waiting === 1 ? "" : "s"} waiting on you</>} actions={<><button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">All cases <ArrowRight aria-hidden /></button></>} />
      <StatStrip stats={stats} label="Team position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Awaiting my decision" action={waiting > 8 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "approvals" })}>All {waiting}</button> : undefined}>
            {pending.error ? <ReadError error={pending.error} onRetry={pending.reload} /> : pending.loading ? <ListSkeleton rows={3} label="Loading decisions" /> : pending.rows.length === 0 ? <EmptyState glyph="shield" title="No gates waiting" reason="Counsellors submit financial verification (16) and visa file (19) gates here for your decision." /> : (
              <ul className="queue" role="list">
                {pending.rows.map((s) => {
                  const owner = s.counsellorId ? users[s.counsellorId] : undefined;
                  const gate = s.gatePending ?? 16;
                  const age = s.gatePendingAt ? daysSince(s.gatePendingAt) : 0;
                  return (
                    <li key={s.id} className="queue-row">
                      <Avatar name={s.studentName} size={32} />
                      <span className="queue-body">
                        <span className="flex aic g2 wrap"><button type="button" className="row-btn ui small" onClick={() => go({ page: "case", caseId: s.id, step: gate })}>{s.ref}</button><span className="ui small ink2 truncate">{s.studentName}</span></span>
                        <span className="xs muted">{STEP_BY_N[gate].title}{s.gatePendingRound ? ` · round ${s.gatePendingRound}` : ""}{owner ? ` · ${owner.name}` : ""}</span>
                      </span>
                      <SeverityChip severity={age >= 3 ? "warn" : "info"}>{age === 0 ? "Today" : `${age}d`}</SeverityChip>
                      {can("gate.write") && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "approvals", id: `case:${s.id}` })}>Review</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {can("escalation.view") && (
            <Panel title="Service-level exposure" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "escalations" })}>Escalations <ArrowRight aria-hidden /></button>}>
              {d.urgent.length === 0 ? <EmptyState compact glyph="check" title="No breaches" reason="Cases within their service levels do not appear here." /> : urgent.loading ? <ListSkeleton rows={2} label="Loading breaches" /> : (
                <ul className="esc-strip" role="list">
                  {urgent.rows.slice(0, 6).map((r) => {
                    const worst = [...(urgentSignals.get(r.id)?.flags ?? [])].filter((f) => f.state === "breached").sort((a, b) => a.days - b.days)[0];
                    if (!worst) return null;
                    return <li key={r.id}><button type="button" className="esc-chip" onClick={() => go({ page: "case", caseId: r.id, step: worst.step })}><span className="ui strong">{r.ref}</span><span className="muted"> · {worst.label} · </span><span className="bad">{-worst.days}d overdue</span></button></li>;
                  })}
                </ul>
              )}
            </Panel>
          )}
        </div>
        <div className="home-side">
          <Panel title="Open cases by stage">
            <StageFlow byStage={d.byStage} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} />
          </Panel>
          <Panel title="Counsellor load">
            <CounsellorLoad counsellors={counsellors} load={d.counsellors} />
          </Panel>
        </div>
        <PerformanceSection dashboard={d} canRead={can("analytics.read")} canDownload={can("analytics.download")} onExport={() => { downloadText("lpl-overview.csv", overviewCsv(d)); void audit(EVENTS.overviewExported()); }} scope="team" />
      </div>
    </div>
  );
}

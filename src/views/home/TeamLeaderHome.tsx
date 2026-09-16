/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The Team Leader's home: decisions waiting on me, exposure, the team's flow and load.
 */
import { useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FileSearch, ShieldCheck, UserRoundX } from "lucide-react";
import { useSession } from "@/App";
import { inCaseScope } from "@/lib/rbac";
import { STEP_BY_N } from "@/lib/spine";
import { daysSince, latestGate } from "@/lib/logic";
import { useCaseSignals } from "@/lib/signals";
import { Avatar, EmptyState, Panel, SeverityChip, StatStrip, type Stat, PageHeader } from "@/lib/ui";
import { StageFlow } from "./sections/StageFlow";
import { CounsellorLoad } from "./sections/CounsellorLoad";
import { PerformanceSection } from "./sections/PerformanceSection";
import { greeting } from "./greeting";
import { downloadText, overviewCsv } from "./exportOverview";
import { EVENTS } from "@/lib/audit";

export function TeamLeaderHome() {
  const { cases, users, user, snap, go, can, audit } = useSession();
  const config = snap.org.config;
  const signals = useCaseSignals();
  const [stage, setStage] = useState<string | undefined>();
  const scoped = useMemo(() => (user ? [...signals.values()].filter((s) => cases[s.id] && inCaseScope(config, user, cases[s.id])) : []), [signals, user, cases, config]);
  const open = scoped.filter((s) => s.status === "open");
  const pending = useMemo(() => open.flatMap((s) => ([16, 19] as const).flatMap((g) => { const l = latestGate(cases[s.id], g); return l?.status === "pending" ? [{ s, g: l }] : []; })).sort((a, b) => a.g.submittedAt.localeCompare(b.g.submittedAt)), [open, cases]);
  const breaches = open.filter((s) => s.breached > 0).sort((a, b) => Math.min(...a.flags.map((f) => f.days)) - Math.min(...b.flags.map((f) => f.days)));
  const overdueClocks = open.reduce((n, s) => n + s.breached, 0);
  const unassigned = open.filter((s) => !s.counsellorId).length;
  const docs = open.reduce((n, s) => n + s.docsToReview, 0);
  const counsellors = useMemo(() => Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active), [users]);
  const scopedCases = useMemo(() => scoped.map((s) => cases[s.id]).filter(Boolean), [scoped, cases]);
  if (!user) return null;

  const stats: Stat[] = [
    { id: "gates", label: "Awaiting my decision", icon: <ShieldCheck aria-hidden />, value: pending.length, tone: pending.length ? "info" : "neutral", sub: pending.length ? `oldest ${daysSince(pending[0].g.submittedAt)}d ago` : "queue is clear", onClick: can("gate.write") ? () => go({ page: "approvals" }) : undefined },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: overdueClocks, tone: overdueClocks ? "bad" : "ok", sub: `${open.reduce((n, s) => n + s.dueSoon, 0)} due within the window`, onClick: can("escalation.view") ? () => go({ page: "escalations" }) : undefined },
    { id: "unassigned", label: "Awaiting counsellor", icon: <UserRoundX aria-hidden />, value: unassigned, tone: unassigned ? "warn" : "neutral", sub: "unassigned open cases", onClick: () => go({ page: "cases" }) },
    { id: "docs", label: "Documents to review", icon: <FileSearch aria-hidden />, value: docs, tone: docs ? "warn" : "neutral", sub: "across the team" },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{config.orgName} · {open.length} open case{open.length === 1 ? "" : "s"} · {pending.length} decision{pending.length === 1 ? "" : "s"} waiting on you</>} actions={<><button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">All cases <ArrowRight aria-hidden /></button></>} />
      <StatStrip stats={stats} label="Team position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Awaiting my decision" action={pending.length > 8 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "approvals" })}>All {pending.length}</button> : undefined}>
            {pending.length === 0 ? <EmptyState glyph="shield" title="No gates waiting" reason="Counsellors submit financial verification (16) and visa file (19) gates here for your decision." /> : (
              <ul className="queue" role="list">
                {pending.slice(0, 8).map(({ s, g }) => {
                  const owner = s.counsellorId ? users[s.counsellorId] : undefined;
                  const age = daysSince(g.submittedAt);
                  return (
                    <li key={g.id} className="queue-row">
                      <Avatar name={s.name} size={32} />
                      <span className="queue-body">
                        <span className="flex aic g2 wrap"><button type="button" className="row-btn ui small" onClick={() => go({ page: "case", caseId: s.id, step: g.gate })}>{s.ref}</button><span className="ui small ink2 truncate">{s.name}</span></span>
                        <span className="xs muted">{STEP_BY_N[g.gate].title} · round {g.round}{owner ? ` · ${owner.name}` : ""}</span>
                      </span>
                      <SeverityChip severity={age >= 3 ? "warn" : "info"}>{age === 0 ? "Today" : `${age}d`}</SeverityChip>
                      {can("gate.write") && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "approvals", id: g.id })}>Review</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {can("escalation.view") && (
            <Panel title="Service-level exposure" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "escalations" })}>Escalations <ArrowRight aria-hidden /></button>}>
              {breaches.length === 0 ? <EmptyState compact glyph="check" title="No breaches" reason="Cases within their service levels do not appear here." /> : (
                <ul className="esc-strip" role="list">
                  {breaches.slice(0, 6).map((s) => {
                    const worst = [...s.flags].filter((f) => f.state === "breached").sort((a, b) => a.days - b.days)[0];
                    return <li key={s.id}><button type="button" className="esc-chip" onClick={() => go({ page: "case", caseId: s.id, step: worst.step })}><span className="ui strong">{s.ref}</span><span className="muted"> · {worst.label} · </span><span className="bad">{-worst.days}d overdue</span></button></li>;
                  })}
                </ul>
              )}
            </Panel>
          )}
          <PerformanceSection cases={scopedCases} config={config} canRead={can("analytics.read")} canDownload={can("analytics.download")} onExport={() => { downloadText("lpl-overview.csv", overviewCsv(scoped)); void audit(EVENTS.overviewExported()); }} scope="team" />
        </div>
        <div className="home-side">
          <Panel title="Open cases by stage">
            <StageFlow signals={scoped} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} />
          </Panel>
          <Panel title="Counsellor load">
            <CounsellorLoad counsellors={counsellors} signals={scoped} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

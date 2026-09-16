/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The counsellor's home: what needs me now, where my caseload stands, what moved.
 */
import { useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FileSearch, FolderOpen, ShieldCheck } from "lucide-react";
import { useSession } from "@/App";
import { inCaseScope } from "@/lib/rbac";
import { compareSeverity, useCaseSignals, type AttentionItem } from "@/lib/signals";
import { Panel, StatStrip, type Stat, PageHeader } from "@/lib/ui";
import { AttentionQueue } from "./sections/AttentionQueue";
import { StageFlow } from "./sections/StageFlow";
import { MovementFeed, type Movement } from "./sections/MovementFeed";
import { PerformanceSection } from "./sections/PerformanceSection";
import { greeting } from "./greeting";

export function CounsellorHome() {
  const { cases, user, snap, go } = useSession();
  const config = snap.org.config;
  const signals = useCaseSignals();
  const [stage, setStage] = useState<string | undefined>();
  const mine = useMemo(() => (user ? [...signals.values()].filter((s) => s.counsellorId === user.id && cases[s.id] && inCaseScope(config, user, cases[s.id])) : []), [signals, user, cases, config]);
  const open = mine.filter((s) => s.status === "open");
  const breaches = open.reduce((n, s) => n + s.breached, 0);
  const dueSoon = open.reduce((n, s) => n + s.dueSoon, 0);
  const gates = open.filter((s) => s.gatePending).length;
  const returned = open.filter((s) => s.gateReturned).length;
  const docs = open.reduce((n, s) => n + s.docsToReview, 0);
  const attention: AttentionItem[] = useMemo(() => [...mine].sort(compareSeverity).flatMap((s) => s.attention), [mine]);
  const recent: Movement[] = useMemo(() => mine.flatMap((s) => (cases[s.id]?.events ?? []).slice(0, 3).map((e) => ({ id: e.id, at: e.at, text: e.text, by: e.byName, caseId: s.id, caseRef: s.ref }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8), [mine, cases]);
  const myCases = useMemo(() => mine.map((s) => cases[s.id]).filter(Boolean), [mine, cases]);
  if (!user) return null;

  const stats: Stat[] = [
    { id: "active", label: "Active cases", icon: <FolderOpen aria-hidden />, value: open.length, sub: `${mine.length} assigned in total`, onClick: () => go({ page: "cases" }) },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: breaches, tone: breaches ? "bad" : "ok", sub: dueSoon ? `${dueSoon} due within the window` : "nothing due soon" },
    { id: "gates", label: "Awaiting Team Leader", icon: <ShieldCheck aria-hidden />, value: gates, tone: gates ? "info" : "neutral", sub: returned ? `${returned} returned to address` : "gates 16 and 19", onClick: () => go({ page: "cases", id: "attention" }) },
    { id: "docs", label: "Documents to review", icon: <FileSearch aria-hidden />, value: docs, tone: docs ? "warn" : "neutral", sub: docs ? "uploaded by students" : "nothing waiting" },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{open.length} open case{open.length === 1 ? "" : "s"}{attention.length ? ` · ${attention.length} thing${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} your attention` : " · nothing is waiting on you"}</>} actions={<><button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">My caseload <ArrowRight aria-hidden /></button></>} />
      <StatStrip stats={stats} label="Your position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Needs attention" action={attention.length > 12 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "cases", id: "attention" })}>All {attention.length}</button> : undefined}>
            <AttentionQueue items={attention} signals={signals} />
          </Panel>
          <PerformanceSection cases={myCases} config={config} canRead scope="mine" prefKey="lpl:pms:perf-mine" />
        </div>
        <div className="home-side">
          <Panel title="Caseload by stage">
            <StageFlow signals={mine} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} label="My open cases by stage" />
          </Panel>
          <Panel title="Recent activity on my cases">
            <MovementFeed items={recent} emptyReason="Steps, uploads and decisions on your cases appear here." />
          </Panel>
        </div>
      </div>
    </div>
  );
}

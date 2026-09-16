/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The administrator's home: the system's position, people and load, compliance, health,
 * and what moved.
 */
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FolderOpen, ShieldAlert, UserRoundX } from "lucide-react";
import { useSession } from "@/App";
import { ROLE_LABEL } from "@/lib/rbac";
import { useCaseSignals } from "@/lib/signals";
import { store } from "@/lib/store";
import type { AuditEntry } from "@/lib/types";
import { Panel, StatStrip, type Stat, PageHeader } from "@/lib/ui";
import { StageFlow } from "./sections/StageFlow";
import { CounsellorLoad } from "./sections/CounsellorLoad";
import { ComplianceStrip } from "./sections/ComplianceStrip";
import { SystemHealth } from "./sections/SystemHealth";
import { MovementFeed, type Movement } from "./sections/MovementFeed";
import { PerformanceSection } from "./sections/PerformanceSection";
import { enquiryDelta, greeting } from "./greeting";
import { downloadText, overviewCsv } from "./exportOverview";
import { EVENTS } from "@/lib/audit";

export function AdminHome() {
  const { cases, users, user, snap, go, can, audit } = useSession();
  const config = snap.org.config;
  const signals = useCaseSignals();
  const [stage, setStage] = useState<string | undefined>();
  const all = useMemo(() => [...signals.values()], [signals]);
  const allCases = useMemo(() => Object.values(cases), [cases]);
  const open = all.filter((s) => s.status === "open");
  const unassigned = open.filter((s) => !s.counsellorId).length;
  const overdue = open.reduce((n, s) => n + s.breached, 0);
  const retentionOverdue = all.filter((s) => s.retention === "overdue").length;
  const delta = useMemo(() => enquiryDelta(allCases), [allCases]);
  const counsellors = useMemo(() => Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active), [users]);
  const mayAudit = can("audit.read");
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  // The audit log is not in the snapshot; re-read the newest page when the workspace moves.
  useEffect(() => {
    if (!mayAudit) return;
    let live = true;
    store.auditPage({ limit: 8 }).then((rows) => { if (live) setRecent(rows); }).catch(() => undefined);
    return () => { live = false; };
  }, [mayAudit, snap.cases.rev, snap.org.config.rev, snap.audit.rev, snap.prompts.rev]);
  const activity: Movement[] = useMemo(() => recent.map((e) => ({ id: e.id, at: e.at, text: `${e.summary ?? e.action}${e.entityLabel ?? e.target ? ` — ${e.entityLabel ?? e.target}` : ""}`, by: `${e.actorName} · ${ROLE_LABEL[e.actorRole] ?? e.actorRole}` })), [recent]);
  if (!user) return null;

  const stats: Stat[] = [
    { id: "open", label: "Open cases", icon: <FolderOpen aria-hidden />, value: open.length, delta: { value: delta.last - delta.prev, label: "enquiries vs prior 30 days" }, onClick: () => go({ page: "cases" }) },
    { id: "unassigned", label: "Awaiting counsellor", icon: <UserRoundX aria-hidden />, value: unassigned, tone: unassigned ? "warn" : "neutral", sub: "unassigned open cases", onClick: () => go({ page: "cases" }) },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: overdue, tone: overdue ? "bad" : "ok", sub: `${open.reduce((n, s) => n + s.dueSoon, 0)} due within the window`, onClick: () => go({ page: "escalations" }) },
    { id: "retention", label: "Retention overdue", icon: <ShieldAlert aria-hidden />, value: retentionOverdue, tone: retentionOverdue ? "bad" : "ok", sub: "records past their disposal date", onClick: () => go({ page: "dataprotection", id: "retention" }) },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{config.orgName} · live position across {all.length} case{all.length === 1 ? "" : "s"}</>} actions={<>
          {can("case.write") && <button type="button" onClick={() => go({ page: "cases", id: "new" })} className="btn btn-primary">Create student</button>}
          <button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">Cases <ArrowRight aria-hidden /></button>
        </>} />
      <StatStrip stats={stats} label="System position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Open cases by stage">
            <StageFlow signals={all} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} />
          </Panel>
          <Panel title="Counsellor load" action={can("staff.read") ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "staff" })}>Staff <ArrowRight aria-hidden /></button> : undefined}>
            <CounsellorLoad counsellors={counsellors} signals={all} />
          </Panel>
          <PerformanceSection cases={allCases} config={config} canRead={can("analytics.read")} canDownload={can("analytics.download")} onExport={() => { downloadText("lpl-overview.csv", overviewCsv(all)); void audit(EVENTS.overviewExported()); }} scope="team" />
        </div>
        <div className="home-side">
          {can("dataprotection.view") && <section aria-label="Compliance"><h2 className="side-h">Compliance</h2><ComplianceStrip cases={allCases} config={config} /></section>}
          <Panel title="System">
            <SystemHealth />
          </Panel>
          {can("audit.read") && (
            <Panel title="Recent activity" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "audit" })}>Audit log <ArrowRight aria-hidden /></button>}>
              <MovementFeed items={activity} emptyReason="Actions are recorded as staff and students use the system." />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

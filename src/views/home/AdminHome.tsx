/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The administrator's home: the system's position, people and load, compliance, health,
 * and what moved. Every figure is the dashboard aggregate the database computes (one shared,
 * cached answer for the roles that see every case), so this page costs the same at a hundred
 * cases as at a million.
 */
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FolderOpen, ShieldAlert, UserRoundX } from "lucide-react";
import { useSession } from "@/App";
import { ROLE_LABEL } from "@/lib/rbac";
import { store } from "@/lib/store";
import { useDashboard, useReadVersion } from "@/lib/useRead";
import type { AuditEntry } from "@/lib/types";
import { Panel, StatStrip, type Stat, PageHeader, PageSkeleton, ReadError } from "@/lib/ui";
import { StageFlow } from "./sections/StageFlow";
import { CounsellorLoad } from "./sections/CounsellorLoad";
import { ComplianceStrip } from "./sections/ComplianceStrip";
import { SystemHealth } from "./sections/SystemHealth";
import { MovementFeed, type Movement } from "./sections/MovementFeed";
import { PerformanceSection } from "./sections/PerformanceSection";
import { greeting } from "./greeting";
import { downloadText, overviewCsv } from "./exportOverview";
import { EVENTS } from "@/lib/audit";

export function AdminHome() {
  const { users, user, snap, go, can, audit } = useSession();
  const config = snap.org.config;
  const dash = useDashboard();
  const d = dash.data;
  const [stage, setStage] = useState<string | undefined>();
  const counsellors = useMemo(() => Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active), [users]);
  const mayAudit = can("audit.read");
  const version = useReadVersion();
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  // The audit log is not in the snapshot; re-read the newest page when the workspace moves.
  useEffect(() => {
    if (!mayAudit) return;
    let live = true;
    store.auditPage({ limit: 8 }).then((rows) => { if (live) setRecent(rows); }).catch(() => undefined);
    return () => { live = false; };
  }, [mayAudit, version, snap.audit.rev]);
  const activity: Movement[] = useMemo(() => recent.map((e) => ({ id: e.id, at: e.at, text: `${e.summary ?? e.action}${e.entityLabel ?? e.target ? ` — ${e.entityLabel ?? e.target}` : ""}`, by: `${e.actorName} · ${ROLE_LABEL[e.actorRole] ?? e.actorRole}` })), [recent]);
  if (!user) return null;
  if (!d) return dash.error ? <ReadError error={dash.error} onRetry={dash.reload} /> : <PageSkeleton variant="dashboard" label="Loading the overview" />;

  const stats: Stat[] = [
    { id: "open", label: "Open cases", icon: <FolderOpen aria-hidden />, value: d.open.total, delta: { value: d.enquiries.last30 - d.enquiries.prev30, label: "enquiries vs prior 30 days" }, onClick: () => go({ page: "cases" }) },
    { id: "unassigned", label: "Awaiting counsellor", icon: <UserRoundX aria-hidden />, value: d.open.unassigned, tone: d.open.unassigned ? "warn" : "neutral", sub: "unassigned open cases", onClick: () => go({ page: "cases" }) },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: d.open.breached, tone: d.open.breached ? "bad" : "ok", sub: `${d.open.dueSoon} due within the window`, onClick: () => go({ page: "escalations" }) },
    { id: "retention", label: "Retention overdue", icon: <ShieldAlert aria-hidden />, value: d.retention.overdue, tone: d.retention.overdue ? "bad" : "ok", sub: "records past their disposal date", onClick: () => go({ page: "dataprotection", id: "retention" }) },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{config.orgName} · live position across {d.total.toLocaleString()} case{d.total === 1 ? "" : "s"}</>} actions={<>
          {can("case.write") && <button type="button" onClick={() => go({ page: "cases", id: "new" })} className="btn btn-primary">Create student</button>}
          <button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">Cases <ArrowRight aria-hidden /></button>
        </>} />
      <StatStrip stats={stats} label="System position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Open cases by stage">
            <StageFlow byStage={d.byStage} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} />
          </Panel>
          <Panel title="Counsellor load" action={can("staff.read") ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "staff" })}>Staff <ArrowRight aria-hidden /></button> : undefined}>
            <CounsellorLoad counsellors={counsellors} load={d.counsellors} />
          </Panel>
        </div>
        <div className="home-side">
          {can("dataprotection.view") && <section aria-label="Compliance"><h2 className="side-h">Compliance</h2><ComplianceStrip dashboard={d} config={config} /></section>}
          <Panel title="System">
            <SystemHealth />
          </Panel>
          {can("audit.read") && (
            <Panel title="Recent activity" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "audit" })}>Audit log <ArrowRight aria-hidden /></button>}>
              <MovementFeed items={activity} emptyReason="Actions are recorded as staff and students use the system." />
            </Panel>
          )}
        </div>
        <PerformanceSection dashboard={d} canRead={can("analytics.read")} canDownload={can("analytics.download")} onExport={() => { downloadText("lpl-overview.csv", overviewCsv(d)); void audit(EVENTS.overviewExported()); }} scope="team" />
      </div>
    </div>
  );
}

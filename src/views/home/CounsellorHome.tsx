/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The counsellor's home: what needs me now, where my caseload stands, what moved. The figures
 * are the dashboard over the counsellor's own cases; the queue is the head the dashboard names
 * (worst first), and recent activity is the most recently updated open cases.
 */
import { useMemo, useState } from "react";
import { AlarmClock, ArrowRight, FileSearch, FolderOpen, ShieldCheck } from "lucide-react";
import { useSession } from "@/App";
import { useRowSignals, type AttentionItem } from "@/lib/signals";
import { useCaseCount, useCasePage, useDashboard } from "@/lib/useRead";
import { Panel, StatStrip, type Stat, PageHeader, PageSkeleton, ReadError, ListSkeleton } from "@/lib/ui";
import { AttentionQueue } from "./sections/AttentionQueue";
import { StageFlow } from "./sections/StageFlow";
import { MovementFeed, type Movement } from "./sections/MovementFeed";
import { PerformanceSection } from "./sections/PerformanceSection";
import { greeting } from "./greeting";

export function CounsellorHome() {
  const { users, user, go } = useSession();
  const dash = useDashboard();
  const d = dash.data;
  const [stage, setStage] = useState<string | undefined>();
  const head = useCasePage(d && d.attention.length ? { ids: d.attention, sort: "severity" } : null, 25);
  const signals = useRowSignals(head.rows);
  const flagged = useCaseCount(d ? { attention: true } : null, 1000);
  const recentRows = useCasePage({ status: ["open"] }, 8);
  const attention: AttentionItem[] = useMemo(() => head.rows.flatMap((r) => signals.get(r.id)?.attention ?? []), [head.rows, signals]);
  const recent: Movement[] = useMemo(() => recentRows.rows.filter((r) => r.lastEventAt).map((r) => ({
    id: `${r.id}:${r.lastEventAt}`, at: r.lastEventAt!, text: r.lastEventText ?? "Case updated",
    by: (r.lastEventBy && users[r.lastEventBy]?.name) || (r.lastEventBy && r.lastEventBy === r.studentUserId ? r.studentName : "Lyceum Placements"),
    caseId: r.id, caseRef: r.ref,
  })), [recentRows.rows, users]);
  if (!user) return null;
  if (!d) return dash.error ? <ReadError error={dash.error} onRetry={dash.reload} /> : <PageSkeleton variant="dashboard" label="Loading your caseload" />;

  const open = d.open.total;
  const nFlagged = flagged.data ?? attention.length;
  const stats: Stat[] = [
    { id: "active", label: "Active cases", icon: <FolderOpen aria-hidden />, value: open, sub: `${d.total} assigned in total`, onClick: () => go({ page: "cases" }) },
    { id: "overdue", label: "Overdue clocks", icon: <AlarmClock aria-hidden />, value: d.open.breached, tone: d.open.breached ? "bad" : "ok", sub: d.open.dueSoon ? `${d.open.dueSoon} due within the window` : "nothing due soon" },
    { id: "gates", label: "Awaiting Team Leader", icon: <ShieldCheck aria-hidden />, value: d.open.gatesPending, tone: d.open.gatesPending ? "info" : "neutral", sub: d.open.gatesReturned ? `${d.open.gatesReturned} returned to address` : "gates 16 and 19", onClick: () => go({ page: "cases", id: "attention" }) },
    { id: "docs", label: "Documents to review", icon: <FileSearch aria-hidden />, value: d.open.docsToReview, tone: d.open.docsToReview ? "warn" : "neutral", sub: d.open.docsToReview ? "uploaded by students" : "nothing waiting" },
  ];

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user.name)} context={<>{open} open case{open === 1 ? "" : "s"}{nFlagged ? ` · ${nFlagged >= 1000 ? "1,000+" : nFlagged} case${nFlagged === 1 ? "" : "s"} need${nFlagged === 1 ? "s" : ""} your attention` : " · nothing is waiting on you"}</>} actions={<><button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">My caseload <ArrowRight aria-hidden /></button></>} />
      <StatStrip stats={stats} label="Your position" />
      <div className="home">
        <div className="home-main">
          <Panel title="Needs attention" action={nFlagged > head.rows.length ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "cases", id: "attention" })}>All {nFlagged >= 1000 ? "1,000+" : nFlagged}</button> : undefined}>
            {head.error ? <ReadError error={head.error} onRetry={head.reload} /> : head.loading ? <ListSkeleton rows={3} label="Loading what needs attention" /> : <AttentionQueue items={attention} signals={signals} />}
          </Panel>
          <PerformanceSection dashboard={d} canRead scope="mine" prefKey="lpl:pms:perf-mine" />
        </div>
        <div className="home-side">
          <Panel title="Caseload by stage">
            <StageFlow byStage={d.byStage} selected={stage} onSelect={(id) => { setStage(id === stage ? undefined : id); if (id !== stage) go({ page: "cases", id: `stage:${id}` }); }} label="My open cases by stage" />
          </Panel>
          <Panel title="Recent activity on my open cases">
            {recentRows.loading ? <ListSkeleton rows={3} label="Loading recent activity" /> : <MovementFeed items={recent} emptyReason="Steps, uploads and decisions on your cases appear here." />}
          </Panel>
        </div>
      </div>
    </div>
  );
}

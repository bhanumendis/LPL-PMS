/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Approvals (Team Leader gates) and Escalations. Both read pages from the server: the pending
 * queue and the flagged cases as case summaries, decisions from the gate register, figures
 * from the dashboard and gate statistics. A case document is fetched only when a submission is
 * opened for review.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Check, RotateCcw, AlarmClock, PauseCircle, ExternalLink } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { STEP_BY_N } from "@/lib/spine";
import { decideGate, fmtDateTime, fmtDate, docsForStep, latestGate, daysSince } from "@/lib/logic";
import { useRowSignals } from "@/lib/signals";
import { useCase, useCasePage, useDashboard, useGatesPage, useGateStats } from "@/lib/useRead";
import { Panel, Pill, EmptyState, Modal, useToast, statusTone, Avatar, TextArea, Notice, PageHeader, StatStrip, ListSkeleton, ReadError, PageFooter } from "@/lib/ui";
import { Ring } from "@/lib/charts";
import type { GateSubmission } from "@/lib/types";
import { EVENTS } from "@/lib/audit";

export function ApprovalsPage() {
  const { users, go, can, route } = useSession();
  const mayDecide = can("gate.write");
  // Deep link: #/approvals/case:{caseId} opens that case's pending submission for review.
  const [targetCase, setTargetCase] = useState<string | null>(() => (mayDecide && route.id?.startsWith("case:") ? route.id.slice(5) : null));
  useEffect(() => { if (mayDecide && route.id?.startsWith("case:")) setTargetCase(route.id.slice(5)); }, [route.id, mayDecide]);

  const queue = useCasePage({ gate: "pending", sort: "gate" });
  const history = useGatesPage({ status: "decided" }, 30);
  const statsQ = useGateStats();
  const st = statsQ.data;
  const firstTime = st && st.decided ? Math.round((st.firstRoundApproved * 100) / st.decided) : null;
  const oldest = queue.rows[0]?.gatePendingAt;
  const waiting = st?.pending ?? queue.rows.length;

  return (
    <div className="stack">
      <PageHeader title="Approvals" context="Team Leader gates — financial verification (step 16) and visa file finalisation (step 19)." />
      <StatStrip label="Approval position" stats={[
        { id: "waiting", label: "Awaiting decision", icon: <ShieldCheck aria-hidden />, value: waiting, tone: waiting ? "info" : "neutral", sub: waiting && oldest ? `oldest ${daysSince(oldest)}d ago` : "queue is clear" },
        { id: "decided", label: "Decisions recorded", value: st?.decided ?? "—", sub: st ? `${st.approved} approved · ${st.decided - st.approved} returned` : "" },
        { id: "first", label: "First-round approval", value: firstTime === null ? "—" : `${firstTime}%`, tone: firstTime !== null && firstTime >= 80 ? "ok" : "neutral", sub: "approved without a return" },
        { id: "turn", label: "Average turnaround", value: st?.avgTurnaroundDays == null ? "—" : `${st.avgTurnaroundDays}d`, sub: "submission to decision" },
      ]} />
      <Panel title={`Awaiting decision (${waiting})`} flush>
        {queue.error ? <div className="panel-b"><ReadError error={queue.error} onRetry={queue.reload} /></div>
          : queue.loading ? <div className="panel-b"><ListSkeleton rows={3} label="Loading the queue" /></div>
          : queue.rows.length === 0 ? <div className="panel-b"><EmptyState glyph="shield" title="Nothing awaiting approval" reason="Counsellors submit financial and visa files here for your decision." /></div> : (
          <ul>
            {queue.rows.map((c) => {
              const owner = c.counsellorId ? users[c.counsellorId] : undefined;
              const gate = c.gatePending ?? 16;
              return (
                <li key={c.id} className="flex wrap g3" style={{ padding: "16px 20px", borderBottom: "1px solid var(--hair)" }}>
                  <div className="grow" style={{ minWidth: 240 }}>
                    <div className="flex wrap aic g2">
                      <Pill tone="info" icon={<ShieldCheck aria-hidden />}>Gate {gate}</Pill>
                      <button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id, step: gate })}>{c.ref}</button>
                      <span className="ui strong">{c.studentName}</span>
                      <span className="ui xs muted">{c.gatePendingRound ? `· round ${c.gatePendingRound} ` : ""}{c.gatePendingAt ? `· submitted ${fmtDateTime(c.gatePendingAt)} · waiting ${daysSince(c.gatePendingAt)}d` : ""}</span>
                    </div>
                    <p className="ui small ink2 mt1">{STEP_BY_N[gate].title}{owner ? ` · ${owner.name}` : ""}</p>
                  </div>
                  <div className="flex g1" style={{ alignItems: "flex-start" }}>
                    {mayDecide && <button type="button" className="btn btn-primary btn-sm" onClick={() => setTargetCase(c.id)}>Review</button>}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => go({ page: "case", caseId: c.id, step: gate })}><ExternalLink aria-hidden />Open case</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!queue.loading && !queue.error && <div className="panel-b"><PageFooter shown={queue.rows.length} total={st?.pending} hasMore={queue.hasMore} loadingMore={queue.loadingMore} onMore={queue.loadMore} noun="submissions" /></div>}
      </Panel>
      {/* Below the queue only once the queue is in: arriving rows would push it down (CLS). */}
      {!queue.loading && <Panel title="Decisions" flush>
        {history.error ? <div className="panel-b"><ReadError error={history.error} onRetry={history.reload} /></div>
          : history.loading ? <div className="panel-b"><ListSkeleton rows={3} label="Loading decisions" /></div>
          : history.rows.length === 0 ? <div className="panel-b"><EmptyState compact glyph="inbox" title="No decisions recorded yet" /></div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Case</th><th scope="col">Gate</th><th scope="col">Round</th><th scope="col">Decision</th><th scope="col">By</th><th scope="col">When</th><th scope="col">Suggestions</th></tr></thead>
              <tbody>
                {history.rows.map((g) => (
                  <tr key={`${g.caseId}/${g.id}`}>
                    <td><button type="button" className="row-btn" onClick={() => go({ page: "case", caseId: g.caseId, step: g.gate ?? undefined })}>{g.caseRef}</button>{g.studentName && <p className="sub">{g.studentName}</p>}</td>
                    <td>{g.gate ?? "—"}</td><td>{g.round ?? "—"}</td>
                    <td><Pill tone={statusTone(g.status ?? "")}>{g.status === "approved" ? "Approved" : "Returned"}</Pill></td>
                    <td>{g.decidedBy ? users[g.decidedBy]?.name ?? "—" : "—"}</td>
                    <td className="muted nowrap">{g.decidedAt ? fmtDateTime(g.decidedAt) : "—"}</td>
                    <td className="muted" style={{ maxWidth: 320 }}>{g.suggestions ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!history.loading && !history.error && <div className="panel-b"><PageFooter shown={history.rows.length} total={st?.decided} hasMore={history.hasMore} loadingMore={history.loadingMore} onMore={history.loadMore} noun="decisions" /></div>}
      </Panel>}

      {targetCase && <ReviewDialog caseId={targetCase} onClose={() => setTargetCase(null)} />}
    </div>
  );
}

/** One pending submission, with the case document fetched for its summary and visa documents. */
function ReviewDialog({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { cases, user, audit, can } = useSession();
  const toast = useToast();
  const { c, loading, error } = useCase(caseId, cases);
  const [decision, setDecision] = useState<"approve" | "return">("approve");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const g: GateSubmission | undefined = useMemo(() => {
    if (!c) return undefined;
    for (const gate of [16, 19] as const) { const l = latestGate(c, gate); if (l?.status === "pending") return l; }
    return undefined;
  }, [c]);

  const submit = async () => {
    if (!c || !g || !user) return;
    if (decision === "return" && !note.trim()) return;
    setBusy(true);
    try {
      await store.mutateCase(c.id, (x) => decideGate(x, g.id, decision === "approve", note.trim(), user));
      await audit(EVENTS.gateDecided(c, g.gate, decision === "approve", note.trim() || undefined, g.round));
      toast(decision === "approve" ? `${STEP_BY_N[g.gate].title} approved for ${c.ref}` : "Returned to the counsellor with suggestions");
      onClose();
    } catch { /* reported by the store */ } finally { setBusy(false); }
  };

  if (!c || !g) {
    return (
      <Modal open onClose={onClose} title="Review submission">
        {loading ? <ListSkeleton rows={2} label="Opening the submission" /> : <Notice tone="neutral">{error ?? "This case has no submission awaiting a decision."}</Notice>}
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }
  const summary = can("gate.read") ? String(c.steps[g.gate]?.values.summary ?? "") : "";
  const docs = docsForStep(c, 15);
  const acc = docs.filter((d) => d.status === "accepted").length;
  return (
    <Modal open onClose={onClose} title={`${STEP_BY_N[g.gate].title} — ${c.ref}`}>
      <div className="flex aic g2 mb3"><Avatar name={c.student.name} size={30} /><span className="ui strong">{c.student.name}</span><span className="ui xs muted">· round {g.round} · submitted {fmtDateTime(g.submittedAt)}</span></div>
      <div className="flex aic g3 mb3">
        <Ring pct={docs.length ? Math.round((acc / docs.length) * 100) : 0} size={58} stroke={6} small tone="info" label="Visa documents accepted" />
        <p className="xs muted">Visa file documents: {acc} accepted · {docs.filter((d) => d.status === "uploaded").length} unreviewed · {docs.filter((d) => d.status === "rejected").length} returned</p>
      </div>
      {summary && <div className="soft mb3" style={{ padding: 12, whiteSpace: "pre-wrap", fontSize: "var(--fs-sm)" }}>{summary}</div>}
      <div className="grid grid-2" role="radiogroup" aria-label="Decision">
        <button type="button" role="radio" aria-checked={decision === "approve"} onClick={() => setDecision("approve")} className={`btn btn-secondary ${decision === "approve" ? "on-ok" : ""}`}><Check aria-hidden />Approve</button>
        <button type="button" role="radio" aria-checked={decision === "return"} onClick={() => setDecision("return")} className={`btn btn-secondary ${decision === "return" ? "on-bad" : ""}`}><RotateCcw aria-hidden />Return with suggestions</button>
      </div>
      <div className="mt3"><TextArea label={decision === "approve" ? "Note (optional)" : "Suggestions for the counsellor"} required={decision === "return"} value={note} onChange={setNote} rows={4} /></div>
      <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className={decision === "approve" ? "btn btn-primary" : "btn btn-danger"} disabled={busy || (decision === "return" && !note.trim())} onClick={submit}>{busy ? "Saving…" : decision === "approve" ? "Approve gate" : "Return to counsellor"}</button></div>
    </Modal>
  );
}

export function EscalationsPage() {
  const { users, go, can } = useSession();
  const mayRead = can("escalation.read");
  const dash = useDashboard();
  const d = dash.data;
  // Cases with a clock breached or due soon, most overdue first; one row per clock.
  const clocks = useCasePage(mayRead ? { clock: "due", sort: "urgency" } : null);
  const signals = useRowSignals(clocks.rows);
  const rows = useMemo(() => clocks.rows.flatMap((c) => (signals.get(c.id)?.flags ?? []).filter((f) => f.state !== "ok").map((f) => ({ c, f }))).sort((a, b) => a.f.days - b.f.days), [clocks.rows, signals]);
  const returned = useCasePage({ gate: "returned" }, 25);
  const holds = useCasePage({ holdReview: true }, 25);
  const breached = d?.open.breached ?? 0;
  const dueSoon = d?.open.dueSoon ?? 0;
  return (
    <div className="stack">
      <PageHeader title="Escalations" context="Service level breaches, cases approaching a deadline, returned gates and holds due for review." />
      <StatStrip label="Escalation position" stats={[
        { id: "breached", label: "Breached", icon: <AlarmClock aria-hidden />, value: breached, tone: breached ? "bad" : "ok", sub: "service level clocks overdue" },
        { id: "soon", label: "Due soon", value: dueSoon, tone: dueSoon ? "warn" : "neutral", sub: "inside the reminder window" },
        { id: "returned", label: "Returned gates", value: d?.open.gatesReturned ?? 0, tone: d?.open.gatesReturned ? "bad" : "neutral", sub: "awaiting the counsellor" },
        { id: "holds", label: "Holds to review", icon: <PauseCircle aria-hidden />, value: holds.rows.length >= 25 && holds.hasMore ? "25+" : holds.rows.length, tone: holds.rows.length ? "warn" : "neutral", sub: "review date has passed" },
      ]} />
      <Panel title={`Service levels (${breached + dueSoon})`} flush>
        {!mayRead ? <div className="panel-b"><Notice tone="neutral">Your role sees the counts. The escalation.read permission opens the case list.</Notice></div>
          : clocks.error ? <div className="panel-b"><ReadError error={clocks.error} onRetry={clocks.reload} /></div>
          : clocks.loading ? <div className="panel-b"><ListSkeleton label="Loading service levels" /></div>
          : rows.length === 0 ? <div className="panel-b"><EmptyState glyph="check" title="No service level exposure" reason="Course Information Sheet deadlines, offer lapse dates and follow-ups appear here as they fall due." /></div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Case</th><th scope="col">Counsellor</th><th scope="col">Clock</th><th scope="col">Due</th><th scope="col">Position</th><th scope="col">Step</th></tr></thead>
              <tbody>
                {rows.map(({ c, f }) => (
                  <tr key={c.id + f.id} className="row-link" onClick={() => go({ page: "case", caseId: c.id, step: f.step })}>
                    <td><button type="button" className="row-btn" onClick={(e) => { e.stopPropagation(); go({ page: "case", caseId: c.id, step: f.step }); }}>{c.ref}</button><p className="sub">{c.studentName}</p></td>
                    <td>{c.counsellorId ? users[c.counsellorId]?.name ?? "—" : <span className="muted">Unassigned</span>}</td>
                    <td>{f.label}</td>
                    <td className="nowrap">{fmtDate(f.due.toISOString())}</td>
                    <td><Pill tone={statusTone(f.state)}>{f.days < 0 ? `${-f.days} day${f.days === -1 ? "" : "s"} overdue` : f.days === 0 ? "Due today" : `${f.days} day${f.days === 1 ? "" : "s"} left`}</Pill></td>
                    <td>{f.step}. {STEP_BY_N[f.step].title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mayRead && !clocks.loading && !clocks.error && <div className="panel-b"><PageFooter shown={clocks.rows.length} hasMore={clocks.hasMore} loadingMore={clocks.loadingMore} onMore={clocks.loadMore} noun="cases" /></div>}
      </Panel>
      {/* Below the service levels only once they are in: arriving rows would push these down. */}
      {!clocks.loading && <div className="grid grid-2 stagger">
        <Panel title={`Returned gates awaiting counsellor (${d?.open.gatesReturned ?? returned.rows.length})`} flush>
          {returned.loading ? <div className="panel-b"><ListSkeleton rows={2} label="Loading returned gates" /></div> : returned.rows.length === 0 ? <div className="panel-b"><EmptyState compact glyph="check" title="No returned gates" /></div> : (
            <ul>{returned.rows.map((c) => <li key={c.id} className="list-row flex aic jcb g2 wrap"><span><button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id, step: c.gateReturned ?? undefined })}>{c.ref}</button> · gate {c.gateReturned} · {c.studentName}</span><span className="muted ui xs">{c.counsellorId ? users[c.counsellorId]?.name : "Unassigned"}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title="Holds due for review" flush>
          {holds.loading ? <div className="panel-b"><ListSkeleton rows={2} label="Loading holds" /></div> : holds.rows.length === 0 ? <div className="panel-b"><EmptyState compact glyph="clock" title="No holds due for review" /></div> : (
            <ul>{holds.rows.map((c) => <li key={c.id} className="list-row flex aic jcb g2 wrap"><span><button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id })}>{c.ref}</button> · {c.studentName} · review {fmtDate(c.holdReviewAt ?? undefined)}</span><span className="muted ui xs">Step {c.currentStep ?? "—"}</span></li>)}</ul>
          )}
        </Panel>
      </div>}
    </div>
  );
}

/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useState } from "react";
import { ShieldCheck, Check, RotateCcw, AlarmClock, PauseCircle, ExternalLink } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { STEP_BY_N } from "@/lib/spine";
import { decideGate, fmtDateTime, fmtDate, slaFlags, latestGate, docsForStep, currentStep, daysSince } from "@/lib/logic";
import { Panel, Pill, Empty, Modal, useToast, statusTone, Avatar, TextArea, Kpi, Notice } from "@/lib/ui";
import { inCaseScope } from "@/lib/rbac";
import { Ring } from "@/lib/charts";
import type { CaseRecord, GateSubmission } from "@/lib/types";

export function ApprovalsPage() {
  const { cases, users, user, go, log, can, snap } = useSession();
  const toast = useToast();
  const mayDecide = can("gate.write");
  const mayRead = can("gate.read");
  const [target, setTarget] = useState<{ c: CaseRecord; g: GateSubmission } | null>(null);
  const [decision, setDecision] = useState<"approve" | "return">("approve");
  const [note, setNote] = useState("");

  const rows: { c: CaseRecord; g: GateSubmission }[] = [];
  const history: { c: CaseRecord; g: GateSubmission }[] = [];
  Object.values(cases).filter((c) => inCaseScope(snap.org.config, user, c)).forEach((c) => c.gates.forEach((g) => (g.status === "pending" ? rows : history).push({ c, g })));
  rows.sort((a, b) => a.g.submittedAt.localeCompare(b.g.submittedAt));
  history.sort((a, b) => (b.g.decidedAt ?? "").localeCompare(a.g.decidedAt ?? ""));
  const approved = history.filter((h) => h.g.status === "approved").length;
  const firstTime = history.length ? Math.round((history.filter((h) => h.g.round === 1 && h.g.status === "approved").length / history.length) * 100) : null;
  const avgTurn = history.length ? Math.round(history.reduce((s, h) => s + (new Date(h.g.decidedAt ?? h.g.submittedAt).getTime() - new Date(h.g.submittedAt).getTime()) / 86400000, 0) / history.length * 10) / 10 : null;

  const submit = async () => {
    if (!target || !user) return;
    if (decision === "return" && !note.trim()) return;
    await store.mutateCase(target.c.id, (x) => decideGate(x, target.g.id, decision === "approve", note.trim(), user));
    await log(decision === "approve" ? `Gate ${target.g.gate} approved` : `Gate ${target.g.gate} returned`, target.c.ref, note.trim() || undefined);
    toast(decision === "approve" ? `${STEP_BY_N[target.g.gate].title} approved for ${target.c.ref}` : "Returned to the counsellor with suggestions");
    setTarget(null); setNote(""); setDecision("approve");
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Approvals</h1><p>Team Leader gates — financial verification (step 16) and visa file finalisation (step 19).</p></div></div>
      <div className="grid grid-4 stagger">
        <Kpi label="Awaiting decision" icon={<ShieldCheck aria-hidden />} value={rows.length} tone={rows.length ? "info" : "neutral"} sub={rows.length ? `oldest ${daysSince(rows[0].g.submittedAt)}d ago` : "queue is clear"} />
        <Kpi label="Decisions recorded" value={history.length} sub={`${approved} approved · ${history.length - approved} returned`} />
        <Kpi label="First-round approval" value={firstTime === null ? "—" : `${firstTime}%`} tone={firstTime !== null && firstTime >= 80 ? "ok" : "neutral"} sub="approved without a return" />
        <Kpi label="Average turnaround" value={avgTurn === null ? "—" : `${avgTurn}d`} sub="submission to decision" />
      </div>
      <Panel title={`Awaiting decision (${rows.length})`} flush>
        {rows.length === 0 ? <div className="panel-b"><Empty title="Nothing awaiting approval" hint="Counsellors submit financial and visa files here for your decision." /></div> : (
          <ul>
            {rows.map(({ c, g }) => {
              const owner = c.counsellorId ? users[c.counsellorId] : undefined;
              const summary = mayRead ? String(c.steps[g.gate]?.values.summary ?? "") : "";
              const docs = docsForStep(c, 15);
              const acc = docs.filter((d) => d.status === "accepted").length;
              return (
                <li key={g.id} className="flex wrap g3" style={{ padding: "16px 20px", borderBottom: "1px solid var(--hair)" }}>
                  <Ring pct={docs.length ? Math.round((acc / Math.max(docs.length, 1)) * 100) : 0} size={58} stroke={6} small tone="info" label="Visa documents accepted" />
                  <div className="grow" style={{ minWidth: 240 }}>
                    <div className="flex wrap aic g2">
                      <Pill tone="info" icon={<ShieldCheck aria-hidden />}>Gate {g.gate}</Pill>
                      <button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id, step: g.gate })}>{c.ref}</button>
                      <span className="ui strong">{c.student.name}</span>
                      <span className="ui xs muted">· round {g.round} · submitted {fmtDateTime(g.submittedAt)} · waiting {daysSince(g.submittedAt)}d</span>
                    </div>
                    <p className="ui small ink2 mt1">{STEP_BY_N[g.gate].title}{owner ? ` · ${owner.name}` : ""}</p>
                    {summary && <p className="small mt2" style={{ whiteSpace: "pre-wrap" }}>{summary}</p>}
                    <p className="xs muted mt2">Visa file documents: {acc} accepted · {docs.filter((d) => d.status === "uploaded").length} unreviewed · {docs.filter((d) => d.status === "rejected").length} returned</p>
                  </div>
                  <div className="flex g1" style={{ alignItems: "flex-start" }}>
                    {mayDecide && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setTarget({ c, g }); setDecision("approve"); }}>Review</button>}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => go({ page: "case", caseId: c.id, step: g.gate })}><ExternalLink aria-hidden />Open case</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Decisions" flush>
        {history.length === 0 ? <div className="panel-b muted">No decisions recorded yet.</div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Case</th><th scope="col">Gate</th><th scope="col">Round</th><th scope="col">Decision</th><th scope="col">By</th><th scope="col">When</th><th scope="col">Suggestions</th></tr></thead>
              <tbody>
                {history.slice(0, 30).map(({ c, g }) => (
                  <tr key={g.id}>
                    <td><button type="button" className="row-btn" onClick={() => go({ page: "case", caseId: c.id, step: g.gate })}>{c.ref}</button><p className="sub">{c.student.name}</p></td>
                    <td>{g.gate}</td><td>{g.round}</td>
                    <td><Pill tone={statusTone(g.status)}>{g.status === "approved" ? "Approved" : "Returned"}</Pill></td>
                    <td>{g.decidedBy ? users[g.decidedBy]?.name ?? "—" : "—"}</td>
                    <td className="muted nowrap">{fmtDateTime(g.decidedAt)}</td>
                    <td className="muted" style={{ maxWidth: 320 }}>{g.suggestions ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {target && (
        <Modal open onClose={() => setTarget(null)} title={`${STEP_BY_N[target.g.gate].title} — ${target.c.ref}`}>
          <div className="flex aic g2 mb3"><Avatar name={target.c.student.name} size={30} /><span className="ui strong">{target.c.student.name}</span><span className="ui xs muted">· round {target.g.round}</span></div>
          {String(target.c.steps[target.g.gate]?.values.summary ?? "") && <div className="soft mb3" style={{ padding: 12, whiteSpace: "pre-wrap", fontSize: "var(--fs-sm)" }}>{String(target.c.steps[target.g.gate]?.values.summary)}</div>}
          <div className="grid grid-2" role="radiogroup" aria-label="Decision">
            <button type="button" role="radio" aria-checked={decision === "approve"} onClick={() => setDecision("approve")} className={`btn btn-secondary ${decision === "approve" ? "on-ok" : ""}`}><Check aria-hidden />Approve</button>
            <button type="button" role="radio" aria-checked={decision === "return"} onClick={() => setDecision("return")} className={`btn btn-secondary ${decision === "return" ? "on-bad" : ""}`}><RotateCcw aria-hidden />Return with suggestions</button>
          </div>
          <div className="mt3"><TextArea label={decision === "approve" ? "Note (optional)" : "Suggestions for the counsellor"} required={decision === "return"} value={note} onChange={setNote} rows={4} /></div>
          <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>Cancel</button><button type="button" className={decision === "approve" ? "btn btn-primary" : "btn btn-danger"} disabled={decision === "return" && !note.trim()} onClick={submit}>{decision === "approve" ? "Approve gate" : "Return to counsellor"}</button></div>
        </Modal>
      )}
    </div>
  );
}

export function EscalationsPage() {
  const { cases, users, snap, go, can, user } = useSession();
  const config = snap.org.config;
  const mayRead = can("escalation.read");
  const scoped = Object.values(cases).filter((c) => inCaseScope(config, user, c));
  const rows = scoped.flatMap((c) => slaFlags(c, config).filter((f) => f.state !== "ok").map((f) => ({ c, f })));
  rows.sort((a, b) => a.f.days - b.f.days);
  const breached = rows.filter((r) => r.f.state === "breached").length;
  const holds = scoped.filter((c) => (c.status === "hold" || c.status === "deferred") && c.hold?.reviewDate && new Date(c.hold.reviewDate).getTime() < Date.now());
  const gatesReturned = scoped.flatMap((c) => ([16, 19] as const).map((g) => ({ c, g: latestGate(c, g) })).filter((x) => x.g?.status === "returned" && !x.g.addressedAt));
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Escalations</h1><p>Service level breaches, cases approaching a deadline, returned gates and holds due for review.</p></div></div>
      <div className="grid grid-4 stagger">
        <Kpi label="Breached" icon={<AlarmClock aria-hidden />} value={breached} tone={breached ? "bad" : "ok"} sub="service level clocks overdue" />
        <Kpi label="Due soon" value={rows.length - breached} tone={rows.length - breached ? "warn" : "neutral"} sub="inside the reminder window" />
        <Kpi label="Returned gates" value={gatesReturned.length} tone={gatesReturned.length ? "bad" : "neutral"} sub="awaiting the counsellor" />
        <Kpi label="Holds to review" icon={<PauseCircle aria-hidden />} value={holds.length} tone={holds.length ? "warn" : "neutral"} sub="review date has passed" />
      </div>
      <Panel title={`Service levels (${rows.length})`} flush>
        {!mayRead ? <div className="panel-b"><Notice tone="neutral">Your role sees the counts. The escalation.read permission opens the case list.</Notice></div> : rows.length === 0 ? <div className="panel-b"><Empty title="No service level exposure" hint="Course Information Sheet deadlines, offer lapse dates and follow-ups appear here as they fall due." /></div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Case</th><th scope="col">Counsellor</th><th scope="col">Clock</th><th scope="col">Due</th><th scope="col">Position</th><th scope="col">Step</th></tr></thead>
              <tbody>
                {rows.map(({ c, f }) => (
                  <tr key={c.id + f.id} className="row-link" onClick={() => go({ page: "case", caseId: c.id, step: f.step })}>
                    <td><button type="button" className="row-btn" onClick={(e) => { e.stopPropagation(); go({ page: "case", caseId: c.id, step: f.step }); }}>{c.ref}</button><p className="sub">{c.student.name}</p></td>
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
      </Panel>
      <div className="grid grid-2 stagger">
        <Panel title={`Returned gates awaiting counsellor (${gatesReturned.length})`} flush>
          {gatesReturned.length === 0 ? <div className="panel-b muted">None.</div> : (
            <ul>{gatesReturned.map(({ c, g }) => <li key={c.id + g!.id} className="flex aic jcb g2 wrap" style={{ padding: "11px 20px", borderBottom: "1px solid var(--hair)", fontSize: "var(--fs-sm)" }}><span><button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id, step: g!.gate })}>{c.ref}</button> · gate {g!.gate} · returned {fmtDateTime(g!.decidedAt)}</span><span className="muted ui xs">{c.counsellorId ? users[c.counsellorId]?.name : "Unassigned"}</span></li>)}</ul>
          )}
        </Panel>
        <Panel title={`Holds due for review (${holds.length})`} flush>
          {holds.length === 0 ? <div className="panel-b muted">None.</div> : (
            <ul>{holds.map((c) => <li key={c.id} className="flex aic jcb g2 wrap" style={{ padding: "11px 20px", borderBottom: "1px solid var(--hair)", fontSize: "var(--fs-sm)" }}><span><button type="button" className="row-btn ui" onClick={() => go({ page: "case", caseId: c.id })}>{c.ref}</button> · {c.student.name} · review {fmtDate(c.hold?.reviewDate)}</span><span className="muted ui xs">Step {currentStep(c) ?? "—"}</span></li>)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

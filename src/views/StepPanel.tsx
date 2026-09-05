/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useEffect, useRef, useState } from "react";
import { Check, ShieldCheck, Send, Save, RotateCcw, Minus, Lock, Clock } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { STEP_BY_N, pipelineOfStep, type FieldDef } from "@/lib/spine";
import { derivedStatus, stepState, completeStep, currentStep, saveStepValues, markNotApplicable, reopenStep, submitGate, decideGate, addressGate, latestGate, requiredDocsAccepted, fmtDateTime, fmtDate, slaFlags, isWorkable } from "@/lib/logic";
import { FieldInput, ValueDisplay, isVisible, missingRequired, Pill, statusTone, Notice, useToast, TextArea } from "@/lib/ui";
import { DocumentChecklist } from "@/views/Documents";
import type { CaseRecord } from "@/lib/types";

export function StepPanel({ c, n, canWork, onAdvance, focusHeading = false }: { c: CaseRecord; n: number; canWork: boolean; onAdvance?: (next: number) => void; focusHeading?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusHeading) headingRef.current?.focus(); }, [focusHeading, n]);
  const { user, users, can, log, snap } = useSession();
  const toast = useToast();
  const def = STEP_BY_N[n];
  const st = stepState(c, n);
  const status = derivedStatus(c, n);
  const [values, setValues] = useState<Record<string, unknown>>(st.values);
  const [err, setErr] = useState<string[]>([]);
  const [gateNote, setGateNote] = useState("");
  const [decision, setDecision] = useState<"approve" | "return" | null>(null);
  useEffect(() => { setValues(stepState(c, n).values); setErr([]); setGateNote(""); setDecision(null); }, [c.id, n, c.rev]);

  const sensitiveOk = can("sensitive.read");
  const sensitiveSee = can("sensitive.view");
  const sensitiveEdit = can("sensitive.write");
  const workable = canWork && isWorkable(c);
  const gate = def.gate ? latestGate(c, def.gate) : undefined;
  const flags = slaFlags(c, snap.org.config).filter((f) => f.step === n);
  const isDoc = n === 10 || n === 15;
  const docsReady = isDoc ? requiredDocsAccepted(c, n as 10 | 15) : true;
  const pipe = pipelineOfStep(n);
  const missingNow = new Set(err);

  const setV = (id: string, v: unknown) => setValues((x) => ({ ...x, [id]: v }));
  const staffFields = def.fields.filter((f) => !f.sensitive || sensitiveSee);

  const save = async () => {
    if (!user) return;
    await store.mutateCase(c.id, (x) => saveStepValues(x, n, values, user, false));
    toast("Draft saved");
  };
  const complete = async () => {
    if (!user) return;
    const missing = missingRequired(staffFields, values, (f) => !f.sensitive || (sensitiveOk && sensitiveEdit));
    if (missing.length) { setErr(missing); return; }
    if (isDoc && !docsReady) { setErr(["All required documents must be accepted"]); return; }
    setErr([]);
    const updated = await store.mutateCase(c.id, (x) => completeStep(x, n, values, user));
    await log(`Step ${n} completed`, c.ref, def.title);
    toast(`Step ${n} recorded`);
    if (updated && updated.status === "open") { const next = currentStep(updated); if (next && next !== n && onAdvance) onAdvance(next); }
  };
  const na = async () => {
    if (!user) return;
    const updated = await store.mutateCase(c.id, (x) => markNotApplicable(x, n, user));
    await log(`Step ${n} marked not applicable`, c.ref, def.title);
    toast(`Step ${n} marked not applicable`);
    if (updated) { const next = currentStep(updated); if (next && next !== n && onAdvance) onAdvance(next); }
  };
  const reopen = async () => {
    if (!user) return;
    await store.mutateCase(c.id, (x) => reopenStep(x, n, user));
    await log(`Step ${n} reopened`, c.ref, def.title);
    toast(`Step ${n} reopened`);
  };
  const toGate = async () => {
    if (!user || !def.gate) return;
    const missing = missingRequired(staffFields, values, (f) => !f.sensitive || (sensitiveOk && sensitiveEdit));
    if (missing.length) { setErr(missing); return; }
    if (def.gate === 16 && !requiredDocsAccepted(c, 15)) { setErr(["All required visa file documents (step 15) must be accepted before financial verification is submitted"]); return; }
    setErr([]);
    await store.mutateCase(c.id, (x) => submitGate(x, def.gate!, values, user));
    await log(`Gate ${def.gate} submitted`, c.ref, def.title);
    toast("Submitted to the Team Leader");
  };
  const decide = async () => {
    if (!user || !gate || !decision) return;
    if (decision === "return" && !gateNote.trim()) return;
    const updated = await store.mutateCase(c.id, (x) => decideGate(x, gate.id, decision === "approve", gateNote.trim(), user));
    await log(decision === "approve" ? `Gate ${gate.gate} approved` : `Gate ${gate.gate} returned`, c.ref, gateNote.trim() || undefined);
    toast(decision === "approve" ? "Gate approved" : "Returned with suggestions");
    if (updated && decision === "approve") { const next = currentStep(updated); if (next && next !== n && onAdvance) onAdvance(next); }
  };
  const addressed = async () => {
    if (!user || !gate) return;
    if (!gateNote.trim()) { setErr(["Describe how the suggestions were addressed"]); return; }
    setErr([]);
    await store.mutateCase(c.id, (x) => { addressGate(x, gate.id, gateNote.trim(), user); return submitGate(x, def.gate!, values, user); });
    await log(`Gate ${gate.gate} resubmitted`, c.ref, gateNote.trim());
    toast("Resubmitted to the Team Leader");
  };

  const owner = st.completedBy ? users[st.completedBy]?.name : undefined;
  const student = st.studentSubmittedAt;
  const deps = def.unlockAfter ?? [n === 6 ? 4 : n === 13 ? 11 : n - 1];

  return (
    <div className="stack">
      <header className="flex wrap jcb g2" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="ui xs muted">Stage {pipe.n} of 9 · {pipe.name} · owner: {def.owner}</p>
          <h2 className="mt1" ref={headingRef} tabIndex={-1}><span className="muted" style={{ fontWeight: 500 }}>{n}.</span> {def.title}</h2>
          {def.sla && <p className="ui xs mt1 flex aic g1" style={{ color: "var(--accent-text)" }}><Clock aria-hidden style={{ width: 13, height: 13 }} />Service level: {def.sla}</p>}
        </div>
        <div className="flex wrap g1">
          {status === "done" && <Pill tone="ok" icon={<Check aria-hidden />}>Completed {fmtDate(st.completedAt)}{owner ? ` · ${owner}` : ""}</Pill>}
          {status === "na" && <Pill icon={<Minus aria-hidden />}>Not applicable</Pill>}
          {status === "active" && <Pill tone="info">In progress</Pill>}
          {status === "locked" && <Pill icon={<Lock aria-hidden />}>Not yet available</Pill>}
          {flags.map((f) => <Pill key={f.id} tone={statusTone(f.state)}>{f.days < 0 ? `${-f.days}d overdue` : `${f.days}d to ${f.label.toLowerCase()}`}</Pill>)}
        </div>
      </header>

      {status === "locked" && (
        <Notice tone="neutral">This step opens once step{deps.length > 1 ? "s" : ""} {deps.map((d) => `${d} (${STEP_BY_N[d].title})`).join(" and ")} {deps.length > 1 ? "are" : "is"} recorded.</Notice>
      )}

      {student && status !== "done" && <Notice tone="info">The student submitted details on {fmtDateTime(student)}. Review and confirm below.</Notice>}

      {def.gate && gate && (
        <div className="card solid" style={{ borderColor: "rgba(106,155,204,.45)" }}>
          <div className="flex wrap aic jcb g2">
            <p className="ui strong flex aic g2"><ShieldCheck aria-hidden style={{ width: 17, height: 17, color: "var(--accent-text)" }} />Team Leader gate · round {gate.round}</p>
            <Pill tone={statusTone(gate.status)}>{gate.status === "pending" ? "Awaiting decision" : gate.status === "approved" ? "Approved" : "Returned"}</Pill>
          </div>
          <p className="small muted mt1">Submitted {fmtDateTime(gate.submittedAt)} by {users[gate.submittedBy]?.name ?? "—"}{gate.decidedAt ? ` · decided ${fmtDateTime(gate.decidedAt)} by ${users[gate.decidedBy ?? ""]?.name ?? "—"}` : ""}</p>
          {gate.suggestions && <div className="soft mt2" style={{ padding: "10px 12px" }}><span className="ui xs muted" style={{ display: "block" }}>Team Leader suggestions</span><span className="small">{gate.suggestions}</span></div>}
          {gate.addressedNote && <div className="soft mt2" style={{ padding: "10px 12px" }}><span className="ui xs muted" style={{ display: "block" }}>Counsellor response · {fmtDateTime(gate.addressedAt)}</span><span className="small">{gate.addressedNote}</span></div>}
          {gate.status === "pending" && can("gate.write") && isWorkable(c) && (
            <div className="stack-sm mt3">
              <div className="grid grid-2" role="radiogroup" aria-label="Decision">
                <button type="button" role="radio" aria-checked={decision === "approve"} className={`btn btn-secondary ${decision === "approve" ? "on-ok" : ""}`} onClick={() => setDecision("approve")}><Check aria-hidden />Approve</button>
                <button type="button" role="radio" aria-checked={decision === "return"} className={`btn btn-secondary ${decision === "return" ? "on-bad" : ""}`} onClick={() => setDecision("return")}><RotateCcw aria-hidden />Return with suggestions</button>
              </div>
              {decision && <><TextArea label={decision === "approve" ? "Note (optional)" : "Suggestions for the counsellor"} required={decision === "return"} value={gateNote} onChange={setGateNote} rows={3} /><div><button type="button" className={decision === "approve" ? "btn btn-primary" : "btn btn-danger"} disabled={decision === "return" && !gateNote.trim()} onClick={decide}>{decision === "approve" ? "Confirm approval" : "Return to counsellor"}</button></div></>}
            </div>
          )}
          {gate.status === "pending" && !can("gate.write") && <p className="small muted mt2">Awaiting the Team Leader's decision. The step completes on approval.</p>}
        </div>
      )}

      {isDoc && (
        <div>
          <p className="small muted mb2">{n === 10 ? "Documents for the university application, per the University Document Checklist." : "Documents for the visa file, per the Visa Checklist. Reviewed by the counsellor and the Team Leader."}</p>
          <DocumentChecklist c={c} step={n as 10 | 15} canUpload={can("document.write") && workable} canReview={can("review.write") && workable} canDownload={can("document.download")} canDelete={can("document.delete") && workable} />
        </div>
      )}

      {status === "done" || status === "na" ? (
        <div>
          {staffFields.filter((f) => isVisible(f, st.values)).length > 0 && (
            <div className="form-grid soft" style={{ padding: 16 }}>
              {staffFields.filter((f) => isVisible(f, st.values)).map((f) => (
                f.sensitive && !sensitiveOk ? <div key={f.id} className="field" style={{ gap: 2 }}><span className="label" style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12.5 }}>{f.label}</span><span className="ui small muted">Restricted</span></div> : <ValueDisplay key={f.id} f={f} value={st.values[f.id]} />
              ))}
            </div>
          )}
          {workable && !(def.gate && status === "done") && <div className="mt3"><button type="button" className="btn btn-secondary" onClick={reopen}><RotateCcw aria-hidden />Reopen step</button></div>}
          {workable && def.gate && status === "done" && <p className="xs muted mt3">Approved gates are not reopened here. A new round is created by reopening the preceding step.</p>}
        </div>
      ) : (
        <div>
          {staffFields.length > 0 && (
            <div className="form-grid">
              {staffFields.filter((f) => isVisible(f, values)).map((f: FieldDef) => (
                <FieldInput key={f.id} f={f} value={values[f.id]} onChange={(v) => setV(f.id, v)} disabled={!workable || status === "locked" || (gate?.status === "pending") || (f.sensitive && !sensitiveEdit)} masked={f.sensitive && !sensitiveOk} invalid={missingNow.has(f.label)} />
              ))}
            </div>
          )}
          {err.length > 0 && <div className="mt3"><Notice tone="bad" role="alert">{err.length === 1 && !err[0].includes(",") && err[0].length > 40 ? err[0] : <>Complete the required fields: <b>{err.join(", ")}</b></>}</Notice></div>}
          {workable && status === "active" && (
            <div className="mt4 flex wrap g2">
              {def.gate ? (
                gate?.status === "pending" ? null : gate?.status === "returned" && !gate.addressedAt ? (
                  <div className="stack-sm" style={{ width: "100%" }}>
                    <TextArea label="How the suggestions were addressed" required value={gateNote} onChange={setGateNote} rows={3} />
                    <div className="flex g2 wrap"><button type="button" className="btn btn-primary" onClick={addressed}><Send aria-hidden />Confirm addressed and resubmit</button><button type="button" className="btn btn-secondary" onClick={save}><Save aria-hidden />Save draft</button></div>
                  </div>
                ) : (
                  <><button type="button" className="btn btn-primary" onClick={toGate}><Send aria-hidden />Submit for Team Leader approval</button><button type="button" className="btn btn-secondary" onClick={save}><Save aria-hidden />Save draft</button></>
                )
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={complete} disabled={isDoc && !docsReady} title={isDoc && !docsReady ? "All required documents must be accepted" : undefined}><Check aria-hidden />{def.decision ? "Record outcome" : "Mark step complete"}</button>
                  {staffFields.length > 0 && <button type="button" className="btn btn-secondary" onClick={save}><Save aria-hidden />Save draft</button>}
                  {def.optional && <button type="button" className="btn btn-ghost" onClick={na}><Minus aria-hidden />Not applicable</button>}
                </>
              )}
            </div>
          )}
          {isDoc && workable && status === "active" && !docsReady && <p className="xs muted mt2">Every required document must be accepted before this step can be completed.</p>}
          {!canWork && status === "active" && <p className="xs muted mt3">Read only. This case is assigned to another counsellor.</p>}
          {canWork && !isWorkable(c) && <p className="xs muted mt3">This case is {c.status === "hold" ? "on hold" : c.status}. Reopen it to continue.</p>}
        </div>
      )}
    </div>
  );
}

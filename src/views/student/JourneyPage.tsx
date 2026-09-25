/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { PIPELINE, STEP_BY_N } from "@/lib/spine";
import { pipelineProgress, derivedStatus, stepState, completeStep, fmtDate, caseProgress } from "@/lib/logic";
import { Pill, Notice, FieldInput, missingRequired, useToast, PageHeader } from "@/lib/ui";
import type { CaseRecord } from "@/lib/types";
import { COUNSELLOR_RECORDS } from "./common";
import { EVENTS } from "@/lib/audit";

export function JourneyPage({ c }: { c: CaseRecord }) {
  const { user, route, audit, can } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(route.step ?? null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string[]>([]);
  const prog = pipelineProgress(c);
  const current = prog.find((p) => p.current) ?? prog[prog.length - 1];
  const canWrite = can("case.write");
  const confirmable = (n: number) => (n === 26 || n === 29) && derivedStatus(c, n) === "active" && c.status === "open";
  const confirm = async (n: number) => {
    if (!user || !canWrite) return;
    const fields = STEP_BY_N[n].fields.filter((f) => f.studentEditable);
    const missing = missingRequired(fields, values);
    if (missing.length) { setErr(missing); return; }
    setErr([]);
    await store.mutateCase(c.id, (x) => completeStep(x, n, values, user));
    await audit(EVENTS.stepConfirmedByStudent(c, n));
    toast("Confirmed"); setOpen(null); setValues({});
  };
  const p = caseProgress(c);
  return (
    <div className="stack">
      <PageHeader title="Journey" context="Every step from enquiry to arrival, with what has been completed so far." actions={<Pill tone="neutral">Stage {current.n} of 9 · {p.done} of {p.applicable} steps recorded</Pill>} />
      <div className="stack-sm journey-list">
        {PIPELINE.map((s) => {
          const pr = prog.find((x) => x.id === s.id)!;
          const holdsStep = (n: number | null | undefined) => n != null && s.steps.includes(n);
          const expanded = pr.current || holdsStep(route.step) || holdsStep(open);
          return (
            <details key={s.id} className={`journey-stage panel ${pr.complete ? "done" : pr.current ? "active" : ""}`} open={expanded}>
              <summary>
                <span className="j-ico" aria-hidden="true">{pr.complete ? <Check /> : s.n}</span>
                <span className="grow"><span className="ui strong" style={{ display: "block" }}>{s.studentName}</span><span className="ui xs muted">{pr.done} of {pr.total} steps{pr.current ? " · current stage" : pr.complete ? " · complete" : ""}</span></span>
                <ChevronDown className="chev" aria-hidden />
              </summary>
              <ul className="j-steps">
                {s.steps.map((n) => {
                  const d = derivedStatus(c, n); const st = stepState(c, n); const def = STEP_BY_N[n];
                  const isOpen = open === n;
                  return (
                    <li key={n} className={`j-step ${d}`}>
                      <span className="s-ico" aria-hidden="true">{d === "done" ? <Check /> : null}</span>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="j-step-head flex wrap aic jcb g2">
                          <span className={d === "active" ? "ui strong" : "ui"}>{def.studentTitle}</span>
                          <span className="ui xs muted">{d === "done" ? fmtDate(st.completedAt) : d === "na" ? "Not required" : d === "active" ? (def.studentAction ? "Action needed" : def.gate ? "Under internal review" : "In progress") : ""}</span>
                        </div>
                        {confirmable(n) && !canWrite && <p className="xs muted mt1">{COUNSELLOR_RECORDS}</p>}
                        {confirmable(n) && canWrite && !isOpen && <button type="button" className="btn btn-primary btn-sm mt2" onClick={() => { setOpen(n); setValues({}); setErr([]); }}>{n === 26 ? "Confirm unit enrolment" : "Confirm accommodation"}</button>}
                        {confirmable(n) && canWrite && isOpen && (
                          <div className="form-grid soft mt2" style={{ padding: 14 }}>
                            {def.fields.filter((f) => f.studentEditable).map((f) => <FieldInput key={f.id} f={f} value={values[f.id]} onChange={(v) => setValues((x) => ({ ...x, [f.id]: v }))} idPrefix="js" />)}
                            {err.length > 0 && <div className="field full"><Notice tone="bad" role="alert">Complete the required fields: {err.join(", ")}</Notice></div>}
                            <div className="flex g2 field full" style={{ flexDirection: "row" }}><button type="button" className="btn btn-primary" onClick={() => confirm(n)}>Confirm</button><button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>Cancel</button></div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { useState } from "react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { STEP_BY_N } from "@/lib/spine";
import { stepState, saveStepValues, fmtDate, fmtDateTime, todayInput } from "@/lib/logic";
import { Pill, Panel, Notice, FieldInput, isVisible, missingRequired, useToast, ValueDisplay, PageHeader } from "@/lib/ui";
import type { CaseRecord } from "@/lib/types";
import { COUNSELLOR_RECORDS } from "./common";
import { EVENTS, diffChanges } from "@/lib/audit";

export function ProfilePage({ c }: { c: CaseRecord }) {
  const { user, audit, can } = useSession();
  const toast = useToast();
  const def = STEP_BY_N[2];
  const st = stepState(c, 2);
  const fields = def.fields.filter((f) => f.studentEditable);
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...st.values, consent: st.values.consent ?? "Yes", consentDate: st.values.consentDate ?? todayInput() }));
  const [err, setErr] = useState<string[]>([]);
  const canWrite = can("case.write");
  const locked = st.status === "done" || c.status !== "open";
  const editable = !locked && canWrite;
  const missingNow = new Set(err);
  const filled = fields.filter((f) => isVisible(f, values) && f.required).filter((f) => { const v = values[f.id]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ""; }).length;
  const req = fields.filter((f) => isVisible(f, values) && f.required).length;
  const submit = async () => {
    if (!user || !canWrite) return;
    const missing = missingRequired(fields, values);
    if (missing.length) { setErr(missing); return; }
    setErr([]);
    const before = c.steps[2]?.values ?? {};
    await store.mutateCase(c.id, (x) => saveStepValues(x, 2, values, user, true));
    await audit(EVENTS.profileSubmitted(c, diffChanges(before, values, fields)));
    toast("Profile submitted to your counsellor");
  };
  return (
    <div className="stack">
      <PageHeader title="Profile" context="Your academic history, family and sponsor details and English test results. Your counsellor uses this to assess eligibility and recommend programmes." actions={editable ? <Pill tone={filled === req ? "ok" : "warn"}>{filled} of {req} required answered</Pill> : undefined} />
      {st.status === "done" && <Notice tone="ok">Your profile was confirmed by your counsellor on {fmtDate(st.completedAt)}. Contact them to change any detail.</Notice>}
      {st.status !== "done" && st.studentSubmittedAt && <Notice tone="info">Submitted {fmtDateTime(st.studentSubmittedAt)}. You can update it until your counsellor confirms it.</Notice>}
      <Panel>
        {editable ? (
          <div className="form-grid">
            {fields.filter((f) => isVisible(f, values)).map((f) => <FieldInput key={f.id} f={f} value={values[f.id]} onChange={(v) => setValues((x) => ({ ...x, [f.id]: v }))} invalid={missingNow.has(f.label)} idPrefix="sp" />)}
          </div>
        ) : (
          <div className="form-grid">{fields.filter((f) => isVisible(f, st.values)).map((f) => <ValueDisplay key={f.id} f={f} value={st.values[f.id]} />)}</div>
        )}
        {err.length > 0 && <div className="mt3"><Notice tone="bad" role="alert">Complete the required fields: <b>{err.join(", ")}</b></Notice></div>}
        {editable && <div className="mt4"><button type="button" className="btn btn-primary" onClick={submit}>{st.studentSubmittedAt ? "Update profile" : "Submit profile"}</button></div>}
        {!locked && !canWrite && <p className="small muted mt4">{COUNSELLOR_RECORDS}</p>}
      </Panel>
    </div>
  );
}

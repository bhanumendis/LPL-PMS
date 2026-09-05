/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Retention schedule and cross-border transfer register.
 * Closes absences 2 and 3 of process document LGH/IMS/PROC/LPL/001 §10, and feeds the
 * three compliance metrics in §11 (consent coverage, retention-overdue records,
 * third-party transfers logged).
 */
import { useMemo, useState } from "react";
import { Check, Download, Search, Lock, LockOpen, Trash2, Pencil, Plus, X } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso } from "@/lib/store";
import {
  RETENTION_LABEL, allTransfers, clearLegalHold, consentCoverage, daysUntil, disposeCase,
  fmtDate, fmtDateTime, retentionDue, retentionPolicy, retentionState, retentionSummary,
  setLegalHold, unsafeguardedTransfers, updateTransfer,
  type RegisterRow, type RetentionState,
} from "@/lib/logic";
import { DATA_CATEGORIES, LAWFUL_BASES, SAFEGUARDS } from "@/lib/spine";
import { Empty, Kpi, Modal, Notice, Panel, Pill, SelectField, TabPanel, Tabs, TextArea, TextField, useToast, type Tone } from "@/lib/ui";
import type { CaseRecord, StandingProcessor } from "@/lib/types";

const STATE_TONE: Record<RetentionState, Tone> = {
  none: "neutral", scheduled: "neutral", due_soon: "warn", overdue: "bad", held: "info", disposed: "navy",
};

const TYPE_LABEL: Record<string, string> = {
  platform: "Platform", partner_agent: "Partner agent", university: "University", authority: "Visa authority", processor: "Processor",
};

type TabId = "retention" | "register" | "processors";

export function DataProtectionPage() {
  const { snap, cases, can } = useSession();
  const config = snap.org.config;
  const policy = retentionPolicy(config);
  const mayRead = can("dataprotection.read");
  const list = useMemo(() => Object.values(cases), [cases]);
  const [tab, setTab] = useState<TabId>("retention");

  const consent = consentCoverage(list);
  const summary = retentionSummary(list, config);
  const transfers = useMemo(() => allTransfers(list), [list]);
  const unsafeguarded = unsafeguardedTransfers(list);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Data protection</h1>
          <p>Retention schedule and the register of personal data leaving Sri Lanka. Aligned to PDPA No. 9 of 2022 as amended, Parts I and III, in force 1 January 2027.</p>
        </div>
      </div>

      <div className="grid grid-4 stagger">
        <Kpi label="Consent coverage" value={`${consent.pct}%`} sub={`${consent.covered} of ${consent.total} profiled cases`} tone={consent.pct === 100 ? "ok" : consent.pct >= 90 ? "warn" : "bad"} />
        <Kpi label="Retention overdue" value={summary.overdue} sub={summary.due_soon ? `${summary.due_soon} due within ${policy.warnDays} days` : "None due soon"} tone={summary.overdue ? "bad" : "ok"} onClick={() => setTab("retention")} />
        <Kpi label="Transfers logged" value={transfers.length} sub={`${new Set(transfers.map((t) => t.country)).size} destination jurisdictions`} tone="neutral" onClick={() => setTab("register")} />
        <Kpi label="Without a safeguard" value={unsafeguarded} sub="Transfers with no agreement recorded" tone={unsafeguarded ? "bad" : "ok"} onClick={() => setTab("register")} />
      </div>

      <Tabs<TabId>
        label="Data protection sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "retention", label: "Retention", count: summary.overdue + summary.due_soon || undefined },
          { id: "register", label: "Transfer register", count: transfers.length || undefined },
          { id: "processors", label: "Standing processors", count: (config.processors ?? []).length || undefined },
        ]}
      />

      {!mayRead && <Notice tone="neutral">Your role sees the compliance tiles. The dataprotection.read permission opens the registers.</Notice>}
      <TabPanel id="retention" active={mayRead && tab === "retention"}>
        <RetentionTab list={list} />
      </TabPanel>
      <TabPanel id="register" active={mayRead && tab === "register"}>
        <RegisterTab rows={transfers} />
      </TabPanel>
      <TabPanel id="processors" active={mayRead && tab === "processors"}>
        <ProcessorsTab />
      </TabPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

function RetentionTab({ list }: { list: CaseRecord[] }) {
  const { snap, can, user, log } = useSession();
  const toast = useToast();
  const config = snap.org.config;
  const policy = retentionPolicy(config);
  const [filter, setFilter] = useState<RetentionState | "actionable">("actionable");
  const [disposeTarget, setDisposeTarget] = useState<CaseRecord | null>(null);
  const [holdTarget, setHoldTarget] = useState<CaseRecord | null>(null);
  const [typed, setTyped] = useState("");
  const [basis, setBasis] = useState("Retention period expired under the LPL retention schedule");
  const [reason, setReason] = useState("");
  const mayDispose = can("dataprotection.delete");
  const mayHold = can("dataprotection.write");
  const restricted = [!mayHold ? "legal holds" : null, !mayDispose ? "disposal" : null].filter((s): s is string => s !== null);

  const rows = list
    .map((c) => ({ c, state: retentionState(c, config), due: retentionDue(c, config) }))
    .filter((r) => (filter === "actionable" ? r.state === "overdue" || r.state === "due_soon" || r.state === "held" : r.state === filter))
    .sort((a, b) => (a.due?.due.getTime() ?? Infinity) - (b.due?.due.getTime() ?? Infinity));

  const doDispose = async () => {
    if (!disposeTarget || !user) return;
    const ref = disposeTarget.ref;
    await store.mutateCase(disposeTarget.id, (c) => disposeCase(c, user, basis));
    await log("Case record disposed", ref, basis);
    setDisposeTarget(null); setTyped("");
    toast(`${ref} anonymised. Outcomes and dates kept for reporting.`);
  };

  const doHold = async () => {
    if (!holdTarget || !user) return;
    const ref = holdTarget.ref;
    const held = Boolean(holdTarget.legalHold);
    await store.mutateCase(holdTarget.id, (c) => (held ? clearLegalHold(c, user) : setLegalHold(c, user, reason)));
    await log(held ? "Legal hold lifted" : "Legal hold placed", ref, held ? undefined : reason);
    setHoldTarget(null); setReason("");
    toast(held ? `Legal hold lifted on ${ref}` : `Legal hold placed on ${ref}. Disposal is suspended.`);
  };

  return (
    <div className="grid grid-3 stagger">
      <div className="span2 stack">
        <div className="panel" style={{ padding: 12 }}>
          <label htmlFor="ret-filter" className="sr-only">Filter by retention state</label>
          <select id="ret-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value as RetentionState | "actionable")}>
            <option value="actionable">Needs attention — overdue, due soon and legal holds</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due soon</option>
            <option value="held">Legal hold</option>
            <option value="scheduled">Scheduled</option>
            <option value="disposed">Disposed</option>
            <option value="none">No clock — open cases</option>
          </select>
        </div>

        {restricted.length > 0 && <Notice tone="info">You can review the schedule; {restricted.join(" and ")} {restricted.length === 1 && restricted[0] === "disposal" ? "is" : "are"} reserved to roles holding the matching data protection permission.</Notice>}

        {rows.length === 0 ? (
          <Empty title="Nothing in this state" hint="Cases enter the schedule when they exit, complete, or go dormant on hold." />
        ) : (
          <div className="panel table-wrap">
            <table className="tbl" style={{ minWidth: 760 }}>
              <caption className="sr-only">Cases by retention state, earliest disposal date first</caption>
              <thead>
                <tr>
                  <th scope="col">Case</th><th scope="col">Basis</th><th scope="col">Disposal due</th><th scope="col">State</th><th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, state, due }) => {
                  const days = due ? daysUntil(due.due) : null;
                  return (
                    <tr key={c.id}>
                      <td><p className="primary">{c.ref}</p><p className="sub truncate">{c.student.name}</p></td>
                      <td className="nowrap">{due?.basis ?? "—"}<p className="sub">{due ? `${due.months} months` : ""}</p></td>
                      <td className="nowrap">{due ? fmtDate(due.due.toISOString()) : "—"}<p className="sub">{days == null ? "" : days < 0 ? `${Math.abs(days)} days past` : `in ${days} days`}</p></td>
                      <td><Pill tone={STATE_TONE[state]}>{RETENTION_LABEL[state]}</Pill></td>
                      <td>
                        <div className="flex wrap g1">
                          {mayHold && state !== "disposed" && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setHoldTarget(c); setReason(c.legalHold?.reason ?? ""); }}>
                              {c.legalHold ? <LockOpen aria-hidden /> : <Lock aria-hidden />}{c.legalHold ? "Lift hold" : "Hold"}
                            </button>
                          )}
                          {mayDispose && state === "overdue" && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setDisposeTarget(c); setTyped(""); }}><Trash2 aria-hidden />Dispose</button>
                          )}
                          {state === "disposed" && <span className="xs muted">{fmtDate(c.disposal?.at)}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="stack">
        <Panel title="The schedule">
          <div className="stack-sm small">
            <ScheduleRow label="Exited cases" months={policy.exitedMonths} note="From the recorded exit date." />
            <ScheduleRow label="Placed students" months={policy.completedMonths} note="From the three-month follow-up, against commercial records." />
            <ScheduleRow label="Dormant holds and deferrals" months={policy.dormantMonths} note="From the last activity on the case." />
            <p className="xs muted mt2">Open cases have no clock. Periods are set in Settings and should be confirmed with Group Legal before go-live.</p>
          </div>
        </Panel>
        <Panel title="What disposal does">
          <div className="stack-sm small">
            <p>Disposal <b className="ui">anonymises</b> rather than deletes. Name, contact details, passport number, academic records, sponsor and health information, document filenames and the case narrative are destroyed.</p>
            <p>Outcome codes, dates, destination, programme, institution and the transfer register survive, so conversion, SLA and refusal reporting stay intact with no data subject behind them.</p>
            <p className="muted">The action is irreversible and is written to the audit log.</p>
          </div>
        </Panel>
      </div>

      <Modal open={Boolean(disposeTarget)} onClose={() => setDisposeTarget(null)} title={`Dispose of ${disposeTarget?.ref ?? ""}`} width={520}>
        <Notice tone="bad">This destroys the personal data on this case. It cannot be undone.</Notice>
        <div className="stack-sm mt3">
          <SelectField label="Basis" value={basis} onChange={setBasis} options={[
            "Retention period expired under the LPL retention schedule",
            "Data subject erasure request",
            "Record created in error",
          ]} required />
          <p className="small ink2">Type <b className="ui">DISPOSE</b> to confirm.</p>
          <TextField label="Confirmation" value={typed} onChange={setTyped} autoComplete="off" />
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setDisposeTarget(null)}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={typed !== "DISPOSE"} onClick={doDispose}>Destroy personal data</button>
        </div>
      </Modal>

      <Modal open={Boolean(holdTarget)} onClose={() => setHoldTarget(null)} title={holdTarget?.legalHold ? `Lift the legal hold on ${holdTarget?.ref ?? ""}` : `Place a legal hold on ${holdTarget?.ref ?? ""}`} width={500}>
        {holdTarget?.legalHold ? (
          <div className="stack-sm small">
            <p>Placed {fmtDateTime(holdTarget.legalHold.at)} by {holdTarget.legalHold.byName}.</p>
            <p className="ink2">Reason recorded: {holdTarget.legalHold.reason}</p>
            <Notice tone="warn">Lifting the hold returns the case to the retention schedule. If it is already past its disposal date it becomes disposable immediately.</Notice>
          </div>
        ) : (
          <div className="stack-sm">
            <p className="small ink2">A legal hold suspends disposal indefinitely — for litigation, a regulatory enquiry or an unresolved complaint.</p>
            <TextArea label="Reason for the hold" value={reason} onChange={setReason} rows={3} required />
          </div>
        )}
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setHoldTarget(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!holdTarget?.legalHold && reason.trim().length < 3} onClick={doHold}>{holdTarget?.legalHold ? "Lift the hold" : "Place the hold"}</button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Eight data categories in one cell blows the row height out, so the visible text is
 * truncated and the full list is exposed to assistive technology and the CSV export.
 */
function Categories({ list }: { list: string[] }) {
  const shown = list.slice(0, 2).join(", ");
  const rest = list.length - 2;
  return (
    <>
      <span aria-hidden="true" className="truncate" style={{ display: "block", maxWidth: 200 }}>{shown}{rest > 0 ? ` +${rest} more` : ""}</span>
      <span className="sr-only">{list.join(", ")}</span>
    </>
  );
}

function ScheduleRow({ label, months, note }: { label: string; months: number; note: string }) {
  return (
    <div className="flex jcb aic g2">
      <div style={{ minWidth: 0 }}>
        <p className="ui small strong">{label}</p>
        <p className="xs muted">{note}</p>
      </div>
      <Pill tone="neutral">{months} months</Pill>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfer register
// ---------------------------------------------------------------------------

function RegisterTab({ rows }: { rows: RegisterRow[] }) {
  const { can, user, log, go } = useSession();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [edit, setEdit] = useState<RegisterRow | null>(null);
  const [form, setForm] = useState({ lawfulBasis: "", safeguard: "", country: "", note: "" });
  const mayExport = can("dataprotection.download");
  const mayEdit = can("dataprotection.write");

  const list = rows.filter((t) =>
    (!type || t.recipientType === type)
    && (!gapsOnly || t.safeguard === "None recorded")
    && (!q || [t.recipient, t.country, t.caseRef, t.lawfulBasis, t.safeguard].join(" ").toLowerCase().includes(q.toLowerCase()))
  );

  const openEdit = (t: RegisterRow) => {
    setForm({ lawfulBasis: t.lawfulBasis, safeguard: t.safeguard, country: t.country, note: t.note ?? "" });
    setEdit(t);
  };

  const save = async () => {
    if (!edit || !user) return;
    await store.mutateCase(edit.caseId, (c) => updateTransfer(c, edit.id, { ...form, note: form.note.trim() || undefined }, user));
    await log("Transfer record updated", edit.caseRef, `${edit.recipient} — ${form.safeguard}`);
    setEdit(null);
    toast("Transfer record updated");
  };

  const exportCsv = () => {
    const header = ["Date", "Case", "Step", "Recipient", "Type", "Approved agent", "Country", "Data categories", "Lawful basis", "Safeguard", "Logged by", "Note"];
    const body = list.map((t) => [t.at, t.caseRef, String(t.step), t.recipient, TYPE_LABEL[t.recipientType] ?? t.recipientType, t.recipientApproved === undefined ? "" : t.recipientApproved ? "Yes" : "No", t.country, t.dataCategories.join("; "), t.lawfulBasis, t.safeguard, t.byName, t.note ?? ""]);
    const csv = [header, ...body].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `lpl-transfer-register-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    void log("Transfer register exported", undefined, `${list.length} records`);
  };

  const gaps = rows.filter((t) => t.safeguard === "None recorded").length;
  const unapproved = rows.filter((t) => t.recipientApproved === false).length;

  return (
    <div className="stack">
      {gaps > 0 && (
        <Notice tone="warn" role="status">
          <b className="ui">{gaps}</b> of {rows.length} transfers carry no recorded safeguard. Each needs a processor agreement or an explicit lawful basis before 1 January 2027.
        </Notice>
      )}
      {unapproved > 0 && (
        <Notice tone="bad" role="status">
          <b className="ui">{unapproved}</b> transfer{unapproved === 1 ? "" : "s"} went to a partner agent that was not on the approved list. The handling rule for that route is still undefined (discrepancy D-05).
        </Notice>
      )}

      <div className="panel" style={{ padding: 12 }}>
        <div className="grid" style={{ gridTemplateColumns: "1fr 200px auto", gap: 10, alignItems: "center" }}>
          <div className="input-wrap">
            <Search aria-hidden />
            <label htmlFor="tr-q" className="sr-only">Filter the register</label>
            <input id="tr-q" type="search" className="input" placeholder="Filter by recipient, country or case" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tr-type" className="sr-only">Recipient type</label>
            <select id="tr-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All recipients</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex g2 aic nowrap">
            <label className="check" htmlFor="tr-gaps">
              <input id="tr-gaps" type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
              <span>Gaps only</span>
            </label>
            {mayExport && <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={list.length === 0}><Download aria-hidden />Export</button>}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title="No transfers recorded" hint="Records are written automatically when applications are submitted (step 11), acceptance documents are shared (step 18) and a visa is lodged (step 23)." />
      ) : (
        <div className="panel table-wrap">
          <table className="tbl" style={{ minWidth: 1040 }}>
            <caption className="sr-only">Cross-border transfer register, most recent first</caption>
            <thead>
              <tr>
                <th scope="col">When</th><th scope="col">Case</th><th scope="col">Recipient</th><th scope="col">Country</th>
                <th scope="col">Data</th><th scope="col">Lawful basis</th><th scope="col">Safeguard</th>{mayEdit && <th scope="col">Edit</th>}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 250).map((t) => (
                <tr key={t.id}>
                  <td className="nowrap muted">{fmtDate(t.at)}<p className="sub">Step {t.step}</p></td>
                  <td><button type="button" className="row-btn" onClick={() => go({ page: "case", caseId: t.caseId })}>{t.caseRef}</button></td>
                  <td>
                    <p className="primary truncate" style={{ maxWidth: 220 }}>{t.recipient}</p>
                    <p className="sub">{TYPE_LABEL[t.recipientType] ?? t.recipientType}{t.recipientApproved === false ? " · not approved" : ""}</p>
                  </td>
                  <td className="nowrap">{t.country}</td>
                  <td className="xs muted"><Categories list={t.dataCategories} /></td>
                  <td className="xs nowrap">{t.lawfulBasis}</td>
                  <td><Pill tone={t.safeguard === "None recorded" ? "bad" : "ok"}>{t.safeguard}</Pill></td>
                  {mayEdit && (
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} aria-label={`Edit the transfer record for ${t.recipient} on case ${t.caseRef}`}><Pencil aria-hidden />Edit</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 250 && <p className="xs muted" style={{ padding: "10px 16px" }}>Showing the most recent 250 of {list.length}.{mayExport ? " Export for the full register." : ""}</p>}
        </div>
      )}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Transfer record" width={540}>
        {edit && (
          <div className="stack-sm">
            <div className="soft" style={{ padding: 12 }}>
              <p className="ui small strong">{edit.recipient}</p>
              <p className="xs muted">{edit.caseRef} · step {edit.step} · logged {fmtDateTime(edit.at)} by {edit.byName}</p>
              <p className="xs muted mt1">Data transferred: {edit.dataCategories.join(", ")}</p>
            </div>
            <TextField label="Recipient country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} required />
            <SelectField label="Lawful basis" value={form.lawfulBasis} onChange={(v) => setForm({ ...form, lawfulBasis: v })} options={LAWFUL_BASES} required />
            <SelectField label="Safeguard" value={form.safeguard} onChange={(v) => setForm({ ...form, safeguard: v })} options={SAFEGUARDS} required hint="Record the agreement that makes this transfer lawful." />
            <TextArea label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} rows={2} />
          </div>
        )}
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save record</button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standing processors
// ---------------------------------------------------------------------------

const EMPTY_PROCESSOR = { name: "", purpose: "", country: "", safeguard: SAFEGUARDS[0], agreementRef: "", dataCategories: [] as string[] };

function ProcessorsTab() {
  const { snap, can, log } = useSession();
  const toast = useToast();
  const processors = snap.org.config.processors ?? [];
  const mayEdit = can("dataprotection.write");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY_PROCESSOR);

  const add = async () => {
    const entry: StandingProcessor = {
      id: uid(), name: f.name.trim(), purpose: f.purpose.trim(), country: f.country.trim(),
      dataCategories: f.dataCategories, safeguard: f.safeguard,
      agreementRef: f.agreementRef.trim() || undefined, addedAt: nowIso(),
    };
    await store.mutateOrg((o) => { o.config.processors = [...(o.config.processors ?? []), entry]; return o; });
    await log("Standing processor added", entry.name, `${entry.country} — ${entry.safeguard}`);
    setOpen(false); setF(EMPTY_PROCESSOR);
    toast("Processor added to the register");
  };

  const remove = async (p: StandingProcessor) => {
    await store.mutateOrg((o) => { o.config.processors = (o.config.processors ?? []).filter((x) => x.id !== p.id); return o; });
    await log("Standing processor removed", p.name);
    toast("Processor removed");
  };

  const toggleCategory = (cat: string) => setF((s) => ({ ...s, dataCategories: s.dataCategories.includes(cat) ? s.dataCategories.filter((c) => c !== cat) : [...s.dataCategories, cat] }));

  return (
    <div className="stack">
      <Notice tone="info">
        Per-case transfers are logged automatically. This register covers processors that hold LPL data continuously — hosting, email, file storage — which the process document does not currently name at all.
      </Notice>

      <div className="page-head" style={{ marginTop: 0 }}>
        <div><h2>Standing processors</h2><p>Every third party holding student data on LPL's behalf, and the agreement that permits it.</p></div>
        {mayEdit && <div className="actions"><button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus aria-hidden />Add a processor</button></div>}
      </div>

      {processors.length === 0 ? (
        <Empty title="No processors recorded" hint="At minimum this should name wherever the workspace itself is hosted." action={mayEdit ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Add a processor</button> : undefined} />
      ) : (
        <div className="panel table-wrap">
          <table className="tbl" style={{ minWidth: 820 }}>
            <caption className="sr-only">Standing processors holding LPL data</caption>
            <thead><tr><th scope="col">Processor</th><th scope="col">Purpose</th><th scope="col">Country</th><th scope="col">Data</th><th scope="col">Safeguard</th>{mayEdit && <th scope="col">Remove</th>}</tr></thead>
            <tbody>
              {processors.map((p) => (
                <tr key={p.id}>
                  <td><p className="primary">{p.name}</p><p className="sub">{p.agreementRef ? `Agreement ${p.agreementRef}` : "No agreement reference"}</p></td>
                  <td className="xs">{p.purpose}</td>
                  <td className="nowrap">{p.country}</td>
                  <td className="xs muted">{p.dataCategories.length ? <Categories list={p.dataCategories} /> : "Not recorded"}</td>
                  <td><Pill tone={p.safeguard === "None recorded" ? "bad" : "ok"}>{p.safeguard}</Pill></td>
                  {mayEdit && <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => void remove(p)} aria-label={`Remove ${p.name} from the register`}><X aria-hidden />Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a standing processor" width={560}>
        <div className="stack-sm">
          <TextField label="Processor name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
          <TextField label="Purpose" value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} required placeholder="Application hosting and database" />
          <TextField label="Country of processing" value={f.country} onChange={(v) => setF({ ...f, country: v })} required placeholder="Singapore" />
          <div className="field full">
            <p className="ui small strong" id="proc-cats">Data categories held</p>
            <div className="choice" role="group" aria-labelledby="proc-cats">
              {DATA_CATEGORIES.map((cat) => {
                const on = f.dataCategories.includes(cat);
                return (
                  <button key={cat} type="button" className="chip" aria-pressed={on} onClick={() => toggleCategory(cat)}>
                    {on && <Check aria-hidden style={{ width: 14, height: 14 }} />}{cat}
                  </button>
                );
              })}
            </div>
          </div>
          <SelectField label="Safeguard" value={f.safeguard} onChange={(v) => setF({ ...f, safeguard: v })} options={SAFEGUARDS} required />
          <TextField label="Agreement reference" value={f.agreementRef} onChange={(v) => setF({ ...f, agreementRef: v })} hint="Optional. The contract or DPA number." />
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!f.name.trim() || !f.purpose.trim() || !f.country.trim()} onClick={add}>Add processor</button>
        </div>
      </Modal>
    </div>
  );
}

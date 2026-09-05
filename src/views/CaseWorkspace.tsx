/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Check, Lock, Minus, Download, ChevronDown, ChevronUp, Mail, Phone, ShieldCheck, FileText, RotateCcw, GraduationCap, Flag, PauseCircle, CalendarClock, Play } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { canReadCase, canWorkCase, caseScopeOf } from "@/lib/rbac";
import { PIPELINE, STEP_BY_N, EXIT_CODES, pipelineOfStep } from "@/lib/spine";
import { derivedStatus, currentStep, pipelineProgress, slaFlags, latestGate, fmtDateTime, fmtDate, fmtMonth, changeStatus, pendingReviewCount, stepState, caseProgress, caseDestination, caseProgramme, caseTransfers, retentionDue, retentionState, RETENTION_LABEL, daysUntil, exitStageLabel, redactSensitive } from "@/lib/logic";
import { Pill, statusTone, STATUS_LABEL, Modal, useToast, Avatar, Notice, ValueDisplay, isVisible, Tabs, TabPanel, TextArea, SelectField, Field } from "@/lib/ui";
import { Ring, StageTrack } from "@/lib/charts";
import { StepPanel } from "@/views/StepPanel";
import { DocumentChecklist } from "@/views/Documents";
import { AssignDialog } from "@/views/staff/Cases";
import type { CaseRecord, CaseStatus } from "@/lib/types";

type Tab = "step" | "documents" | "timeline" | "profile" | "dp";

/** Pipeline stage id that presents a step; falls back to the first stage for an unknown step number from the URL. */
const stageIdOf = (n: number): string => (STEP_BY_N[n] ? pipelineOfStep(n) : PIPELINE[0]).id;

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const { cases, users, user, can, snap, go, route, log } = useSession();
  const toast = useToast();
  const c = cases[caseId];
  const [tab, setTab] = useState<Tab>((route.tab as Tab) || "step");
  const [sel, setSel] = useState<number>(route.step ?? (c ? currentStep(c) ?? 31 : 1));
  const [assign, setAssign] = useState(false);
  const [statusDlg, setStatusDlg] = useState<CaseStatus | null>(null);
  const [mobileSpine, setMobileSpine] = useState(false);
  /** True when the selected step changed through an action, so the new panel takes focus. */
  const [advanced, setAdvanced] = useState(false);
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set([stageIdOf(sel)]));
  const headRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (route.step) { setSel(route.step); setTab("step"); } }, [route.step]);
  useEffect(() => { if (route.tab && route.tab !== "step") setTab(route.tab as Tab); }, [route.tab]);
  useEffect(() => { const id = stageIdOf(sel); setOpenStages((s) => (s.has(id) ? s : new Set(s).add(id))); }, [sel]);

  if (!c) return <div className="panel"><div className="panel-b"><p>This case is not available.</p><button type="button" className="btn btn-secondary mt3" onClick={() => go({ page: "cases" })}>Back to cases</button></div></div>;
  if (!canReadCase(snap.org.config, user, c)) return <div className="panel"><div className="panel-b"><h2>Not permitted</h2><p className="muted mt1">This case is not in your caseload.</p></div></div>;

  const canWork = canWorkCase(snap.org.config, user, c);
  const owner = c.counsellorId ? users[c.counsellorId] : undefined;
  const cur = currentStep(c);
  const curP = cur ? pipelineOfStep(cur) : null;
  const prog = pipelineProgress(c);
  const stagesDone = prog.filter((x) => x.complete).length;
  const flags = slaFlags(c, snap.org.config);
  const docsPending = pendingReviewCount(c);
  const p = caseProgress(c);
  const s2 = stepState(c, 2);
  const seesAll = caseScopeOf(snap.org.config, user!.role) === "all";
  const dpOk = can("dataprotection.view");

  const exportJson = async () => {
    // The export honours the sensitive.read cell: a role that may download a record but not read its
    // special-category fields receives the record with those values withheld.
    const data = { ...(can("sensitive.read") ? c : redactSensitive(c)), exportedAt: new Date().toISOString(), exportedBy: user?.name };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `${c.ref}.json`; a.click();
    await log("Case exported", c.ref);
    toast(`${c.ref} exported`);
  };

  const pickStep = (n: number) => { setAdvanced(false); setSel(n); setTab("step"); setMobileSpine(false); };
  const toggleStage = (id: string) => setOpenStages((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const expandAll = () => setOpenStages(new Set(PIPELINE.map((x) => x.id)));
  const collapseAll = () => setOpenStages(new Set());
  const headKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = PIPELINE.length - 1;
    const to = e.key === "ArrowDown" ? (i === last ? 0 : i + 1) : e.key === "ArrowUp" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    headRefs.current[to]?.focus();
  };
  const hasReview = (n: number) => (n === 10 || n === 15) && c.documents.some((x) => x.step === n && x.status === "uploaded");

  const spine = (
    <>
      <h2 className="sr-only">Process pipeline</h2>
      <div className="pl-tools">
        <span>{stagesDone} of 9 stages complete</span>
        <span><button type="button" onClick={expandAll}>Expand all</button> · <button type="button" onClick={collapseAll}>Collapse all</button></span>
      </div>
      <ol className="pipeline" aria-label="Process pipeline, 9 stages">
        {prog.map((pl, i) => {
          const open = openStages.has(pl.id);
          const headId = `pl-head-${pl.id}`, bodyId = `pl-body-${pl.id}`;
          const pct = pl.total ? Math.round((pl.done / pl.total) * 100) : pl.complete ? 100 : 0;
          const gates = pl.steps.flatMap((n) => { const g = STEP_BY_N[n].gate; return g ? [latestGate(c, g)] : []; });
          const awaiting = gates.some((g) => g?.status === "pending");
          const returned = gates.some((g) => g?.status === "returned" && !g.addressedAt);
          const review = pl.steps.some(hasReview);
          const stageFlags = flags.filter((x) => x.state !== "ok" && pl.steps.includes(x.step));
          return (
            <li key={pl.id} className={`pl-stage ${pl.complete ? "done" : ""} ${pl.current ? "current" : ""}`}>
              <h3 style={{ margin: 0 }}>
                <button type="button" className="pl-head" id={headId} aria-expanded={open} aria-controls={bodyId} onClick={() => toggleStage(pl.id)} onKeyDown={headKey(i)} ref={(el) => { headRefs.current[i] = el; }}>
                  <span className="pl-n" aria-hidden="true">{pl.complete ? <Check /> : pl.n}</span>
                  <span className="pl-txt">
                    <span className="pl-title">Stage {pl.n} of 9 · {pl.name}</span>
                    <span className="pl-meta">
                      <span>{pl.done}/{pl.total} steps</span>
                      {pl.current && <Pill tone="info">Current</Pill>}
                      {awaiting && <Pill tone="info">Awaiting TL</Pill>}
                      {returned && <Pill tone="bad">Returned</Pill>}
                      {review && <Pill tone="warn">Review</Pill>}
                      {stageFlags.map((f) => <Pill key={f.id} tone={statusTone(f.state)}>{f.days < 0 ? "Overdue" : `${f.days}d`}</Pill>)}
                    </span>
                  </span>
                  <span className="sr-only">{pl.complete ? ", complete" : pl.current ? ", current stage" : ""}</span>
                  <ChevronDown className="pl-chev" aria-hidden />
                </button>
              </h3>
              <div className="pl-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
              {open && (
                <div id={bodyId} className="pl-body" role="region" aria-labelledby={headId}>
                  <p className="pl-summary">{pl.summary}</p>
                  <ol>
                    {pl.steps.map((n) => {
                      const d = derivedStatus(c, n);
                      const def = STEP_BY_N[n];
                      const on = sel === n;
                      const gate = def.gate ? latestGate(c, def.gate) : undefined;
                      const f = flags.find((x) => x.step === n);
                      const cls = d === "done" ? "done" : d === "na" ? "na" : d === "active" ? (n === cur ? "current" : "active") : "locked";
                      return (
                        <li key={n}>
                          <button type="button" className={`spine-step ${cls}`} aria-current={on ? "step" : undefined} onClick={() => pickStep(n)}>
                            <span className="s-ico" aria-hidden="true">{d === "done" ? <Check /> : d === "na" ? <Minus /> : d === "locked" ? <Lock /> : null}</span>
                            <span className="grow" style={{ minWidth: 0 }}>
                              <span style={{ display: "block", lineHeight: 1.3 }}><span className="s-num">{n}.</span>{def.title}<span className="sr-only">{d === "done" ? ", completed" : d === "na" ? ", not applicable" : d === "locked" ? ", not yet available" : n === cur ? ", current step" : ", available"}</span></span>
                              {(gate?.status === "pending" || (gate?.status === "returned" && !gate.addressedAt) || (f && f.state !== "ok") || hasReview(n) || (def.optional && d === "active")) && (
                                <span className="s-tags">
                                  {gate?.status === "pending" && <Pill tone="info">Awaiting TL</Pill>}
                                  {gate?.status === "returned" && !gate.addressedAt && <Pill tone="bad">Returned</Pill>}
                                  {f && f.state !== "ok" && <Pill tone={statusTone(f.state)}>{f.days < 0 ? "Overdue" : `${f.days}d`}</Pill>}
                                  {hasReview(n) && <Pill tone="warn">Review</Pill>}
                                  {def.optional && d === "active" && <span className="xs muted">optional</span>}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [{ id: "step", label: "Step" }, ...(can("document.view") ? [{ id: "documents" as Tab, label: "Documents", count: docsPending || undefined }] : []), { id: "timeline", label: "Timeline" }, { id: "profile", label: "Profile" }];
  if (dpOk) tabs.push({ id: "dp", label: "Data protection", count: caseTransfers(c).length || undefined });
  const activeTab: Tab = tab === "dp" && !dpOk ? "step" : tab;

  return (
    <div className="stack">
      <div>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: -10 }} onClick={() => go({ page: "cases" })}><ArrowLeft aria-hidden /> {seesAll ? "All cases" : "My caseload"}</button>
      </div>

      <header className="panel" style={{ padding: "20px 22px" }}>
        <div className="flex wrap g4" style={{ alignItems: "flex-start" }}>
          <Ring pct={p.pct} size={116} stroke={10} tone={c.status === "completed" ? "ok" : c.status === "exited" ? "bad" : ""} label="Case completion" sub={`${p.done} of ${p.applicable}`} />
          <div className="grow" style={{ minWidth: 240 }}>
            <div className="flex aic g2 wrap">
              <h1 style={{ fontSize: 24 }}>{c.student.name}</h1>
              <Pill tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Pill>
            </div>
            <p className="ui small muted mt1">{c.ref} · opened {fmtDate(c.createdAt)} · {caseDestination(c)} · {caseProgramme(c)}</p>
            <p className="ui small mt1" style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
              <a href={`mailto:${c.student.email}`} className="flex aic g1" style={{ color: "var(--ink2)" }}><Mail aria-hidden style={{ width: 14, height: 14 }} />{c.student.email}</a>
              <a href={`tel:${c.student.phone}`} className="flex aic g1" style={{ color: "var(--ink2)" }}><Phone aria-hidden style={{ width: 14, height: 14 }} />{c.student.phone}</a>
            </p>
            <p className="mt2" style={{ fontSize: "var(--fs-md)" }}>
              {cur && curP ? <><b className="ui">Stage {curP.n} of 9 · {curP.name}</b> <span className="muted">· step {cur}. {STEP_BY_N[cur].title} · {STEP_BY_N[cur].owner}</span></> : <span className="ui strong" style={{ color: "var(--green-text)" }}>All steps complete</span>}
            </p>
            {flags.filter((f) => f.state !== "ok").length > 0 && (
              <div className="flex wrap g1 mt2">{flags.filter((f) => f.state !== "ok").map((f) => <Pill key={f.id} tone={statusTone(f.state)} icon={<CalendarClock aria-hidden />}>{f.label} · {f.days < 0 ? `${-f.days}d overdue` : f.days === 0 ? "today" : `${f.days}d`}</Pill>)}</div>
            )}
          </div>
          <div className="stack-sm" style={{ minWidth: 220 }}>
            <div className="soft" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              {owner ? <><Avatar name={owner.name} size={30} /><div className="grow" style={{ minWidth: 0 }}><p className="ui small strong truncate">{owner.name}</p><p className="ui xs muted">Counsellor</p></div></> : <span className="ui small" style={{ color: "var(--accent-text)", fontWeight: 600 }}>No counsellor assigned</span>}
              {can("assignment.write") && c.status === "open" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAssign(true)}>{owner ? "Reassign" : "Assign"}</button>}
            </div>
            <div className="flex wrap g1">
              {can("case.write") && canWork && (
                c.status === "open" ? (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatusDlg("hold")}><PauseCircle aria-hidden />Hold</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStatusDlg("deferred")}><CalendarClock aria-hidden />Defer</button>
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setStatusDlg("exited")}><Flag aria-hidden />Exit</button>
                  </>
                ) : c.status !== "completed" ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setStatusDlg("open")}><Play aria-hidden />Reopen case</button> : null
              )}
              {can("case.download") && <button type="button" className="btn btn-secondary btn-sm" onClick={exportJson} title="Export case record as JSON"><Download aria-hidden />Export</button>}
            </div>
          </div>
        </div>
        {(c.status === "exited" && c.exit) && <div className="mt3"><Notice tone="bad">Exited at step {c.exit.step} ({exitStageLabel(c.exit.step)}) on {fmtDate(c.exit.at)} — <b>{c.exit.code}</b>{c.exit.reason ? `: ${c.exit.reason}` : ""}</Notice></div>}
        {(c.status === "hold" && c.hold) && <div className="mt3"><Notice tone="warn">On hold{c.hold.reviewDate ? ` · review ${fmtDate(c.hold.reviewDate)}` : ""}{c.hold.country ? ` · ${c.hold.country}, ${c.hold.programme}, intake ${fmtMonth(c.hold.intake)}` : ""}{c.hold.note ? ` — ${c.hold.note}` : ""}</Notice></div>}
        {(c.status === "deferred" && c.hold) && <div className="mt3"><Notice tone="gold">Deferred{c.hold.intake ? ` to the ${fmtMonth(c.hold.intake)} intake` : ""}{c.hold.reviewDate ? ` · review ${fmtDate(c.hold.reviewDate)}` : ""}{c.hold.note ? ` — ${c.hold.note}` : ""}</Notice></div>}
        {c.disposal && <div className="mt3"><Notice tone="navy">Personal data on this case was destroyed on {fmtDate(c.disposal.at)} by {c.disposal.byName} — {c.disposal.basis}. Outcomes and dates are retained for reporting.</Notice></div>}
        {c.legalHold && <div className="mt3"><Notice tone="info">Legal hold placed {fmtDate(c.legalHold.at)} by {c.legalHold.byName} — {c.legalHold.reason} Disposal is suspended.</Notice></div>}
        <div className="mt4"><StageTrack prog={prog} /></div>
      </header>

      <div className="workspace">
        <div>
          <button type="button" className="btn btn-secondary btn-block mobile-only" style={{ justifyContent: "space-between" }} onClick={() => setMobileSpine((v) => !v)} aria-expanded={mobileSpine} aria-controls="spine-panel">
            <span className="truncate">Stage {pipelineOfStep(sel).n} of 9 · {sel}. {STEP_BY_N[sel].title}</span>{mobileSpine ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </button>
          <aside id="spine-panel" className={`panel spine ${mobileSpine ? "open" : ""}`} aria-label="Process pipeline">{spine}</aside>
        </div>
        <section className="panel" style={{ minWidth: 0 }}>
          <Tabs tabs={tabs} value={activeTab} onChange={setTab} label="Case sections" />
          <div className="panel-b">
            <TabPanel id="step" active={activeTab === "step"}>
              <StepPanel key={`${c.id}-${sel}`} c={c} n={sel} canWork={canWork} focusHeading={advanced} onAdvance={(next) => { setAdvanced(true); setSel(next); }} />
            </TabPanel>
            <TabPanel id="documents" active={activeTab === "documents"}>
              <div className="stack">
                <div><h2 className="mb2 flex aic g2" style={{ fontSize: 15.5 }}><FileText aria-hidden style={{ width: 16, height: 16 }} />University application documents · step 10</h2><DocumentChecklist c={c} step={10} canUpload={can("document.write") && canWork} canReview={can("review.write") && canWork} canDownload={can("document.download")} canDelete={can("document.delete") && canWork} /></div>
                <div><h2 className="mb2 flex aic g2" style={{ fontSize: 15.5 }}><ShieldCheck aria-hidden style={{ width: 16, height: 16 }} />Visa file documents · step 15</h2><DocumentChecklist c={c} step={15} canUpload={can("document.write") && canWork} canReview={can("review.write") && canWork} canDownload={can("document.download")} canDelete={can("document.delete") && canWork} /></div>
              </div>
            </TabPanel>
            <TabPanel id="timeline" active={activeTab === "timeline"}>
              <Timeline c={c} />
            </TabPanel>
            <TabPanel id="profile" active={activeTab === "profile"}>
              <ProfileSummary c={c} sensitiveOk={can("sensitive.read")} studentSubmittedAt={s2.studentSubmittedAt} />
            </TabPanel>
            {dpOk && (
              <TabPanel id="dp" active={activeTab === "dp"}>
                <CaseDataProtection c={c} />
              </TabPanel>
            )}
          </div>
        </section>
      </div>

      {assign && <AssignDialog c={c} onClose={() => setAssign(false)} />}
      {statusDlg && <StatusDialog c={c} status={statusDlg} onClose={() => setStatusDlg(null)} onDone={(s) => toast(s)} />}
    </div>
  );
}

function iconFor(type: string) {
  switch (type) {
    case "step": case "complete": return <Check aria-hidden />;
    case "gate": return <ShieldCheck aria-hidden />;
    case "doc": return <FileText aria-hidden />;
    case "student": return <GraduationCap aria-hidden />;
    case "exit": return <Flag aria-hidden />;
    case "hold": case "defer": return <PauseCircle aria-hidden />;
    case "loop": case "reopen": return <RotateCcw aria-hidden />;
    default: return <Play aria-hidden />;
  }
}

export function Timeline({ c, limit }: { c: CaseRecord; limit?: number }) {
  const list = limit ? c.events.slice(0, limit) : c.events;
  if (!list.length) return <p className="muted">No events recorded yet.</p>;
  return (
    <ol className="timeline" aria-label="Case timeline">
      {list.map((e) => (
        <li key={e.id} className="tl-item">
          <span className={`tl-dot ${e.type}`} aria-hidden="true">{iconFor(e.type)}</span>
          <div className="tl-body">
            <p>{e.text}</p>
            <p className="who">{fmtDateTime(e.at)} · {e.byName}{e.step ? ` · step ${e.step}` : ""}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProfileSummary({ c, sensitiveOk, studentSubmittedAt }: { c: CaseRecord; sensitiveOk: boolean; studentSubmittedAt?: string }) {
  const s1 = stepState(c, 1), s2 = stepState(c, 2), s6 = stepState(c, 6), s14 = stepState(c, 14);
  const block = (n: number, values: Record<string, unknown>) => (
    <div className="form-grid soft" style={{ padding: 16 }}>
      {STEP_BY_N[n].fields.filter((f) => isVisible(f, values) && f.type !== "checkbox").map((f) => f.sensitive && !sensitiveOk ? <div key={f.id} className="field" style={{ gap: 2 }}><span className="label" style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12.5 }}>{f.label}</span><span className="ui small muted">Restricted</span></div> : <ValueDisplay key={f.id} f={f} value={values[f.id]} />)}
    </div>
  );
  return (
    <div className="stack">
      <div><h2 className="mb2" style={{ fontSize: 15.5 }}>Enquiry</h2>{block(1, s1.values)}</div>
      <div><h2 className="mb2" style={{ fontSize: 15.5 }}>Student profile {studentSubmittedAt && <span className="xs muted" style={{ fontWeight: 400 }}>· submitted by the student {fmtDateTime(studentSubmittedAt)}</span>}</h2>{block(2, s2.values)}</div>
      {s6.status === "done" && <div><h2 className="mb2" style={{ fontSize: 15.5 }}>Programme and destination</h2>{block(6, s6.values)}</div>}
      {s14.status === "done" && <div><h2 className="mb2" style={{ fontSize: 15.5 }}>Final offer</h2>{block(14, s14.values)}</div>}
    </div>
  );
}

function StatusDialog({ c, status, onClose, onDone }: { c: CaseRecord; status: CaseStatus; onClose: () => void; onDone: (msg: string) => void }) {
  const { user, log } = useSession();
  const [code, setCode] = useState(EXIT_CODES[0]);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [intake, setIntake] = useState("");
  const titles: Record<CaseStatus, string> = { open: "Reopen case", hold: "Place case on hold", deferred: "Defer intake", exited: "Exit case", completed: "Complete" };
  const submit = async () => {
    if (!user) return;
    if (status === "exited" && !reason.trim()) return;
    await store.mutateCase(c.id, (x) => changeStatus(x, status, user, { code, reason: reason.trim(), reviewDate: date || undefined, intake: intake || undefined }));
    await log(titles[status], c.ref, status === "exited" ? `${code}${reason ? ` — ${reason}` : ""}` : reason || undefined);
    onDone(`${c.ref} — ${STATUS_LABEL[status]}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${titles[status]} — ${c.ref}`} width={500}>
      <div className="stack-sm">
        {status === "exited" && <SelectField label="Exit reason code" value={code} onChange={setCode} options={EXIT_CODES} required placeholder="Select a reason" />}
        {status === "deferred" && <Field label="Deferred to intake" required htmlFor="dlg-intake"><input id="dlg-intake" type="month" className="input" value={intake} onChange={(e) => setIntake(e.target.value)} required /></Field>}
        {(status === "hold" || status === "deferred") && <Field label="Review date" htmlFor="dlg-date"><input id="dlg-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        {status !== "open" && <TextArea label={status === "exited" ? "Explanation" : "Note"} required={status === "exited"} value={reason} onChange={setReason} rows={3} />}
        {status === "open" && <p className="muted">The case returns to its current step with every recorded value intact.</p>}
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className={status === "exited" ? "btn btn-danger" : "btn btn-primary"} disabled={(status === "exited" && (!reason.trim() || !code)) || (status === "deferred" && !intake)} onClick={submit}>{titles[status]}</button></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Data protection on a single case: what left the country, and when the record goes
// ---------------------------------------------------------------------------

function CaseDataProtection({ c }: { c: CaseRecord }) {
  const { snap } = useSession();
  const config = snap.org.config;
  const transfers = caseTransfers(c);
  const state = retentionState(c, config);
  const due = retentionDue(c, config);
  const days = due ? daysUntil(due.due) : null;
  const consent = stepState(c, 2).values.consent === "Yes";
  const consentDate = stepState(c, 2).values.consentDate as string | undefined;

  return (
    <div className="stack">
      <div>
        <h2 className="mb2" style={{ fontSize: 15.5 }}>Lawful basis</h2>
        <div className="soft" style={{ padding: 12 }}>
          {consent
            ? <p className="small">Data processing consent recorded{consentDate ? ` on ${fmtDate(consentDate)}` : ""}. Covers personal, family, financial and health data supplied to Lyceum Placements.</p>
            : <Notice tone="warn">No processing consent is recorded on this case. Consent is captured at step 2 and should be in place before the profile is worked.</Notice>}
        </div>
      </div>

      <div>
        <h2 className="mb2" style={{ fontSize: 15.5 }}>Retention</h2>
        <div className="soft" style={{ padding: 12 }}>
          <div className="flex wrap g2 aic">
            <Pill tone={state === "overdue" ? "bad" : state === "due_soon" ? "warn" : state === "held" ? "info" : state === "disposed" ? "navy" : "neutral"}>{RETENTION_LABEL[state]}</Pill>
            {due && <span className="small">Disposal due {fmtDate(due.due.toISOString())} · {due.months} months from {due.basis.toLowerCase()}</span>}
          </div>
          <p className="xs muted mt1">
            {state === "none"
              ? "The retention clock starts when the case exits, completes or goes dormant."
              : days == null ? "" : days < 0 ? `${Math.abs(days)} days past the disposal date.` : `${days} days remaining.`}
          </p>
        </div>
      </div>

      <div>
        <h2 className="mb2" style={{ fontSize: 15.5 }}>Cross-border transfers</h2>
        {transfers.length === 0 ? (
          <div className="soft" style={{ padding: 12 }}>
            <p className="small muted">Nothing has left Sri Lanka on this case yet. Records are written when applications are submitted (step 11), acceptance documents are shared (step 18) and the visa is lodged (step 23).</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl" style={{ minWidth: 620 }}>
              <caption className="sr-only">Personal data transferred out of Sri Lanka on this case</caption>
              <thead><tr><th scope="col">When</th><th scope="col">Recipient</th><th scope="col">Country</th><th scope="col">Data</th><th scope="col">Safeguard</th></tr></thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap muted">{fmtDate(t.at)}<p className="sub">Step {t.step}</p></td>
                    <td><p className="primary truncate" style={{ maxWidth: 200 }}>{t.recipient}</p>{t.recipientApproved === false && <p className="sub" style={{ color: "var(--exit)" }}>Not on the approved list</p>}</td>
                    <td className="nowrap">{t.country}</td>
                    <td className="xs muted" style={{ maxWidth: 180 }}>
                      <span aria-hidden="true">{t.dataCategories.slice(0, 2).join(", ")}{t.dataCategories.length > 2 ? ` +${t.dataCategories.length - 2} more` : ""}</span>
                      <span className="sr-only">{t.dataCategories.join(", ")}</span>
                    </td>
                    <td><Pill tone={t.safeguard === "None recorded" ? "bad" : "ok"}>{t.safeguard}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xs muted mt2">The full register, disposal and legal holds are managed under Data protection.</p>
      </div>
    </div>
  );
}

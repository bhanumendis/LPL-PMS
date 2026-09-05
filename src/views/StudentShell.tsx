/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useState } from "react";
import { Check, LogOut, Phone, Mail, ChevronDown, ArrowRight, Sparkles, CalendarClock } from "lucide-react";
import { useSession, Wordmark, LiveBadge, Copyright, ThemeToggle, useDocumentTitle } from "@/App";
import { store } from "@/lib/store";
import { PIPELINE, STEP_BY_N, ORDERED_STEP_NUMBERS, pipelineOfStep } from "@/lib/spine";
import { studentTasks, pipelineProgress, currentPipeline, derivedStatus, stepState, saveStepValues, completeStep, fmtDate, fmtDateTime, fmtMonth, daysUntil, currentStep, todayInput, caseProgress, caseDestination, caseProgramme } from "@/lib/logic";
import { Pill, statusTone, STATUS_LABEL, Panel, Notice, FieldInput, isVisible, missingRequired, useToast, Avatar, Empty, ValueDisplay } from "@/lib/ui";
import { Ring, StageTrack } from "@/lib/charts";
import { DocumentChecklist } from "@/views/Documents";
import { Timeline } from "@/views/CaseWorkspace";
import type { CaseRecord } from "@/lib/types";

type Page = "home" | "profile" | "documents" | "journey";

/** The student-facing view of the case timeline: internal review commentary is withheld, step names use student wording. */
function studentView(c: CaseRecord): CaseRecord {
  const events = c.events.flatMap((e) => {
    const title = e.step ? STEP_BY_N[e.step].studentTitle : "";
    if (e.type === "gate") {
      if (/approved/i.test(e.text)) return [{ ...e, text: `Internal review completed${title ? ` — ${title}` : ""}`, byName: "Lyceum Placements" }];
      if (/returned|addressed/i.test(e.text)) return [];
      return [{ ...e, text: `Internal review started${title ? ` — ${title}` : ""}`, byName: "Lyceum Placements" }];
    }
    if (e.type === "step") return [{ ...e, text: title ? (/not applicable/i.test(e.text) ? `Not required — ${title}` : /reopened/i.test(e.text) ? `Reopened — ${title}` : title) : e.text }];
    if (e.type === "loop") return [{ ...e, text: title ? `Updated — ${title}` : "Your case was updated", byName: "Lyceum Placements" }];
    return [e];
  });
  return { ...c, events };
}
const TITLES: Record<Page, string> = { home: "My placement", profile: "Profile", documents: "Documents", journey: "Journey" };
const COUNSELLOR_RECORDS = "Your counsellor records this step.";

export function StudentShell() {
  const { user, cases, signOut, route, go, snap } = useSession();
  const c = Object.values(cases).find((x) => x.studentUserId === user?.id);
  const page = (route.page === "home" ? "home" : route.page) as Page;
  useDocumentTitle(TITLES[page] ?? "My placement");
  if (!user) return null;
  const nav: { id: Page; label: string }[] = [{ id: "home", label: "My placement" }, { id: "profile", label: "Profile" }, { id: "documents", label: "Documents" }, { id: "journey", label: "Journey" }];
  return (
    <div>
      <header className="topbar student-top" style={{ height: "auto", minHeight: 68 }}>
        <Wordmark size="sm" />
        <nav className="student-nav" aria-label="Main">
          {nav.map((n) => <button key={n.id} type="button" aria-current={page === n.id ? "page" : undefined} onClick={() => go({ page: n.id })}>{n.label}</button>)}
        </nav>
        <div className="flex aic g2">
          <LiveBadge />
          <ThemeToggle />
          <button type="button" onClick={signOut} className="icon-btn" aria-label="Sign out" title="Sign out"><LogOut aria-hidden /></button>
        </div>
      </header>
      <main className="student-wrap" id="main" tabIndex={-1}>
        <div key={page} className="page">
          {!c ? <Empty title="No application is linked to this account" hint="Contact Lyceum Placements to have your case linked to your sign-in." /> :
            page === "profile" ? <ProfilePage c={c} /> : page === "documents" ? <DocumentsPage c={c} /> : page === "journey" ? <JourneyPage c={c} /> : <HomePage c={c} />}
        </div>
      </main>
      <footer className="student-wrap flex aic jcb wrap g2" style={{ paddingTop: 0 }}>
        <span className="ui xs muted">{snap.org.config.orgName}</span>
        <Copyright />
      </footer>
    </div>
  );
}

function HomePage({ c }: { c: CaseRecord }) {
  const { users, go, user } = useSession();
  const owner = c.counsellorId ? users[c.counsellorId] : undefined;
  const tasks = studentTasks(c);
  const prog = pipelineProgress(c);
  const stage = currentPipeline(c);
  const cur = currentStep(c);
  const p = caseProgress(c);
  const s6 = stepState(c, 6), s13 = stepState(c, 13), s14 = stepState(c, 14), s21 = stepState(c, 21), s27 = stepState(c, 27), s28 = stepState(c, 28), s30 = stepState(c, 30);
  const lapse = s13.values.offerLapseDate as string | undefined;
  const lapseDays = lapse ? daysUntil(new Date(lapse)) : null;
  const facts: { label: string; value: string }[] = [];
  if (s14.status === "done") facts.push({ label: "University", value: `${s14.values.university} — ${s14.values.programme}, ${s14.values.country}` });
  else if (s6.status === "done") facts.push({ label: "Programme and destination", value: `${String(s6.values.programmes ?? "").split("\n")[0]} · ${(s6.values.countries as string[] | undefined)?.join(", ")}` });
  if (s13.values.commencementDate) facts.push({ label: "Commencement", value: fmtDate(String(s13.values.commencementDate)) });
  if (lapse && s14.status !== "done") facts.push({ label: "Offer lapse date", value: fmtDate(lapse) });
  if (s21.status === "done") facts.push({ label: `${s21.values.docType} issued`, value: `${s21.values.reference} · ${fmtDate(String(s21.values.receivedDate))}` });
  if (s27.status === "done") facts.push({ label: "Visa", value: `${s27.values.outcome} · ${fmtDate(String(s27.values.decisionDate))}` });
  if (s28.values.travelDate) facts.push({ label: "Travel date", value: fmtDate(String(s28.values.travelDate)) });
  if (s30.values.briefingDate) facts.push({ label: "Pre-departure briefing", value: fmtDate(String(s30.values.briefingDate)) });
  const firstName = (user?.name ?? c.student.name).split(" ")[0];
  const nextIdx = cur ? ORDERED_STEP_NUMBERS.indexOf(cur) : -1;
  const nextStep = nextIdx >= 0 ? ORDERED_STEP_NUMBERS.slice(nextIdx + 1).find((n) => !STEP_BY_N[n].optional) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Hello, {firstName}</h1><p>{c.ref} · {caseDestination(c)} · {caseProgramme(c)} · opened {fmtDate(c.createdAt)}</p></div>
        <Pill tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Pill>
      </div>
      {c.status === "hold" && <Notice tone="warn">Your application is on hold{c.hold?.reviewDate ? ` and will be reviewed on ${fmtDate(c.hold.reviewDate)}` : ""}. Your counsellor will contact you.</Notice>}
      {c.status === "deferred" && <Notice tone="gold">Your intake has been deferred{c.hold?.intake ? ` to ${fmtMonth(c.hold.intake)}` : ""}. Your counsellor will contact you ahead of the new intake.</Notice>}
      {c.status === "exited" && <Notice tone="neutral">This application is closed. Contact Lyceum Placements if you would like to reopen it.</Notice>}
      {c.status === "completed" && <Notice tone="ok">Your placement is complete. Thank you for choosing Lyceum Placements.</Notice>}

      <section className="panel stagger" aria-label="Where you are now" style={{ padding: "24px 26px" }}>
        <div className="hero">
          <Ring pct={p.pct} size={176} stroke={13} tone={c.status === "completed" ? "ok" : ""} label="Your progress" sub={`${p.done} of ${p.applicable} steps`} />
          <div className="hero-txt">
            <p className="ui xs muted" style={{ letterSpacing: ".04em" }}>Where you are now</p>
            <h2>{c.status === "completed" ? "Placement complete" : stage.studentName}</h2>
            <p className="ink2">{cur ? STEP_BY_N[cur].studentTitle : "Every step has been recorded."}{cur && STEP_BY_N[cur].studentAction ? " — this one needs you." : ""}</p>
            <div className="flex wrap g1">
              {cur && <Pill tone="warn">Stage {stage.n} of 9 · {STEP_BY_N[cur].studentTitle}</Pill>}
              {cur && STEP_BY_N[cur].gate && <Pill tone="info">Under internal review</Pill>}
              <Pill tone="neutral">{caseDestination(c)}</Pill>
            </div>
            {nextStep && <div className="next-box"><p className="nb-label">Coming next</p><p><b className="ui">{STEP_BY_N[nextStep].studentTitle}</b> · {pipelineOfStep(nextStep).studentName}</p></div>}
          </div>
        </div>
        <div className="mt4"><StageTrack prog={prog} labels="name" /></div>
        <p className="xs muted mt2">Completion is measured against the {p.applicable} steps that apply to your case, across 9 stages.</p>
      </section>

      <div className="grid grid-3 stagger">
        <Panel title="What we need from you" className="span2">
          {tasks.length === 0 ? <p className="ink2">Nothing is required from you right now. Your counsellor is working on the next step.</p> : (
            <ul className="stack-sm">
              {tasks.map((t) => (
                <li key={t.id} className={`task ${t.tone}`}>
                  <span><span className="t-title" style={{ display: "block" }}>{t.label}</span>{t.detail && <span className="t-detail">{t.detail}</span>}</span>
                  {t.step === 2 && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "profile" })}>Open profile <ArrowRight aria-hidden /></button>}
                  {(t.step === 10 || t.step === 15) && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "documents" })}>Open documents <ArrowRight aria-hidden /></button>}
                  {(t.step === 26 || t.step === 29) && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "journey", step: t.step })}>Confirm <ArrowRight aria-hidden /></button>}
                  {t.step === 13 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => go({ page: "journey" })}>View</button>}
                  {t.step === 22 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => go({ page: "journey" })}>View</button>}
                </li>
              ))}
            </ul>
          )}
          {lapseDays !== null && s14.status !== "done" && lapseDays >= 0 && lapseDays <= 21 && <div className="mt3"><Notice tone="warn">Your offer lapses in {lapseDays} day{lapseDays === 1 ? "" : "s"} ({fmtDate(lapse)}). Confirm your choice with your counsellor.</Notice></div>}
        </Panel>
        <Panel title="Your counsellor">
          {owner ? (
            <div className="flex g3" style={{ alignItems: "flex-start" }}>
              <Avatar name={owner.name} size={48} />
              <div className="small">
                <p className="ui strong">{owner.name}</p>
                <p className="muted">{owner.branch ? `${owner.branch} office` : "Lyceum Placements"}</p>
                {owner.email && <p className="mt2 flex aic g1"><Mail aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} /><a href={`mailto:${owner.email}`}>{owner.email}</a></p>}
                {owner.phone && <p className="flex aic g1"><Phone aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} /><a href={`tel:${owner.phone}`}>{owner.phone}</a></p>}
              </div>
            </div>
          ) : <p className="ink2">A counsellor will be assigned to your case shortly. You can complete your profile in the meantime.</p>}
        </Panel>
      </div>

      <div className="grid grid-3 stagger">
        {facts.length > 0 && (
          <Panel title="Key details" className="span2">
            <dl className="form-grid">{facts.map((f) => <div key={f.label}><dt className="ui xs muted">{f.label}</dt><dd className="ui small" style={{ margin: 0 }}>{f.value}</dd></div>)}</dl>
          </Panel>
        )}
        <Panel title="Recent updates" className={facts.length ? "" : "span2"}>
          <Timeline c={studentView(c)} limit={5} />
          <button type="button" className="btn btn-ghost btn-sm mt2" onClick={() => go({ page: "journey" })}>Full journey <ArrowRight aria-hidden /></button>
        </Panel>
        {facts.length === 0 && (
          <Panel title="Service levels that protect you">
            <ul className="stack-sm small ink2">
              <li className="flex g2"><CalendarClock aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>Your Course Information Sheet is sent within 7 days of your profile being confirmed.</span></li>
              <li className="flex g2"><CalendarClock aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>Three reminders go to you and your counsellor from 21 days before an offer lapses.</span></li>
              <li className="flex g2"><Sparkles aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>We check in three months after you arrive.</span></li>
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ProfilePage({ c }: { c: CaseRecord }) {
  const { user, log, can } = useSession();
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
    await store.mutateCase(c.id, (x) => saveStepValues(x, 2, values, user, true));
    await log("Profile submitted", c.ref);
    toast("Profile submitted to your counsellor");
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Profile</h1><p>Your academic history, family and sponsor details and English test results. Your counsellor uses this to assess eligibility and recommend programmes.</p></div>{editable && <Pill tone={filled === req ? "ok" : "warn"}>{filled} of {req} required answered</Pill>}</div>
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

function DocumentsPage({ c }: { c: CaseRecord }) {
  const { can } = useSession();
  const canWrite = can("document.write");
  const canDownload = can("document.download");
  const d10 = derivedStatus(c, 10), d15 = derivedStatus(c, 15);
  const section = (n: 10 | 15, d: string, title: string, intro: string, lockedMsg: string) => (
    <Panel title={title} action={d === "done" ? <Pill tone="ok" icon={<Check aria-hidden />}>Accepted</Pill> : d === "active" ? <Pill tone="warn">Open</Pill> : <Pill>Not yet open</Pill>}>
      {d === "locked" ? <p className="ink2">{lockedMsg}</p> : (
        <>
          <p className="small muted mb3">{intro} {d === "done" ? "This set has been accepted." : canWrite ? "Upload one PDF, JPG, PNG or Word file per document, up to 25 MB, or drag a file onto a row. Returned documents show the reason and can be replaced." : "Your counsellor uploads documents on your behalf. Returned documents show the reason."}</p>
          <DocumentChecklist c={c} step={n} canUpload={c.status === "open" && d !== "done" && canWrite} canReview={false} canDownload={canDownload} compact />
        </>
      )}
    </Panel>
  );
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Documents</h1><p>Everything you upload is reviewed by your counsellor. Accepted documents are shared with universities and visa authorities as required.</p></div></div>
      {section(10, d10, "University application documents", "Required for your applications.", "Your counsellor will open this list once your programme and destination are confirmed and the document checklist has been issued.")}
      {section(15, d15, "Visa file documents", "Required for financial verification and your visa file.", "Your counsellor will open this list once an offer has been received.")}
    </div>
  );
}

function JourneyPage({ c }: { c: CaseRecord }) {
  const { user, route, log, can } = useSession();
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
    await log(`Step ${n} confirmed by student`, c.ref, STEP_BY_N[n].title);
    toast("Confirmed"); setOpen(null); setValues({});
  };
  const p = caseProgress(c);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Journey</h1><p>Every step from enquiry to arrival, with what has been completed so far.</p></div><Pill tone="neutral">Stage {current.n} of 9 · {p.done} of {p.applicable} steps recorded</Pill></div>
      <div className="stack-sm">
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
                        <div className="flex wrap aic jcb g2">
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

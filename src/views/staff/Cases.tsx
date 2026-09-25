/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The case list. The server filters, orders and pages it; the browser never holds more than
 * the rows on screen.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Search, UserRoundPlus } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso, hashPassword, passwordProblem } from "@/lib/store";
import { caseScopeOf } from "@/lib/rbac";
import { PIPELINE, STEP_BY_N, DESTINATIONS } from "@/lib/spine";
import { fmtDateTime, newCaseRef, mkEvent, todayInput, daysSince } from "@/lib/logic";
import { useRowSignals, type CaseSignals } from "@/lib/signals";
import { BP, SEARCH_MIN, useDebounced, useMediaQuery } from "@/lib/hooks";
import { useCaseCount, useCasePage, useDashboard } from "@/lib/useRead";
import type { CaseFilter } from "@/lib/queries";
import { Pill, statusTone, STATUS_LABEL, Modal, Notice, useToast, EmptyState, Avatar, TextField, SelectField, TextArea, PageHeader, FilterBar, CardList, MiniStageTrack, SeverityChip, ListSkeleton, ReadError, PageFooter } from "@/lib/ui";
import type { CaseRecord, CaseStatus, User } from "@/lib/types";
import { EVENTS } from "@/lib/audit";

/** The case's most urgent attention label as one chip, with a count of the rest. */
function AttentionChips({ s }: { s?: CaseSignals }) {
  if (!s || s.attention.length === 0) return <span className="muted">—</span>;
  const [top, ...rest] = s.attention;
  return (
    <span className="flex aic wrap g1">
      <SeverityChip severity={top.severity}>{top.label}</SeverityChip>
      {rest.length > 0 && <span className="ui xs muted" title={rest.map((a) => a.label).join(" · ")}>+{rest.length} more</span>}
    </span>
  );
}

/** Shown beside an admin-users failure when the Edge Function is not on the project yet. */
const NOT_DEPLOYED_HINT = "Deploy the admin-users function (supabase/functions/admin-users) to issue sign-ins from here.";

export function CasesPage() {
  const { users, snap, user, can, go, route } = useSession();
  const config = snap.org.config;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  // Deep links: #/cases/stage:{id} presets the stage filter; #/cases/attention the attention
  // filter; #/cases/new opens the create dialog.
  const [stage, setStage] = useState(route.id?.startsWith("stage:") ? route.id.slice(6) : "");
  const [owner, setOwner] = useState("");
  const [attention, setAttention] = useState(route.id === "attention");
  const [assignFor, setAssignFor] = useState<AssignTarget | null>(null);
  const [creating, setCreating] = useState(route.id === "new");
  // A deep link that arrives while the page is already mounted (dashboard stage flow, palette) still applies.
  useEffect(() => {
    if (route.id?.startsWith("stage:")) setStage(route.id.slice(6));
    if (route.id === "new") setCreating(true);
    if (route.id === "attention") setAttention(true);
  }, [route.id]);
  const phone = useMediaQuery(BP.mobile);

  const scope = caseScopeOf(config, user!.role);
  const all = scope === "all";
  const canCreate = can("case.write") && (scope === "all" || scope === "assigned");
  const canAssign = can("assignment.write");

  // The server filters, orders (open cases first, then most recently updated) and pages; the
  // browser holds one page at a time.
  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= SEARCH_MIN;
  const stageN = PIPELINE.find((p) => p.id === stage)?.n;
  const filter = useMemo<CaseFilter>(() => ({
    ...(searching ? { q: term } : {}),
    ...(status ? { status: [status as CaseStatus] } : {}),
    ...(stageN ? { stage: stageN } : {}),
    ...(owner ? { counsellor: owner === "unassigned" ? "none" : owner } : {}),
    ...(attention ? { attention: true } : {}),
  }), [searching, term, status, stageN, owner, attention]);
  const filtered = Object.keys(filter).length > 0;
  const page = useCasePage(filter);
  const matching = useCaseCount(filtered ? filter : null);
  const dashboard = useDashboard();
  const total = dashboard.data?.total ?? null;
  const signals = useRowSignals(page.rows);

  const counsellors = Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active);
  const searchId = React.useId();
  const shownOf = filtered ? matching.data : total;
  const context = page.loading ? "Loading…"
    : `${(shownOf ?? page.rows.length).toLocaleString()}${shownOf != null && shownOf >= 10_000 ? "+" : ""} ${filtered ? "matching" : `case${total === 1 ? "" : "s"}`}${attention ? " needing attention" : ""}`;

  return (
    <div className="stack">
      <PageHeader
        title={all ? "Cases" : "My caseload"}
        context={<span aria-live="polite">{context}</span>}
        actions={canCreate ? <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><UserRoundPlus aria-hidden />Create student</button> : undefined}
      />

      <FilterBar label="Filter cases">
        <div className={`filters ${all ? "cols-3" : "cols-2"}`}>
          <div className="input-wrap f-search"><Search aria-hidden /><label htmlFor={searchId} className="sr-only">Search cases</label><input id={searchId} className="input" placeholder="Search reference, name, email or destination" value={q} onChange={(e) => setQ(e.target.value)} type="search" aria-describedby={`${searchId}-hint`} /></div>
          <div><label className="sr-only" htmlFor={`${searchId}-st`}>Status</label><select id={`${searchId}-st`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="sr-only" htmlFor={`${searchId}-sg`}>Stage</label><select id={`${searchId}-sg`} className="input" value={stage} onChange={(e) => setStage(e.target.value)}><option value="">All stages</option>{PIPELINE.map((p) => <option key={p.id} value={p.id}>{p.n}. {p.name}</option>)}</select></div>
          {all && <div><label className="sr-only" htmlFor={`${searchId}-ow`}>Counsellor</label><select id={`${searchId}-ow`} className="input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All counsellors</option><option value="unassigned">Unassigned</option>{counsellors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
          <button type="button" className={`btn btn-secondary ${attention ? "on" : ""}`} aria-pressed={attention} onClick={() => setAttention((v) => !v)}>Needs attention</button>
        </div>
        <p id={`${searchId}-hint`} className={`xs muted ${q.trim() && !searching ? "" : "sr-only"}`}>Type at least three characters to search.</p>
      </FilterBar>

      {page.error ? <ReadError error={page.error} onRetry={page.reload} />
        : page.loading ? <ListSkeleton label="Loading cases" />
        : page.rows.length === 0 ? (
          <EmptyState glyph={filtered ? "search" : "cases"} title={!filtered ? (all ? "No cases yet" : "No cases assigned to you") : "No cases match these filters"} reason={!filtered ? (all ? "Create the first student case here." : "Cases appear here once an administrator or Team Leader assigns them to you.") : "Clear a filter or search for a different reference."} action={!filtered && canCreate ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><UserRoundPlus aria-hidden />Create student</button> : undefined} />
        ) : phone ? (
        <CardList
          items={page.rows}
          keyOf={(c) => c.id}
          label={all ? "Cases" : "My caseload"}
          render={(c) => {
            const s = signals.get(c.id);
            const ownerU = c.counsellorId ? users[c.counsellorId] : undefined;
            const pl = PIPELINE[c.stage - 1] ?? PIPELINE[PIPELINE.length - 1];
            return (
              <div className="case-card">
                <div className="flex aic jcb g2">
                  <button type="button" className="row-btn ui strong" onClick={() => go({ page: "case", caseId: c.id })}>{c.ref}</button>
                  <Pill tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Pill>
                </div>
                <p className="ui small strong truncate">{c.studentName}</p>
                <p className="xs muted">Stage {pl.n} of 9 · {pl.name}{ownerU ? ` · ${ownerU.name}` : ""}</p>
                {s && <MiniStageTrack stages={s.stages} size="xs" />}
                <div className="flex aic wrap g2">
                  <AttentionChips s={s} />
                  {!ownerU && canAssign && c.status === "open" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAssignFor(c)}><UserRoundPlus aria-hidden />Assign</button>}
                </div>
              </div>
            );
          }}
        />
      ) : (
        <div className="panel table-wrap" aria-busy={page.refreshing}>
          <table className="tbl" style={{ minWidth: 1180 }}>
            <thead>
              <tr><th scope="col" style={{ minWidth: 140 }}>Reference</th><th scope="col" style={{ minWidth: 200 }}>Student</th><th scope="col">Destination</th><th scope="col" style={{ minWidth: 220 }}>Current step</th><th scope="col">Progress</th><th scope="col" style={{ minWidth: 170 }}>Counsellor</th><th scope="col">Status</th><th scope="col">Attention</th><th scope="col">Updated</th></tr>
            </thead>
            <tbody>
              {page.rows.map((c) => {
                const s = signals.get(c.id);
                const n = c.currentStep;
                const pl = PIPELINE[c.stage - 1] ?? PIPELINE[PIPELINE.length - 1];
                const ownerU = c.counsellorId ? users[c.counsellorId] : undefined;
                const open = () => go({ page: "case", caseId: c.id });
                return (
                  <tr key={c.id} className="row-link" onClick={open}>
                    <td><button type="button" className="row-btn" onClick={(e) => { e.stopPropagation(); open(); }}>{c.ref}</button>{c.createdAt && <p className="sub">{daysSince(c.createdAt)}d old</p>}</td>
                    <td><p className="primary">{c.studentName}</p><p className="sub">{c.studentEmail}</p></td>
                    <td>{c.destination}</td>
                    <td>{n ? <><p>{n}. {STEP_BY_N[n].title}</p><p className="sub">Stage {pl.n} of 9 · {pl.name}</p></> : <span className="muted">All steps complete</span>}</td>
                    <td className="progress-cell">{s && <><div className="flex aic g2"><MiniStageTrack stages={s.stages} label={`${c.ref}: stage ${pl.n} of 9, ${c.progressPct}% of steps recorded`} /><span className="ui xs tnum">{c.progressPct}%</span></div><p className="sub">{c.progressDone} of {c.progressApplicable} steps recorded</p></>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {ownerU ? <span className="flex aic g2"><Avatar name={ownerU.name} size={26} />{ownerU.name}</span> : canAssign && c.status === "open" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAssignFor(c)}><UserRoundPlus aria-hidden />Assign</button> : <span className="muted">Unassigned</span>}
                    </td>
                    <td><Pill tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Pill></td>
                    <td><AttentionChips s={s} /></td>
                    <td className="muted nowrap">{c.updatedAt ? fmtDateTime(c.updatedAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!page.loading && !page.error && <PageFooter shown={page.rows.length} total={shownOf} hasMore={page.hasMore} loadingMore={page.loadingMore} onMore={page.loadMore} noun="cases" />}

      {assignFor && <AssignDialog c={assignFor} onClose={() => setAssignFor(null)} />}
      {creating && <CreateStudentDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/** What assigning needs to know about a case: a list row or the document itself. */
export interface AssignTarget { id: string; ref: string; counsellorId?: string | null; studentName?: string; studentEmail?: string; student?: { name: string; email: string } }

export function AssignDialog({ c, onClose }: { c: AssignTarget; onClose: () => void }) {
  const { users, user, audit } = useSession();
  const toast = useToast();
  const counsellors = Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active);
  // Open caseloads come from the dashboard (the shared answer for roles that see every case).
  const dashboard = useDashboard();
  const load = useMemo(() => new Map((dashboard.data?.counsellors ?? []).map((x) => [x.id, x.open])), [dashboard.data]);
  const [pick, setPick] = useState(c.counsellorId ?? "");
  const [busy, setBusy] = useState(false);
  const name = c.student?.name ?? c.studentName ?? "";
  const email = c.student?.email ?? c.studentEmail ?? "";
  const submit = async () => {
    if (!pick || !user) return;
    setBusy(true);
    const target = users[pick];
    let previous: string | undefined;
    try {
    await store.mutateCase(c.id, (x) => {
      previous = x.counsellorId ? users[x.counsellorId]?.name ?? "previous counsellor" : undefined;
      x.counsellorId = pick; x.assignedAt = nowIso(); x.assignedBy = user.id;
      x.events.unshift(mkEvent(user, "assign", previous ? `Reassigned from ${previous} to ${target.name}` : `Assigned to ${target.name}`, 1));
      return x;
    });
    await audit(EVENTS.caseAssigned(c, target.name, previous));
    toast(`${c.ref} assigned to ${target.name}`);
    onClose();
    } catch { /* reported by the store */ } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${c.counsellorId ? "Reassign" : "Assign"} ${c.ref}`}>
      <p className="muted mb3">{name} · {email}</p>
      {counsellors.length === 0 ? <Notice tone="warn">No active counsellors. Create a counsellor profile under Staff first.</Notice> : (
        <div className="stack-sm" role="radiogroup" aria-label="Counsellor">
          {counsellors.map((u) => {
            const open = load.get(u.id);
            return (
              <label key={u.id} className="check" style={{ borderColor: pick === u.id ? "var(--accent-text)" : undefined, background: pick === u.id ? "var(--accent-soft)" : undefined }}>
                <input type="radio" name="counsellor" checked={pick === u.id} onChange={() => setPick(u.id)} />
                <Avatar name={u.name} size={30} />
                <span className="grow"><span className="ui strong" style={{ display: "block" }}>{u.name}</span><span className="xs muted">{u.role === "team_leader" ? "Team Leader" : "Counsellor"}{u.branch ? ` · ${u.branch}` : ""}{open != null ? ` · ${open} open` : dashboard.data ? " · 0 open" : ""}</span></span>
              </label>
            );
          })}
        </div>
      )}
      <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!pick || busy} onClick={submit}>{busy ? "Saving…" : "Confirm assignment"}</button></div>
    </Modal>
  );
}

/**
 * Opens a case for a student. With the account.write permission a sign-in can be issued in
 * the same step; on a server that goes through the admin-users Edge Function, and a failure
 * there leaves the case (and the student profile) in place so the sign-in can be issued later
 * from Staff.
 */
function CreateStudentDialog({ onClose }: { onClose: () => void }) {
  const { snap, user, users, audit, go, can } = useSession();
  const toast = useToast();
  const config = snap.org.config;
  const canAccount = can("account.write");
  const canAssign = can("assignment.write");
  const counsellors = Object.values(users).filter((u) => (u.role === "counsellor" || u.role === "team_leader") && u.active);
  const [f, setF] = useState({ name: "", email: "", phone: "", source: "", destination: "", area: "", note: "", counsellorId: user?.role === "counsellor" ? user.id : "", login: true, password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /** Set when the case exists but the server refused to issue the sign-in; the dialog then waits to be acknowledged. */
  const [created, setCreated] = useState<{ caseId: string; ref: string; error: string; notDeployed: boolean } | null>(null);
  const issue = canAccount && f.login;

  const finish = (caseId: string) => { onClose(); go({ page: "case", caseId }); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErr("");
    if (!f.name.trim() || !f.email.trim() || !f.phone.trim() || !f.source) return setErr("Name, contact number, email and enquiry source are required.");
    if (issue) { const problem = passwordProblem(f.password); if (problem) return setErr(problem); }
    setBusy(true);
    try {
    if (issue && await store.emailTaken(f.email)) { setBusy(false); return setErr("A profile with this email already exists."); }
    const server = store.server;
    const email = f.email.trim().toLowerCase();
    const name = f.name.trim();
    const phone = f.phone.trim();
    let ref = "";
    let studentId: string | undefined;
    if (server) {
      try { ref = await server.nextCaseRef(config.entityCode); } catch (ex) { setBusy(false); return setErr((ex as Error).message); }
    }
    const hash = issue && !server ? await hashPassword(f.password) : "";
    if (!server || issue) {
      await store.mutateOrg((o) => {
        if (!server) { o.config.caseCounter += 1; ref = newCaseRef(o.config.entityCode, o.config.caseCounter); }
        if (issue) { const su: User = { id: uid(), name, email, phone, role: "student", passwordHash: hash, active: true, createdAt: nowIso(), createdBy: user.id }; o.users[su.id] = su; studentId = su.id; }
        return o;
      });
    }
    const c: CaseRecord = {
      id: uid(), ref, studentUserId: studentId,
      student: { name, email, phone },
      counsellorId: f.counsellorId || undefined, assignedAt: f.counsellorId ? nowIso() : undefined, assignedBy: f.counsellorId ? user.id : undefined,
      status: "open",
      steps: {
        1: { status: "done", completedAt: nowIso(), completedBy: user.id, values: { source: f.source, enquiryDate: todayInput(), interestedArea: f.area, preferredDestination: f.destination, note: f.note } },
        2: { status: "pending", values: { fullName: name, interestedArea: f.area, destinations: f.destination ? [f.destination] : [] } },
      },
      documents: [], gates: [],
      events: [mkEvent(user, "create", `Enquiry received via ${f.source}. Case opened by ${user.name}.`, 1), ...(f.counsellorId ? [mkEvent(user, "assign", `Assigned to ${users[f.counsellorId]?.name}`, 1)] : [])],
      createdAt: nowIso(), updatedAt: nowIso(), rev: 1,
    };
    await store.createCase(c);
    await audit(EVENTS.caseOpened(c, f.source));
    if (issue && studentId) {
      if (server) {
        const r = await server.createSignIn({ appUserId: studentId, email, password: f.password, name, phone });
        if (!r.ok) {
          await audit(EVENTS.signInNotIssued(email, r.error));
          setBusy(false);
          toast(`Case ${ref} opened`);
          setCreated({ caseId: c.id, ref, error: r.error, notDeployed: !!r.notDeployed });
          return;
        }
      }
      await audit(EVENTS.signInIssued(email, "Student"));
    }
    toast(`Case ${ref} opened`);
    finish(c.id);
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };

  if (created) {
    return (
      <Modal open onClose={() => finish(created.caseId)} title="Create student" subtitle="Opens a case for the student. A sign-in can be issued at the same time or later from Staff.">
        <div className="stack">
          <Notice tone="ok">Case <b className="ui">{created.ref}</b> was created for {f.name.trim()}.</Notice>
          <Notice tone="bad" role="alert">
            <p>The student sign-in was not issued: {created.error}</p>
            {created.notDeployed && <p className="mt1">{NOT_DEPLOYED_HINT}</p>}
            <p className="mt1">The case is kept. An administrator can issue the sign-in later from Staff.</p>
          </Notice>
          <div className="modal-f"><button type="button" className="btn btn-primary" onClick={() => finish(created.caseId)}>Close</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Create student" subtitle="Opens a case for the student. A sign-in can be issued at the same time or later from Staff." width={680}>
      <form onSubmit={submit} className="stack" noValidate>
        <div className="form-grid">
          <TextField label="Student full name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required autoComplete="off" />
          <TextField label="Contact number" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} required type="tel" inputMode="tel" autoComplete="off" />
          <TextField label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} required type="email" inputMode="email" full autoComplete="off" />
          <SelectField label="Enquiry source" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={config.channels} required />
          <SelectField label="Preferred destination" value={f.destination} onChange={(v) => setF({ ...f, destination: v })} options={DESTINATIONS} />
          <TextField label="Interested area of study" value={f.area} onChange={(v) => setF({ ...f, area: v })} full />
          <TextArea label="Enquiry note" value={f.note} onChange={(v) => setF({ ...f, note: v })} rows={2} />
          {canAssign && <SelectField label="Assign counsellor" value={f.counsellorId} onChange={(v) => setF({ ...f, counsellorId: v })} options={counsellors.map((u) => ({ value: u.id, label: u.name }))} placeholder="Leave unassigned" full />}
        </div>
        {canAccount ? (
          <div className="soft" style={{ padding: 12 }}>
            <label className="check" style={{ border: 0, background: "transparent", padding: "4px 2px", minHeight: 0 }}><input type="checkbox" checked={f.login} onChange={(e) => setF({ ...f, login: e.target.checked })} /><span>Create a student sign-in</span></label>
            {f.login && <div className="mt2" style={{ maxWidth: 300 }}><TextField label="Temporary password" value={f.password} onChange={(v) => setF({ ...f, password: v })} required hint="Share it with the student. They sign in with their email and this password." autoComplete="off" /></div>}
          </div>
        ) : (
          <p className="xs muted">Sign-ins are issued by an administrator under Staff.</p>
        )}
        {err && <Notice tone="bad" role="alert">{err}</Notice>}
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create student"}</button></div>
      </form>
    </Modal>
  );
}

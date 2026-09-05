/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import type { CaseEvent, CaseRecord, DocItem, GateSubmission, OrgConfig, RetentionPolicy, StepState, TransferRecord, User } from "./types";
import { EXIT_CODES, ORDERED_STEP_NUMBERS, PIPELINE, PLATFORM_COUNTRY, RETAINED_FIELDS, STEP_BY_N, TRANSFER_STEPS, pipelineOfStep, type PipelineStage } from "./spine";
import { DEFAULT_RETENTION, nowIso, uid } from "./store";

// ---------- dates ----------

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
export function fmtMonth(v?: string): string {
  if (!v) return "—";
  const [y, m] = v.split("-");
  if (!y || !m) return v;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
export function addDays(iso: string, days: number): Date { const d = new Date(iso); d.setDate(d.getDate() + days); return d; }
export function addMonths(iso: string, months: number): Date { const d = new Date(iso); d.setMonth(d.getMonth() + months); return d; }
export function daysUntil(d: Date): number { return Math.ceil((d.getTime() - Date.now()) / 86400000); }
export function todayInput(): string { return new Date().toISOString().slice(0, 10); }

// ---------- step state ----------

export type DerivedStatus = "done" | "na" | "active" | "locked";

export function stepState(c: CaseRecord, n: number): StepState {
  return c.steps[n] ?? { status: "pending", values: {} };
}

function unlockDeps(n: number): number[] {
  const def = STEP_BY_N[n];
  if (def.unlockAfter) return def.unlockAfter;
  if (n === 1) return [];
  if (n === 6) return [4];
  if (n === 13) return [11];
  return [n - 1];
}

export function derivedStatus(c: CaseRecord, n: number): DerivedStatus {
  const s = stepState(c, n);
  if (s.status === "done") return "done";
  if (s.status === "na") return "na";
  const ok = unlockDeps(n).every((d) => { const st = stepState(c, d).status; return st === "done" || st === "na"; });
  return ok ? "active" : "locked";
}

export function currentStep(c: CaseRecord): number | null {
  for (const n of ORDERED_STEP_NUMBERS) {
    const def = STEP_BY_N[n];
    if (def.optional) continue;
    if (derivedStatus(c, n) === "active") return n;
  }
  return null;
}




export function isWorkable(c: CaseRecord): boolean { return c.status === "open"; }

// ---------- pipeline (nine stages) ----------

export interface PipelineProgress extends PipelineStage {
  /** Required (non-optional) steps recorded. */
  done: number;
  /** Required steps in the stage. */
  total: number;
  /** Any step in the stage is available to work now. */
  active: boolean;
  /** Every required step is recorded. */
  complete: boolean;
  /** The stage the case is currently in, by its current step. */
  current: boolean;
}

/** Progress per pipeline stage. Shape is compatible with StageTrack's StageProg. */
export function pipelineProgress(c: CaseRecord): PipelineProgress[] {
  const cur = currentStep(c);
  const curStage = cur == null ? PIPELINE[PIPELINE.length - 1].id : pipelineOfStep(cur).id;
  return PIPELINE.map((p) => {
    const req = p.steps.filter((n) => !STEP_BY_N[n].optional);
    const done = req.filter((n) => stepState(c, n).status === "done").length;
    const active = p.steps.some((n) => derivedStatus(c, n) === "active");
    return { ...p, done, total: req.length, active, complete: done === req.length, current: p.id === curStage };
  });
}

/** The pipeline stage the case is in now (the ninth when every step is recorded). */
export function currentPipeline(c: CaseRecord): PipelineStage {
  const n = currentStep(c);
  return n == null ? PIPELINE[PIPELINE.length - 1] : pipelineOfStep(n);
}

// ---------- SLA ----------

export interface SlaFlag {
  id: string;
  label: string;
  due: Date;
  days: number;
  state: "ok" | "due-soon" | "breached";
  step: number;
}

export function slaFlags(c: CaseRecord, config: OrgConfig): SlaFlag[] {
  const out: SlaFlag[] = [];
  if (c.status !== "open") return out;
  const s3 = stepState(c, 3), s4 = stepState(c, 4), s5 = stepState(c, 5), s13 = stepState(c, 13), s14 = stepState(c, 14), s30 = stepState(c, 30), s31 = stepState(c, 31);
  const push = (id: string, label: string, due: Date, step: number, soonWithin = 2) => {
    const days = daysUntil(due);
    out.push({ id, label, due, days, step, state: days < 0 ? "breached" : days <= soonWithin ? "due-soon" : "ok" });
  };
  if (s3.status === "done" && s3.completedAt && s4.status !== "done") push("cis", "Course Information Sheet due", addDays(s3.completedAt, config.sla.cisDays), 4);
  if (s5.status === "pending" && typeof s5.values.requestedDate === "string" && s5.values.requestedDate) push("cis2", "Additional CIS due", addDays(s5.values.requestedDate as string, config.sla.cisDays), 5);
  if (s13.values.offerLapseDate && s14.status !== "done") {
    const lapse = new Date(s13.values.offerLapseDate as string);
    const days = daysUntil(lapse);
    const state: SlaFlag["state"] = days < 0 ? "breached" : days <= config.sla.offerReminderDays ? "due-soon" : "ok";
    out.push({ id: "offer", label: days < 0 ? "Offer lapsed" : "Offer lapse date", due: lapse, days, step: 13, state });
  }
  if (s30.status === "done" && s30.values.arrivalDate && s31.status !== "done") push("followup", "Three-month follow-up due", addMonths(s30.values.arrivalDate as string, config.sla.followUpMonths), 31, 7);
  return out;
}


// ---------- documents ----------

export function docsForStep(c: CaseRecord, step: 10 | 15): DocItem[] { return c.documents.filter((d) => d.step === step); }

export function docKindStatus(c: CaseRecord, step: 10 | 15, kind: string): { latest?: DocItem; accepted: boolean } {
  const ds = docsForStep(c, step).filter((d) => d.kind === kind).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return { latest: ds[0], accepted: ds.some((d) => d.status === "accepted") };
}

export function requiredDocsAccepted(c: CaseRecord, step: 10 | 15): boolean {
  const def = STEP_BY_N[step];
  return (def.docs ?? []).filter((k) => k.required).every((k) => docKindStatus(c, step, k.id).accepted);
}

export function pendingReviewCount(c: CaseRecord): number { return c.documents.filter((d) => d.status === "uploaded").length; }

// ---------- gates ----------

export function latestGate(c: CaseRecord, gate: 16 | 19): GateSubmission | undefined {
  return c.gates.filter((g) => g.gate === gate).sort((a, b) => b.round - a.round)[0];
}

// ---------- tasks ----------

export interface Task { id: string; label: string; detail?: string; step?: number; tone: "action" | "info" | "warn"; }

export function studentTasks(c: CaseRecord): Task[] {
  const t: Task[] = [];
  if (c.status !== "open") return t;
  const s2 = stepState(c, 2);
  if (s2.status !== "done" && !s2.studentSubmittedAt) t.push({ id: "profile", label: "Complete your profile", detail: "Academic history, sponsor background and English test details.", step: 2, tone: "action" });
  if (derivedStatus(c, 10) === "active") {
    const rejected = docsForStep(c, 10).filter((d) => d.status === "rejected").length;
    t.push({ id: "docs10", label: rejected ? "Re-upload documents that were returned" : "Upload your application documents", step: 10, tone: rejected ? "warn" : "action" });
  }
  if (derivedStatus(c, 15) === "active") {
    const rejected = docsForStep(c, 15).filter((d) => d.status === "rejected").length;
    t.push({ id: "docs15", label: rejected ? "Re-upload visa documents that were returned" : "Upload your visa documents", step: 15, tone: rejected ? "warn" : "action" });
  }
  const s22 = stepState(c, 22);
  if (s22.status === "done" && stepState(c, 23).status !== "done") t.push({ id: "draft", label: "Review the visa application draft sent to you", step: 22, tone: "info" });
  if (derivedStatus(c, 26) === "active") t.push({ id: "enrol", label: "Enrol for your units on the university portal", step: 26, tone: "action" });
  if (derivedStatus(c, 29) === "active") t.push({ id: "accom", label: "Confirm your accommodation", step: 29, tone: "action" });
  const lapse = stepState(c, 13).values.offerLapseDate as string | undefined;
  if (lapse && stepState(c, 14).status !== "done") {
    const d = daysUntil(new Date(lapse));
    if (d >= 0 && d <= 21) t.push({ id: "lapse", label: `Your offer lapses in ${d} day${d === 1 ? "" : "s"}`, detail: "Confirm your choice with your counsellor.", step: 13, tone: "warn" });
  }
  return t;
}

// ---------- events ----------

export function mkEvent(user: User, type: string, text: string, step?: number): CaseEvent {
  return { id: uid(), at: nowIso(), by: user.id, byName: user.name, type, text, step };
}

// ---------- mutations (pure, applied inside store.mutateCase) ----------

export function completeStep(c: CaseRecord, n: number, values: Record<string, unknown>, user: User): CaseRecord {
  const def = STEP_BY_N[n];
  const at = nowIso();
  const prev = stepState(c, n);
  const set = (k: number, st: StepState) => { c.steps[k] = st; };
  const done: StepState = { ...prev, status: "done", values: { ...prev.values, ...values }, completedAt: at, completedBy: user.id };

  if (n === 3) {
    if (values.outcome === "Profile incomplete — alternative route") {
      if (values.interest === "Not interested — exit") {
        set(3, done);
        c.status = "exited";
        c.exit = { code: "Not interested after gap advice", reason: String(values.recommendation ?? values.altRoute ?? ""), step: 3, stage: "S2", at, by: user.id };
        c.events.unshift(mkEvent(user, "exit", `Case exited at step 3 — ${c.exit.code}`, 3));
        return c;
      }
      set(3, { ...prev, status: "pending", values: { ...prev.values, ...values } });
      set(2, { ...stepState(c, 2), status: "pending" });
      c.events.unshift(mkEvent(user, "loop", `Alternative route recommended: ${values.altRoute}. Profile development continues.`, 3));
      return c;
    }
  }
  if (n === 8) {
    const o = values.outcome;
    if (o === "Does not meet — exit") {
      set(8, done);
      c.status = "exited";
      c.exit = { code: "Financial requirement not met", reason: String(values.explanation ?? ""), step: 8, stage: "S4", at, by: user.id };
      c.events.unshift(mkEvent(user, "exit", `Case exited at step 8 — ${c.exit.code}`, 8));
      return c;
    }
    if (o === "Does not meet — alternative route") {
      set(8, { ...prev, status: "pending", values: { ...prev.values, ...values } });
      set(6, { ...stepState(c, 6), status: "pending" });
      set(7, { ...stepState(c, 7), status: "pending" });
      c.events.unshift(mkEvent(user, "loop", `Alternative route: ${values.altCountry}, ${values.altProgramme}, intake ${fmtMonth(String(values.altIntake))}. Returned to step 6.`, 8));
      return c;
    }
    if (o === "Does not meet — hold and build") {
      set(8, { ...prev, status: "pending", values: { ...prev.values, ...values } });
      c.status = "hold";
      c.hold = { country: String(values.holdCountry ?? ""), intake: String(values.holdIntake ?? ""), programme: String(values.holdProgramme ?? ""), reviewDate: String(values.holdReviewDate ?? "") };
      c.events.unshift(mkEvent(user, "hold", `Case held to build financial capacity. Review ${fmtDate(c.hold.reviewDate)}.`, 8));
      return c;
    }
  }
  if (n === 27 && values.outcome === "Refused") {
    const remedy = String(values.remedy ?? "");
    if (remedy.startsWith("No further action")) {
      set(27, done);
      c.status = "exited";
      c.exit = { code: "Visa refused, not re-applying", reason: String(values.refusalGrounds ?? ""), step: 27, stage: "S8", at, by: user.id };
      c.events.unshift(mkEvent(user, "exit", `Case exited at step 27 — ${c.exit.code}`, 27));
      return c;
    }
    set(27, { ...prev, status: "pending", values: { ...prev.values, ...values } });
    set(22, { ...stepState(c, 22), status: "pending" });
    set(23, { ...stepState(c, 23), status: "pending" });
    c.events.unshift(mkEvent(user, "loop", `Visa refused ${fmtDate(String(values.decisionDate))}. Remedy: ${remedy}. Steps 22 and 23 reopened.`, 27));
    return c;
  }

  set(n, done);
  c.events.unshift(mkEvent(user, "step", `Step ${n} completed — ${def.title}`, n));
  // Personal data leaving Sri Lanka is registered as it happens, not reconstructed later.
  const transfers = transfersForStep(c, n, values, user);
  if (transfers.length) {
    c.transfers = [...caseTransfers(c), ...transfers];
    transfers.forEach((t) => c.events.unshift(mkEvent(user, "transfer", `Cross-border transfer logged — ${t.recipient} (${t.country})`, n)));
  }
  if (n === 31) { c.status = "completed"; c.events.unshift(mkEvent(user, "complete", "Case completed", 31)); }
  return c;
}

export function saveStepValues(c: CaseRecord, n: number, values: Record<string, unknown>, user: User, asStudent: boolean): CaseRecord {
  const prev = stepState(c, n);
  c.steps[n] = { ...prev, values: { ...prev.values, ...values }, ...(asStudent ? { studentSubmittedAt: nowIso() } : {}) };
  if (asStudent) c.events.unshift(mkEvent(user, "student", n === 2 ? "Student submitted profile details" : `Student updated step ${n}`, n));
  return c;
}

export function markNotApplicable(c: CaseRecord, n: number, user: User): CaseRecord {
  c.steps[n] = { ...stepState(c, n), status: "na", completedAt: nowIso(), completedBy: user.id };
  c.events.unshift(mkEvent(user, "step", `Step ${n} marked not applicable — ${STEP_BY_N[n].title}`, n));
  return c;
}

export function reopenStep(c: CaseRecord, n: number, user: User): CaseRecord {
  c.steps[n] = { ...stepState(c, n), status: "pending", completedAt: undefined, completedBy: undefined };
  c.events.unshift(mkEvent(user, "step", `Step ${n} reopened — ${STEP_BY_N[n].title}`, n));
  return c;
}

export function submitGate(c: CaseRecord, gate: 16 | 19, values: Record<string, unknown>, user: User): CaseRecord {
  const prev = stepState(c, gate);
  c.steps[gate] = { ...prev, values: { ...prev.values, ...values } };
  const round = (latestGate(c, gate)?.round ?? 0) + 1;
  c.gates.push({ id: uid(), gate, round, submittedAt: nowIso(), submittedBy: user.id, status: "pending" });
  c.events.unshift(mkEvent(user, "gate", `Submitted to Team Leader — ${STEP_BY_N[gate].title} (round ${round})`, gate));
  return c;
}

export function decideGate(c: CaseRecord, gateId: string, approve: boolean, suggestions: string, user: User): CaseRecord {
  const g = c.gates.find((x) => x.id === gateId);
  if (!g) return c;
  g.status = approve ? "approved" : "returned";
  g.decidedAt = nowIso();
  g.decidedBy = user.id;
  g.suggestions = suggestions || undefined;
  if (approve) {
    const prev = stepState(c, g.gate);
    c.steps[g.gate] = { ...prev, status: "done", completedAt: nowIso(), completedBy: user.id };
    c.events.unshift(mkEvent(user, "gate", `Team Leader approved — ${STEP_BY_N[g.gate].title}`, g.gate));
  } else {
    c.events.unshift(mkEvent(user, "gate", `Team Leader returned with suggestions — ${STEP_BY_N[g.gate].title}`, g.gate));
  }
  return c;
}

export function addressGate(c: CaseRecord, gateId: string, note: string, user: User): CaseRecord {
  const g = c.gates.find((x) => x.id === gateId);
  if (!g) return c;
  g.addressedAt = nowIso();
  g.addressedNote = note;
  c.events.unshift(mkEvent(user, "gate", `Counsellor confirmed suggestions addressed — ${STEP_BY_N[g.gate].title}`, g.gate));
  return c;
}

export function addDocument(c: CaseRecord, step: 10 | 15, kind: string, file: { name: string; size: number; type: string }, user: User): CaseRecord {
  c.documents.push({ id: uid(), step, kind, fileName: file.name, size: file.size, mime: file.type || "application/octet-stream", uploadedAt: nowIso(), uploadedBy: user.id, status: "uploaded" });
  const label = STEP_BY_N[step].docs?.find((d) => d.id === kind)?.label ?? kind;
  c.events.unshift(mkEvent(user, "doc", `Uploaded ${label} — ${file.name}`, step));
  return c;
}

export function reviewDocument(c: CaseRecord, docId: string, accept: boolean, note: string, user: User): CaseRecord {
  const d = c.documents.find((x) => x.id === docId);
  if (!d) return c;
  d.status = accept ? "accepted" : "rejected";
  d.reviewNote = note || undefined;
  d.reviewedAt = nowIso();
  d.reviewedBy = user.id;
  const label = STEP_BY_N[d.step].docs?.find((k) => k.id === d.kind)?.label ?? d.kind;
  c.events.unshift(mkEvent(user, "doc", `${accept ? "Accepted" : "Returned"} ${label}${note ? ` — ${note}` : ""}`, d.step));
  return c;
}

export function removeDocument(c: CaseRecord, docId: string, user: User): CaseRecord {
  const d = c.documents.find((x) => x.id === docId);
  if (!d) return c;
  c.documents = c.documents.filter((x) => x.id !== docId);
  const label = STEP_BY_N[d.step].docs?.find((k) => k.id === d.kind)?.label ?? d.kind;
  c.events.unshift(mkEvent(user, "doc", `Removed ${label} — ${d.fileName}`, d.step));
  return c;
}

export function changeStatus(c: CaseRecord, status: CaseRecord["status"], user: User, detail: { code?: string; reason?: string; reviewDate?: string; intake?: string }): CaseRecord {
  const at = nowIso();
  const step = currentStep(c) ?? 31;
  if (status === "exited") {
    c.exit = { code: detail.code ?? EXIT_CODES[EXIT_CODES.length - 1], reason: detail.reason ?? "", step, stage: pipelineOfStep(step).id, at, by: user.id };
    c.events.unshift(mkEvent(user, "exit", `Case exited at step ${step} — ${c.exit.code}${detail.reason ? `: ${detail.reason}` : ""}`, step));
  } else if (status === "hold") {
    c.hold = { reviewDate: detail.reviewDate, note: detail.reason };
    c.events.unshift(mkEvent(user, "hold", `Case held${detail.reviewDate ? ` until ${fmtDate(detail.reviewDate)}` : ""}${detail.reason ? ` — ${detail.reason}` : ""}`, step));
  } else if (status === "deferred") {
    c.hold = { intake: detail.intake, note: detail.reason, reviewDate: detail.reviewDate };
    c.events.unshift(mkEvent(user, "defer", `Intake deferred${detail.intake ? ` to ${fmtMonth(detail.intake)}` : ""}${detail.reason ? ` — ${detail.reason}` : ""}`, step));
  } else if (status === "open") {
    c.exit = undefined;
    c.hold = undefined;
    c.events.unshift(mkEvent(user, "reopen", "Case reopened", step));
  }
  c.status = status;
  return c;
}

/** Human label for where a case exited, derived from the step so records stored under the old stage ids read correctly. */
export function exitStageLabel(step: number): string {
  const p = STEP_BY_N[step] ? pipelineOfStep(step) : PIPELINE[PIPELINE.length - 1];
  return `Stage ${p.n} of 9 · ${p.name}`;
}

/**
 * A copy of the case with every special-category value withheld, for roles that may export
 * a record but may not read its sensitive fields. The database holds the record as one
 * document, so this is the layer that applies the sensitive.read cell to exports.
 */
export function redactSensitive(c: CaseRecord): CaseRecord {
  const copy = JSON.parse(JSON.stringify(c)) as CaseRecord;
  for (const key of Object.keys(copy.steps)) {
    const n = Number(key);
    const def = STEP_BY_N[n];
    const st = copy.steps[n];
    if (!def || !st?.values) continue;
    for (const f of def.fields) if (f.sensitive && f.id in st.values) st.values[f.id] = "[restricted]";
  }
  return copy;
}

export function newCaseRef(prefix: string, counter: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(counter).padStart(4, "0")}`;
}


// ---------- progress and analytics (v2) ----------

export interface Progress { done: number; applicable: number; pct: number }

/** Completion measured against the steps that apply to this case (steps marked not applicable are excluded). */
export function caseProgress(c: CaseRecord): Progress {
  let done = 0, applicable = 0;
  for (const n of ORDERED_STEP_NUMBERS) {
    const s = stepState(c, n).status;
    if (s === "na") continue;
    applicable++;
    if (s === "done") done++;
  }
  return { done, applicable, pct: applicable ? Math.round((done / applicable) * 100) : 0 };
}

export function caseDestination(c: CaseRecord): string {
  const s14 = stepState(c, 14).values, s6 = stepState(c, 6).values, s1 = stepState(c, 1).values, s2 = stepState(c, 2).values;
  if (typeof s14.country === "string" && s14.country) return s14.country;
  if (Array.isArray(s6.countries) && s6.countries.length) return String(s6.countries[0]);
  if (Array.isArray(s2.destinations) && s2.destinations.length) return String(s2.destinations[0]);
  if (typeof s1.preferredDestination === "string" && s1.preferredDestination) return s1.preferredDestination;
  return "Undecided";
}

export function caseProgramme(c: CaseRecord): string {
  const s14 = stepState(c, 14).values, s6 = stepState(c, 6).values, s2 = stepState(c, 2).values, s1 = stepState(c, 1).values;
  if (typeof s14.programme === "string" && s14.programme) return s14.programme;
  if (typeof s6.programmes === "string" && s6.programmes) return s6.programmes.split("\n")[0];
  if (typeof s2.interestedArea === "string" && s2.interestedArea) return s2.interestedArea;
  if (typeof s1.interestedArea === "string" && s1.interestedArea) return s1.interestedArea;
  return "—";
}

export function caseChannel(c: CaseRecord): string {
  const v = stepState(c, 1).values.source;
  return typeof v === "string" && v ? v : "Unknown";
}

export interface FunnelRow { label: string; n: number }

export function funnel(cases: CaseRecord[]): FunnelRow[] {
  const done = (c: CaseRecord, n: number) => stepState(c, n).status === "done";
  return [
    { label: "Enquiry", n: cases.length },
    { label: "Qualified", n: cases.filter((c) => done(c, 3)).length },
    { label: "Application", n: cases.filter((c) => done(c, 11)).length },
    { label: "Offer", n: cases.filter((c) => done(c, 13)).length },
    { label: "Acceptance", n: cases.filter((c) => done(c, 18)).length },
    { label: "Visa lodged", n: cases.filter((c) => done(c, 23)).length },
    { label: "Visa granted", n: cases.filter((c) => done(c, 27) && stepState(c, 27).values.outcome === "Granted").length },
    { label: "Arrived", n: cases.filter((c) => done(c, 30)).length },
  ];
}

export function countBy(cases: CaseRecord[], key: (c: CaseRecord) => string): { label: string; n: number }[] {
  const m = new Map<string, number>();
  cases.forEach((c) => { const k = key(c); m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export function monthKey(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

export function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: monthKey(x), label: x.toLocaleDateString("en-GB", { month: "short" }) });
  }
  return out;
}

export function monthlyVolume(cases: CaseRecord[], months = 12): { labels: string[]; enquiries: number[]; arrivals: number[] } {
  const ms = lastMonths(months);
  const enq = new Map(ms.map((m) => [m.key, 0]));
  const arr = new Map(ms.map((m) => [m.key, 0]));
  cases.forEach((c) => {
    const k = monthKey(new Date(c.createdAt));
    if (enq.has(k)) enq.set(k, (enq.get(k) ?? 0) + 1);
    const a = stepState(c, 30).values.arrivalDate;
    if (typeof a === "string" && a) { const ak = monthKey(new Date(a)); if (arr.has(ak)) arr.set(ak, (arr.get(ak) ?? 0) + 1); }
  });
  return { labels: ms.map((m) => m.label), enquiries: ms.map((m) => enq.get(m.key) ?? 0), arrivals: ms.map((m) => arr.get(m.key) ?? 0) };
}

export interface SlaSummary { id: string; label: string; met: number; total: number }

/** Historic compliance against the quantified service levels. */
export function slaCompliance(cases: CaseRecord[], config: OrgConfig): SlaSummary[] {
  let cisMet = 0, cisTotal = 0, offerMet = 0, offerTotal = 0, fuMet = 0, fuTotal = 0;
  cases.forEach((c) => {
    const s3 = stepState(c, 3), s4 = stepState(c, 4), s13 = stepState(c, 13), s14 = stepState(c, 14), s30 = stepState(c, 30), s31 = stepState(c, 31);
    if (s3.status === "done" && s3.completedAt && s4.status === "done") {
      cisTotal++;
      const sent = typeof s4.values.cisSentDate === "string" && s4.values.cisSentDate ? new Date(s4.values.cisSentDate) : new Date(s4.completedAt ?? "");
      if (sent.getTime() <= addDays(s3.completedAt, config.sla.cisDays).getTime() + 86400000) cisMet++;
    }
    if (typeof s13.values.offerLapseDate === "string" && s13.values.offerLapseDate && s14.status === "done") {
      offerTotal++;
      const decided = typeof s14.values.acceptedDate === "string" && s14.values.acceptedDate ? new Date(s14.values.acceptedDate) : new Date(s14.completedAt ?? "");
      if (decided.getTime() <= new Date(s13.values.offerLapseDate).getTime() + 86400000) offerMet++;
    }
    if (s30.status === "done" && typeof s30.values.arrivalDate === "string" && s30.values.arrivalDate) {
      const due = addMonths(s30.values.arrivalDate, config.sla.followUpMonths);
      if (due.getTime() < Date.now() || s31.status === "done") {
        fuTotal++;
        if (s31.status === "done") fuMet++;
      }
    }
  });
  return [
    { id: "cis", label: "CIS within 7 days", met: cisMet, total: cisTotal },
    { id: "offer", label: "Offer decided before lapse", met: offerMet, total: offerTotal },
    { id: "followup", label: "Follow-up at 3 months", met: fuMet, total: fuTotal },
  ];
}

export function daysBetween(a: string, b: string): number { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }

export function averageLeadTime(cases: CaseRecord[]): number | null {
  const xs = cases.map((c) => { const a = stepState(c, 30).values.arrivalDate; return typeof a === "string" && a ? daysBetween(c.createdAt, a) : null; }).filter((x): x is number => x != null && x >= 0);
  if (!xs.length) return null;
  return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
}

export function daysSince(iso: string): number { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }

export function docStats(cases: CaseRecord[]): { uploaded: number; accepted: number; rejected: number; reworkPct: number } {
  const docs = cases.flatMap((c) => c.documents);
  const uploaded = docs.filter((d) => d.status === "uploaded").length;
  const accepted = docs.filter((d) => d.status === "accepted").length;
  const rejected = docs.filter((d) => d.status === "rejected").length;
  const reviewed = accepted + rejected;
  return { uploaded, accepted, rejected, reworkPct: reviewed ? Math.round((rejected / reviewed) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// Data protection — cross-border transfer register and retention schedule
// Closes absences 2 and 3 of process document LGH/IMS/PROC/LPL/001 §10.
// ---------------------------------------------------------------------------

export function caseTransfers(c: CaseRecord): TransferRecord[] { return c.transfers ?? []; }

export function retentionPolicy(config: OrgConfig): RetentionPolicy { return config.retention ?? DEFAULT_RETENTION; }

function oneLine(v: unknown): string {
  return String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean).join("; ");
}

/**
 * Builds the transfer records for a step that discloses personal data outside Sri Lanka.
 * Safeguards default to "None recorded" on purpose: the register is meant to show the
 * gap rather than assume an agreement nobody has produced.
 */
export function transfersForStep(c: CaseRecord, n: number, values: Record<string, unknown>, user: User): TransferRecord[] {
  const spec = TRANSFER_STEPS[n];
  if (!spec) return [];
  const merged = { ...stepState(c, n).values, ...values };
  const destination = String(merged.country || caseDestination(c) || "Not recorded");
  const base = {
    at: nowIso(),
    by: user.id,
    byName: user.name,
    step: n,
    dataCategories: [...spec.categories],
    lawfulBasis: spec.basis,
    safeguard: "None recorded",
  };

  if (n === 11) {
    const route = String(merged.route ?? "");
    if (route === "Platform") {
      const platform = String(merged.platform || "Platform");
      return [{ ...base, id: uid(), recipient: platform, recipientType: "platform", country: PLATFORM_COUNTRY[platform] ?? "Not recorded" }];
    }
    if (route === "Partner agent") {
      const approved = merged.agentApproved === "Yes";
      return [{
        ...base, id: uid(),
        recipient: String(merged.agentName || "Partner agent"),
        recipientType: "partner_agent",
        recipientApproved: approved,
        country: destination,
        safeguard: approved ? "Processor agreement" : "None recorded",
        note: approved ? undefined : "Agent is not on the approved list. The handling rule for this route is undefined (D-05).",
      }];
    }
    return [{ ...base, id: uid(), recipient: oneLine(merged.universities) || "University", recipientType: "university", country: destination }];
  }

  if (n === 18) {
    const uni = oneLine(stepState(c, 14).values.university) || oneLine(stepState(c, 11).values.universities) || "University";
    return [{ ...base, id: uid(), recipient: uni, recipientType: "university", country: destination }];
  }

  if (n === 23) {
    return [{ ...base, id: uid(), recipient: destination + " visa authority", recipientType: "authority", country: destination }];
  }

  return [];
}

export function updateTransfer(c: CaseRecord, transferId: string, patch: Partial<Pick<TransferRecord, "lawfulBasis" | "safeguard" | "country" | "note">>, user: User): CaseRecord {
  const t = caseTransfers(c).find((x) => x.id === transferId);
  if (!t) return c;
  Object.assign(t, patch);
  c.events.unshift(mkEvent(user, "transfer", "Transfer record updated — " + t.recipient, t.step));
  return c;
}

// ---------- retention ----------

export type RetentionState = "none" | "scheduled" | "due_soon" | "overdue" | "held" | "disposed";

export const RETENTION_LABEL: Record<RetentionState, string> = {
  none: "No clock — case is open",
  scheduled: "Scheduled",
  due_soon: "Due soon",
  overdue: "Overdue",
  held: "Legal hold",
  disposed: "Disposed",
};

/** The event the retention clock runs from, and the plain-language reason it applies. */
export function retentionAnchor(c: CaseRecord): { at: string; basis: string } | null {
  if (c.status === "exited") return { at: c.exit?.at ?? c.updatedAt, basis: "Exited" };
  if (c.status === "completed") return { at: stepState(c, 31).completedAt ?? c.updatedAt, basis: "Completed" };
  if (c.status === "hold") return { at: c.updatedAt, basis: "Dormant — on hold" };
  if (c.status === "deferred") return { at: c.updatedAt, basis: "Dormant — deferred" };
  return null;
}

export function retentionDue(c: CaseRecord, config: OrgConfig): { due: Date; basis: string; months: number } | null {
  const anchor = retentionAnchor(c);
  if (!anchor) return null;
  const p = retentionPolicy(config);
  const months = c.status === "exited" ? p.exitedMonths : c.status === "completed" ? p.completedMonths : p.dormantMonths;
  return { due: addMonths(anchor.at, months), basis: anchor.basis, months };
}

export function retentionState(c: CaseRecord, config: OrgConfig): RetentionState {
  if (c.disposal) return "disposed";
  if (c.legalHold) return "held";
  const d = retentionDue(c, config);
  if (!d) return "none";
  const days = daysUntil(d.due);
  if (days < 0) return "overdue";
  if (days <= retentionPolicy(config).warnDays) return "due_soon";
  return "scheduled";
}

/** True when the case may lawfully be disposed of now. */
export function disposable(c: CaseRecord, config: OrgConfig): boolean {
  return retentionState(c, config) === "overdue";
}

/**
 * Disposal anonymises rather than deletes. The case shell, its dates, outcomes and
 * destinations survive so that conversion and refusal analytics stay honest; every
 * field outside RETAINED_FIELDS, every document name and the whole case narrative go.
 */
export function disposeCase(c: CaseRecord, user: User, basis: string): CaseRecord {
  const at = nowIso();
  c.student = { name: "Disposed record " + c.ref, email: "", phone: "" };
  c.studentUserId = undefined;
  for (const key of Object.keys(c.steps)) {
    const st = c.steps[Number(key)];
    const kept: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(st.values ?? {})) if (RETAINED_FIELDS.has(fieldId)) kept[fieldId] = value;
    st.values = kept;
  }
  c.documents = c.documents.map((d) => ({ ...d, fileName: "Destroyed", size: 0, reviewNote: undefined }));
  c.gates = c.gates.map((g) => ({ ...g, suggestions: undefined, addressedNote: undefined }));
  c.transfers = caseTransfers(c).map((t) => ({ ...t, note: undefined }));
  if (c.exit) c.exit = { ...c.exit, reason: "" };
  if (c.hold) c.hold = { ...c.hold, note: undefined };
  c.disposal = { at, by: user.id, byName: user.name, basis };
  c.events = [mkEvent(user, "disposal", "Personal data destroyed under the retention schedule — " + basis)];
  return c;
}

export function setLegalHold(c: CaseRecord, user: User, reason: string): CaseRecord {
  c.legalHold = { at: nowIso(), by: user.id, byName: user.name, reason };
  c.events.unshift(mkEvent(user, "legalhold", "Legal hold placed — " + reason + ". Disposal suspended."));
  return c;
}

export function clearLegalHold(c: CaseRecord, user: User): CaseRecord {
  c.legalHold = undefined;
  c.events.unshift(mkEvent(user, "legalhold", "Legal hold lifted. The retention clock applies again."));
  return c;
}

// ---------- compliance metrics (§11) ----------

export interface RegisterRow extends TransferRecord { caseId: string; caseRef: string }

export function allTransfers(cases: CaseRecord[]): RegisterRow[] {
  return cases
    .flatMap((c) => caseTransfers(c).map((t) => ({ ...t, caseId: c.id, caseRef: c.ref })))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Share of cases that have reached the profile step and carry a recorded consent. */
export function consentCoverage(cases: CaseRecord[]): { covered: number; total: number; pct: number } {
  const reached = cases.filter((c) => !c.disposal && Object.keys(stepState(c, 2).values ?? {}).length > 0);
  const covered = reached.filter((c) => stepState(c, 2).values.consent === "Yes").length;
  return { covered, total: reached.length, pct: reached.length ? Math.round((covered / reached.length) * 100) : 100 };
}

export function retentionSummary(cases: CaseRecord[], config: OrgConfig): Record<RetentionState, number> {
  const out: Record<RetentionState, number> = { none: 0, scheduled: 0, due_soon: 0, overdue: 0, held: 0, disposed: 0 };
  cases.forEach((c) => { out[retentionState(c, config)]++; });
  return out;
}

/** Transfers with no safeguard recorded — the number that should be driven to zero. */
export function unsafeguardedTransfers(cases: CaseRecord[]): number {
  return allTransfers(cases).filter((t) => t.safeguard === "None recorded").length;
}

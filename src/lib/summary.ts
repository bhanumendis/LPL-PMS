/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Case summaries: what the lists, dashboards and badges need to know about a case, without
 * the case itself.
 *
 * On a server, the database derives these facts from the case document on every write
 * (public.case_derive, supabase/migrations/…_v6_case_index.sql) and answers lists and
 * dashboards from them with paging and aggregation, so a browser never downloads every case.
 * In browser storage the same facts are computed here. The two implementations are held to
 * each other by a generated fixture (src/lib/summary.parity.test.ts writes it, the Go
 * integration suite replays it against Postgres) and this file is held to signals.ts by
 * src/lib/summary.test.ts.
 *
 * Three layers:
 *   summarizeCase   facts that depend only on the document (stored as columns on a server)
 *   evaluateCase    what those facts mean now, under the configured service levels
 *   dashboardOf     the aggregate a dashboard shows
 */
import type { CaseRecord, CaseStatus, OrgConfig } from "./types";
import { ORDERED_STEP_NUMBERS, PIPELINE, STEP_BY_N, pipelineOfStep } from "./spine";
import { addDays, addMonths, caseProgress, currentStep, latestGate, monthKey, lastMonths, retentionPolicy, stepState, type RetentionState } from "./logic";

// ---------------------------------------------------------------------------
// Facts from the document
// ---------------------------------------------------------------------------

export interface CaseSummary {
  id: string;
  ref: string;
  status: CaseStatus;
  counsellorId: string | null;
  studentUserId: string | null;
  studentName: string;
  studentEmail: string;
  createdAt: string;
  updatedAt: string;
  /** First required step that can be worked now; null when every required step is recorded. */
  currentStep: number | null;
  /** Pipeline stage 1–9 (9 once every step is recorded). */
  stage: number;
  progressDone: number;
  progressApplicable: number;
  progressPct: number;
  /** Gate whose latest round is awaiting the Team Leader (16 before 19). */
  gatePending: 16 | 19 | null;
  gatePendingAt: string | null;
  gatePendingRound: number | null;
  /** Gate whose latest round was returned and not yet addressed. */
  gateReturned: 16 | 19 | null;
  docsUploaded: number;
  docsAccepted: number;
  docsRejected: number;
  profileSubmitted: boolean;
  /**
   * Service-level facts. A clock is live only while the case is open and its closing step is
   * not done (read from doneMask): CIS runs from step 3 until step 4, the additional CIS from
   * its request while step 5 is pending, the offer until step 14, the follow-up from arrival
   * (step 30) until step 31.
   */
  cisStartAt: string | null;
  cis2From: string | null;
  offerLapseAt: string | null;
  arrivalAt: string | null;
  holdReviewAt: string | null;
  retentionAnchorAt: string | null;
  retentionKind: "exited" | "completed" | "dormant" | null;
  disposed: boolean;
  legalHold: boolean;
  lastEventAt: string | null;
  lastEventBy: string | null;
  destination: string;
  channel: string;
  exitCode: string | null;
  /** Bit n-1 set when step n is done. */
  doneMask: number;
  visaGranted: boolean;
  /** Compliance history. */
  cisSentAt: string | null;
  offerDecidedAt: string | null;
  profileStarted: boolean;
  consentYes: boolean;
  transfersTotal: number;
  transfersUnsafeguarded: number;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const isDone = (c: CaseRecord, n: number) => stepState(c, n).status === "done";

/**
 * A parseable instant, or null. Date-only strings are UTC midnight, as in the database, and an
 * impossible calendar date ("2027-02-30") is null rather than rolled over into March the way a
 * JavaScript Date would (public.lpl_ts refuses it too).
 */
function instant(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = new Date(s).getTime();
  if (isNaN(t)) return null;
  const iso = new Date(t).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && iso.slice(0, 10) !== s) return null;
  return iso;
}

function destinationOf(c: CaseRecord): string {
  const s14 = stepState(c, 14).values, s6 = stepState(c, 6).values, s1 = stepState(c, 1).values, s2 = stepState(c, 2).values;
  if (typeof s14.country === "string" && s14.country) return s14.country;
  if (Array.isArray(s6.countries) && s6.countries.length) return String(s6.countries[0]);
  if (Array.isArray(s2.destinations) && s2.destinations.length) return String(s2.destinations[0]);
  if (typeof s1.preferredDestination === "string" && s1.preferredDestination) return s1.preferredDestination;
  return "Undecided";
}

export function summarizeCase(c: CaseRecord): CaseSummary {
  const cur = currentStep(c);
  const prog = caseProgress(c);
  let gatePending: 16 | 19 | null = null, gateReturned: 16 | 19 | null = null, gatePendingAt: string | null = null, gatePendingRound: number | null = null;
  for (const g of [16, 19] as const) {
    const l = latestGate(c, g);
    if (!l) continue;
    if (l.status === "returned" && !l.addressedAt) gateReturned = gateReturned ?? g;
    else if (l.status === "pending" && gatePending == null) { gatePending = g; gatePendingAt = l.submittedAt ?? null; gatePendingRound = l.round ?? null; }
  }
  const s2 = stepState(c, 2), s3 = stepState(c, 3), s4 = stepState(c, 4), s5 = stepState(c, 5), s13 = stepState(c, 13), s14 = stepState(c, 14), s27 = stepState(c, 27), s30 = stepState(c, 30), s31 = stepState(c, 31);
  let doneMask = 0;
  for (const n of ORDERED_STEP_NUMBERS) if (isDone(c, n)) doneMask |= 1 << (n - 1);
  const transfers = c.transfers ?? [];
  const retention: Pick<CaseSummary, "retentionAnchorAt" | "retentionKind"> =
    c.status === "exited" ? { retentionAnchorAt: instant(c.exit?.at) ?? instant(c.updatedAt), retentionKind: "exited" }
    : c.status === "completed" ? { retentionAnchorAt: instant(s31.completedAt) ?? instant(c.updatedAt), retentionKind: "completed" }
    : c.status === "hold" || c.status === "deferred" ? { retentionAnchorAt: instant(c.updatedAt), retentionKind: "dormant" }
    : { retentionAnchorAt: null, retentionKind: null };
  return {
    id: c.id, ref: c.ref, status: c.status,
    counsellorId: c.counsellorId || null, studentUserId: c.studentUserId || null,
    studentName: c.student?.name ?? "", studentEmail: c.student?.email ?? "",
    createdAt: instant(c.createdAt) ?? "", updatedAt: instant(c.updatedAt) ?? "",
    currentStep: cur, stage: cur == null ? PIPELINE.length : pipelineOfStep(cur).n,
    progressDone: prog.done, progressApplicable: prog.applicable, progressPct: prog.pct,
    gatePending, gatePendingAt: instant(gatePendingAt), gatePendingRound, gateReturned,
    docsUploaded: c.documents.filter((d) => d.status === "uploaded").length,
    docsAccepted: c.documents.filter((d) => d.status === "accepted").length,
    docsRejected: c.documents.filter((d) => d.status === "rejected").length,
    profileSubmitted: !!s2.studentSubmittedAt && s2.status !== "done",
    cisStartAt: s3.status === "done" ? instant(s3.completedAt) : null,
    cis2From: s5.status === "pending" ? instant(s5.values.requestedDate) : null,
    offerLapseAt: instant(s13.values.offerLapseDate),
    arrivalAt: instant(s30.values.arrivalDate),
    holdReviewAt: instant(c.hold?.reviewDate),
    ...retention,
    disposed: !!c.disposal, legalHold: !!c.legalHold,
    lastEventAt: instant(c.events[0]?.at), lastEventBy: c.events[0]?.by ?? null,
    destination: destinationOf(c),
    channel: str(stepState(c, 1).values.source) ?? "Unknown",
    exitCode: c.status === "exited" ? c.exit?.code ?? "Other" : null,
    doneMask,
    visaGranted: isDone(c, 27) && s27.values.outcome === "Granted",
    cisSentAt: isDone(c, 4) ? instant(s4.values.cisSentDate) ?? instant(s4.completedAt) : null,
    offerDecidedAt: isDone(c, 14) ? instant(s14.values.acceptedDate) ?? instant(s14.completedAt) : null,
    profileStarted: !c.disposal && Object.keys(s2.values ?? {}).length > 0,
    consentYes: s2.values?.consent === "Yes",
    transfersTotal: transfers.length,
    transfersUnsafeguarded: transfers.filter((t) => t.safeguard === "None recorded").length,
  };
}

export const stepDone = (s: CaseSummary, n: number): boolean => (s.doneMask & (1 << (n - 1))) !== 0;

// ---------------------------------------------------------------------------
// What the facts mean now
// ---------------------------------------------------------------------------

export type Severity = "bad" | "warn" | "info" | "none";
export interface ClockState { id: "cis" | "cis2" | "offer" | "followup"; label: string; due: string; days: number; state: "ok" | "due-soon" | "breached"; step: number }

export interface CaseState {
  clocks: ClockState[];
  breached: number;
  dueSoon: number;
  docsToReview: number;
  gatePending: 16 | 19 | null;
  gateReturned: 16 | 19 | null;
  profileSubmitted: boolean;
  holdReviewDue: boolean;
  retention: RetentionState;
  severity: Severity;
}

const DAY = 86_400_000;
export const daysFrom = (dueIso: string, now: number): number => Math.ceil((new Date(dueIso).getTime() - now) / DAY);

export function evaluateCase(s: CaseSummary, config: OrgConfig, now: number = Date.now()): CaseState {
  const open = s.status === "open";
  const clocks: ClockState[] = [];
  if (open) {
    const push = (id: ClockState["id"], label: string, due: Date, step: number, soonWithin: number) => {
      const days = Math.ceil((due.getTime() - now) / DAY);
      clocks.push({ id, label, due: due.toISOString(), days, step, state: days < 0 ? "breached" : days <= soonWithin ? "due-soon" : "ok" });
    };
    if (s.cisStartAt && !stepDone(s, 4)) push("cis", "Course Information Sheet due", addDays(s.cisStartAt, config.sla.cisDays), 4, 2);
    if (s.cis2From) push("cis2", "Additional CIS due", addDays(s.cis2From, config.sla.cisDays), 5, 2);
    if (s.offerLapseAt && !stepDone(s, 14)) {
      const days = daysFrom(s.offerLapseAt, now);
      clocks.push({ id: "offer", label: days < 0 ? "Offer lapsed" : "Offer lapse date", due: s.offerLapseAt, days, step: 13, state: days < 0 ? "breached" : days <= config.sla.offerReminderDays ? "due-soon" : "ok" });
    }
    if (s.arrivalAt && stepDone(s, 30) && !stepDone(s, 31)) push("followup", "Three-month follow-up due", addMonths(s.arrivalAt, config.sla.followUpMonths), 31, 7);
  }
  const breached = clocks.filter((c) => c.state === "breached").length;
  const dueSoon = clocks.filter((c) => c.state === "due-soon").length;
  const docsToReview = open ? s.docsUploaded : 0;
  const gatePending = open ? s.gatePending : null;
  const gateReturned = open ? s.gateReturned : null;
  const profileSubmitted = open && s.profileSubmitted;
  const holdReviewDue = (s.status === "hold" || s.status === "deferred") && !!s.holdReviewAt && daysFrom(s.holdReviewAt, now) < 0;
  const retention = retentionOf(s, config, now);
  const severity: Severity =
    breached > 0 || gateReturned ? "bad"
    : dueSoon > 0 || holdReviewDue || retention === "overdue" ? "warn"
    : gatePending || docsToReview > 0 || profileSubmitted ? "info"
    : "none";
  return { clocks, breached, dueSoon, docsToReview, gatePending, gateReturned, profileSubmitted, holdReviewDue, retention, severity };
}

export function retentionOf(s: CaseSummary, config: OrgConfig, now: number = Date.now()): RetentionState {
  if (s.disposed) return "disposed";
  if (s.legalHold) return "held";
  if (!s.retentionAnchorAt || !s.retentionKind) return "none";
  const p = retentionPolicy(config);
  const months = s.retentionKind === "exited" ? p.exitedMonths : s.retentionKind === "completed" ? p.completedMonths : p.dormantMonths;
  const days = Math.ceil((addMonths(s.retentionAnchorAt, months).getTime() - now) / DAY);
  if (days < 0) return "overdue";
  if (days <= p.warnDays) return "due_soon";
  return "scheduled";
}

export const SEVERITY_RANK: Record<Severity, number> = { bad: 0, warn: 1, info: 2, none: 3 };

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

export interface CountRow { label: string; n: number }

export interface DashboardSummary {
  total: number;
  status: Record<CaseStatus, number>;
  open: { total: number; unassigned: number; breached: number; dueSoon: number; gatesPending: number; gatesReturned: number; docsToReview: number; profileSubmitted: number };
  retention: Record<RetentionState, number>;
  byStage: { stage: number; open: number; bad: number }[];
  counsellors: { id: string; open: number; gates: number; docs: number; bad: number }[];
  enquiries: { last30: number; prev30: number };
  funnel: CountRow[];
  /** The last 24 organisation months, oldest first; a chart shows the tail it needs. */
  volume: { month: string; enquiries: number; arrivals: number }[];
  sla: { id: "cis" | "offer" | "followup"; label: string; met: number; total: number }[];
  destinations: CountRow[];
  channels: CountRow[];
  exits: CountRow[];
  docs: { uploaded: number; accepted: number; rejected: number; reworkPct: number };
  leadDays: number | null;
  compliance: { consentCovered: number; consentTotal: number; consentPct: number; transfers: number; unsafeguarded: number };
  /** The heads of the home-screen queues, ids only: what needs someone (worst first, then most
   *  recently updated), and cases with a breached clock (most overdue first). At most 25 each. */
  attention: string[];
  urgent: string[];
}

export const QUEUE_HEAD = 25;

/** The list order's instant: the document's updatedAt, or −∞ when it has none (as list_at). */
export const listAt = (s: CaseSummary): number => (s.updatedAt ? new Date(s.updatedAt).getTime() : -Infinity);

/** The most overdue live clock, in days (negative is overdue); null when no clock runs. */
export const worstDays = (st: CaseState): number | null => (st.clocks.length ? Math.min(...st.clocks.map((c) => c.days)) : null);

/** Code-point order for ties, as the database's COLLATE "C" (locale ordering differs between the two). */
export const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const countRows = (m: Map<string, number>): CountRow[] => [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || byCodePoint(a.label, b.label));
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** The dashboard over a set of case summaries: the browser-storage twin of public.dashboard_summary. */
export function dashboardOf(summaries: CaseSummary[], config: OrgConfig, now: number = Date.now()): DashboardSummary {
  const status: Record<CaseStatus, number> = { open: 0, hold: 0, deferred: 0, exited: 0, completed: 0 };
  const retention: Record<RetentionState, number> = { none: 0, scheduled: 0, due_soon: 0, overdue: 0, held: 0, disposed: 0 };
  const open = { total: 0, unassigned: 0, breached: 0, dueSoon: 0, gatesPending: 0, gatesReturned: 0, docsToReview: 0, profileSubmitted: 0 };
  const byStage = PIPELINE.map((p) => ({ stage: p.n, open: 0, bad: 0 }));
  const couns = new Map<string, { id: string; open: number; gates: number; docs: number; bad: number }>();
  const dest = new Map<string, number>(), chan = new Map<string, number>(), exits = new Map<string, number>();
  const months = lastMonths(24, now);
  const enq = new Map(months.map((m) => [m.key, 0])), arr = new Map(months.map((m) => [m.key, 0]));
  const funnelSteps = [3, 11, 13, 18, 23] as const;
  const funnelCounts = [0, 0, 0, 0, 0];
  let granted = 0, arrived = 0, last30 = 0, prev30 = 0;
  let cisMet = 0, cisTotal = 0, offerMet = 0, offerTotal = 0, fuMet = 0, fuTotal = 0;
  let uploaded = 0, accepted = 0, rejected = 0, leadSum = 0, leadN = 0;
  let consentCovered = 0, consentTotal = 0, transfers = 0, unsafeguarded = 0;
  const flagged: { id: string; rank: number; at: number }[] = [];
  const breachedCases: { id: string; days: number }[] = [];

  for (const s of summaries) {
    const st = evaluateCase(s, config, now);
    if (st.severity !== "none") flagged.push({ id: s.id, rank: SEVERITY_RANK[st.severity], at: listAt(s) });
    if (s.status === "open" && st.breached > 0) breachedCases.push({ id: s.id, days: worstDays(st) ?? 0 });
    status[s.status]++;
    retention[st.retention]++;
    if (s.status === "open") {
      open.total++;
      if (!s.counsellorId) open.unassigned++;
      open.breached += st.breached;
      open.dueSoon += st.dueSoon;
      if (st.gatePending) open.gatesPending++;
      if (st.gateReturned) open.gatesReturned++;
      open.docsToReview += st.docsToReview;
      if (st.profileSubmitted) open.profileSubmitted++;
      const row = byStage[s.stage - 1];
      row.open++;
      if (st.severity === "bad") row.bad++;
      if (s.counsellorId) {
        const c = couns.get(s.counsellorId) ?? { id: s.counsellorId, open: 0, gates: 0, docs: 0, bad: 0 };
        c.open++;
        if (st.gatePending) c.gates++;
        c.docs += st.docsToReview;
        if (st.breached > 0 || st.gateReturned) c.bad++;
        couns.set(s.counsellorId, c);
      }
    }
    const t = new Date(s.createdAt).getTime();
    if (t > now - 30 * DAY) last30++; else if (t > now - 60 * DAY) prev30++;
    if (!isNaN(t)) { const mk = monthKey(new Date(t)); if (enq.has(mk)) enq.set(mk, (enq.get(mk) ?? 0) + 1); }
    if (s.arrivalAt) {
      const ak = monthKey(new Date(s.arrivalAt));
      if (arr.has(ak)) arr.set(ak, (arr.get(ak) ?? 0) + 1);
      const lead = Math.round((new Date(s.arrivalAt).getTime() - t) / DAY);
      if (lead >= 0) { leadSum += lead; leadN++; }
    }
    funnelSteps.forEach((n, i) => { if (stepDone(s, n)) funnelCounts[i]++; });
    if (s.visaGranted) granted++;
    if (stepDone(s, 30)) arrived++;
    if (s.status !== "exited") bump(dest, s.destination);
    bump(chan, s.channel);
    if (s.exitCode) bump(exits, s.exitCode);
    if (s.cisStartAt && stepDone(s, 4)) {
      cisTotal++;
      if (s.cisSentAt && new Date(s.cisSentAt).getTime() <= addDays(s.cisStartAt, config.sla.cisDays).getTime() + DAY) cisMet++;
    }
    if (s.offerLapseAt && stepDone(s, 14)) {
      offerTotal++;
      if (s.offerDecidedAt && new Date(s.offerDecidedAt).getTime() <= new Date(s.offerLapseAt).getTime() + DAY) offerMet++;
    }
    if (stepDone(s, 30) && s.arrivalAt) {
      const due = addMonths(s.arrivalAt, config.sla.followUpMonths);
      if (due.getTime() < now || stepDone(s, 31)) { fuTotal++; if (stepDone(s, 31)) fuMet++; }
    }
    uploaded += s.docsUploaded; accepted += s.docsAccepted; rejected += s.docsRejected;
    if (s.profileStarted) { consentTotal++; if (s.consentYes) consentCovered++; }
    transfers += s.transfersTotal; unsafeguarded += s.transfersUnsafeguarded;
  }
  const reviewed = accepted + rejected;
  return {
    total: summaries.length, status, open, retention, byStage,
    counsellors: [...couns.values()].sort((a, b) => b.open - a.open || byCodePoint(a.id, b.id)),
    enquiries: { last30, prev30 },
    funnel: [
      { label: "Enquiry", n: summaries.length },
      { label: "Qualified", n: funnelCounts[0] }, { label: "Application", n: funnelCounts[1] }, { label: "Offer", n: funnelCounts[2] },
      { label: "Acceptance", n: funnelCounts[3] }, { label: "Visa lodged", n: funnelCounts[4] }, { label: "Visa granted", n: granted }, { label: "Arrived", n: arrived },
    ],
    volume: months.map((m) => ({ month: m.key, enquiries: enq.get(m.key) ?? 0, arrivals: arr.get(m.key) ?? 0 })),
    sla: [
      { id: "cis", label: `CIS within ${config.sla.cisDays} days`, met: cisMet, total: cisTotal },
      { id: "offer", label: "Offer decided before lapse", met: offerMet, total: offerTotal },
      { id: "followup", label: `Follow-up at ${config.sla.followUpMonths} months`, met: fuMet, total: fuTotal },
    ],
    destinations: countRows(dest).slice(0, 8),
    channels: countRows(chan),
    exits: countRows(exits),
    docs: { uploaded, accepted, rejected, reworkPct: reviewed ? Math.round((rejected * 100) / reviewed) : 0 },
    leadDays: leadN ? Math.round(leadSum / leadN) : null,
    compliance: { consentCovered, consentTotal, consentPct: consentTotal ? Math.round((consentCovered * 100) / consentTotal) : 100, transfers, unsafeguarded },
    attention: flagged.sort((a, b) => a.rank - b.rank || b.at - a.at || byCodePoint(a.id, b.id)).slice(0, QUEUE_HEAD).map((x) => x.id),
    urgent: breachedCases.sort((a, b) => a.days - b.days || byCodePoint(a.id, b.id)).slice(0, QUEUE_HEAD).map((x) => x.id),
  };
}

export { STEP_BY_N };

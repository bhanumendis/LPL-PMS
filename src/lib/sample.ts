/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Demonstration data. This exists so the system can be shown to a room: an administrator
 * adds a self-contained set of staff accounts, students and cases, signs in as each role to
 * walk through how the records read, then removes the whole set again.
 *
 * Two rules govern everything here.
 *
 *   1. Every generated record carries the SAMPLE_PREFIX in its id. Removal deletes exactly
 *      what matches that prefix and nothing else, so a workspace that already holds real
 *      cases is never touched. Presence is derived by scanning for the prefix rather than
 *      by a stored flag, so the two can never disagree.
 *
 *   2. Generation is deterministic. A fixed seed drives the pseudo-random choices, so the
 *      same demonstration appears every time and a screenshot taken today still matches.
 *      Dates are the one exception: they are anchored to the moment of generation so the
 *      service-level clocks and the "overdue" queues are live rather than historical.
 */
import { STEPS, STEP_BY_N, STAGES, CHANNELS, DESTINATIONS, ORDERED_STEP_NUMBERS, stageOfStep } from "./spine";
import type { FieldDef } from "./spine";
import { hashPassword, store } from "./store";
import { EVENTS } from "./audit";
import type { AuditEvent } from "./audit";
import type {
  AuditEntry, AuditState, CaseEvent, CaseRecord, CasesState, DocItem, DocStatus,
  GateSubmission, OrgState, Role, StepState, TransferRecord, User,
} from "./types";

/** Marks every generated record. Removal keys off this and only this. */
export const SAMPLE_PREFIX = "sample-";

/**
 * The shared password for every generated account, shown in the Settings panel so whoever
 * is presenting can sign in as each role. It satisfies passwordProblem(): 15 characters,
 * four character classes. These accounts only ever exist in a demonstration workspace.
 */
export const SAMPLE_PASSWORD = "LyceumDemo!2026";

export interface SampleCounts { users: number; cases: number; audit: number }

export function isSampleId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(SAMPLE_PREFIX);
}

/** What is present right now, counted from the records themselves. */
export function sampleCounts(org: OrgState, cases: CasesState, audit: AuditState): SampleCounts {
  return {
    users: Object.keys(org.users ?? {}).filter(isSampleId).length,
    cases: Object.keys(cases.cases ?? {}).filter(isSampleId).length,
    audit: (audit.entries ?? []).filter((e) => isSampleId(e.id) || isSampleId(e.actorId)).length,
  };
}

// ---------- deterministic pseudo-randomness ----------

/** mulberry32: small, fast, and identical across engines, so a demonstration is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, xs: readonly T[]): T { return xs[Math.floor(r() * xs.length) % xs.length]; }
function int(r: () => number, lo: number, hi: number): number { return lo + Math.floor(r() * (hi - lo + 1)); }

// ---------- dates ----------

const DAY = 86400000;
/** An ISO timestamp `days` before the anchor, jittered within the working day. */
function daysBefore(anchor: number, days: number, r: () => number): string {
  const t = anchor - days * DAY + int(r, 9, 17) * 3600000 + int(r, 0, 59) * 60000;
  return new Date(Math.min(t, anchor - 60000)).toISOString();
}
/** An ISO date `days` after the anchor, for review dates and other forward-looking fields. */
function daysAfter(anchor: number, days: number): string { return new Date(anchor + days * DAY).toISOString(); }
function dateOnly(iso: string): string { return iso.slice(0, 10); }
function monthOnly(anchor: number, monthsAhead: number): string {
  const d = new Date(anchor);
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 7);
}

// ---------- people ----------

const STAFF = [
  { key: "tl", role: "team_leader" as Role, name: "Dilhani Rajapaksa", branch: "Colombo" },
  { key: "c1", role: "counsellor" as Role, name: "Kasun Wijeratne", branch: "Colombo" },
  { key: "c2", role: "counsellor" as Role, name: "Nethmi Gunawardena", branch: "Colombo" },
  { key: "c3", role: "counsellor" as Role, name: "Ruwan Alwis", branch: "Kandy" },
];

const STUDENTS = [
  "Nimal Perera", "Ayesha Fernando", "Sahan Wickramasinghe", "Tharushi Jayasuriya",
  "Chamod Ekanayake", "Hiruni Senanayake", "Malith Dissanayake", "Ishara Bandara",
  "Pasindu Ratnayake", "Oshadi Weerasinghe", "Janith Abeysekara", "Sanduni Herath",
  "Lahiru Amarasinghe", "Nadeesha Kumari", "Dineth Samarasinghe", "Yasas Liyanage",
  "Rashmi Karunaratne", "Thilina Mendis",
];

const UNIVERSITIES = [
  "University of Melbourne", "Monash University", "University of Sydney", "Deakin University",
  "University of Manchester", "University of Leeds", "Coventry University",
  "University of Toronto", "York University", "University of Auckland",
];

const PROGRAMMES = [
  "Bachelor of Medicine", "Master of Business Administration", "Bachelor of Engineering (Civil)",
  "Bachelor of Nursing", "Master of Information Technology", "Bachelor of Commerce",
  "Master of Public Health", "Bachelor of Science (Biomedical)", "Master of Data Science",
];

function email(name: string, domain: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).join(".") + "@" + domain;
}

// ---------- step values ----------

/**
 * Fills a step from its own field definitions rather than from a hand-written table, so a
 * step that gains a field still comes out complete and every `required` field is answered.
 * `showIf` is honoured against the values already chosen, so no contradictory pair appears.
 */
function valuesFor(n: number, r: () => number, anchor: number, ctx: { destination: string; programme: string; university: string; name: string; intakeMonths: number }): Record<string, unknown> {
  const def = STEP_BY_N[n];
  if (!def) return {};
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.showIf) {
      const seen = out[f.showIf.field];
      if (seen === undefined || seen !== f.showIf.equals) continue;
    }
    const v = valueForField(f, r, anchor, ctx);
    if (v !== undefined) out[f.id] = v;
  }
  return out;
}

function valueForField(f: FieldDef, r: () => number, anchor: number, ctx: { destination: string; programme: string; university: string; name: string; intakeMonths: number }): unknown {
  // A handful of fields carry the story of the case, so they are answered from its context
  // rather than at random; everything else is generated from the field's own type.
  switch (f.id) {
    case "fullName": return ctx.name;
    case "source": return pick(r, CHANNELS);
    case "preferredDestination": case "country": return ctx.destination;
    case "destinations": return [ctx.destination, pick(r, DESTINATIONS)].filter((v, i, a) => a.indexOf(v) === i);
    case "universities": return ctx.university;
    case "programmes": return ctx.programme;
    case "intake": return monthOnly(anchor, ctx.intakeMonths);
    case "interestedArea": return ctx.programme.replace(/^(Bachelor|Master) of /, "");
    case "outcome": return f.options?.[0] ?? "Yes";
    case "consent": case "tcSigned": return "Yes";
    case "priorRefusal": case "disability": return "No";
    case "englishTest": return "Yes";
    case "transferLogged": return "Yes";
    case "passportNumber": return "N" + int(r, 1000000, 9999999);
    case "tcVersion": return "v3.1";
    default: break;
  }
  switch (f.type) {
    case "yesno": return r() < 0.75 ? "Yes" : "No";
    case "checkbox": return true;
    case "select": return f.options?.length ? pick(r, f.options) : "Recorded";
    case "multiselect": return f.options?.length ? [pick(r, f.options)] : [];
    case "date": return dateOnly(daysBefore(anchor, int(r, 5, 200), r));
    case "month": return monthOnly(anchor, ctx.intakeMonths);
    case "number": return int(r, 1, 40);
    case "textarea": return sentenceFor(f, ctx);
    case "text": default: return shortFor(f, r, ctx);
  }
}

function sentenceFor(f: FieldDef, ctx: { name: string; programme: string; university: string }): string {
  if (/note/i.test(f.id)) return "Recorded during the counselling session with " + ctx.name + ".";
  if (/sponsor/i.test(f.id)) return "Sponsored by a parent in full-time employment; six months of statements supplied.";
  if (/recommend/i.test(f.id)) return "Recommended " + ctx.programme + " at " + ctx.university + " as the strongest fit.";
  return "Confirmed with the student and recorded against " + ctx.programme + ".";
}

function shortFor(f: FieldDef, r: () => number, ctx: { programme: string }): string {
  if (/school/i.test(f.id)) return pick(r, ["Royal College, Colombo", "Ananda College", "Visakha Vidyalaya", "Trinity College, Kandy", "Musaeus College"]);
  if (/result|gpa/i.test(f.id)) return pick(r, ["3 A passes", "GPA 3.4 / 4.0", "2 A and 1 B", "GPA 3.7 / 4.0"]);
  if (/subject/i.test(f.id)) return pick(r, ["Biology, Chemistry, Physics", "Combined Maths, Physics, Chemistry", "Accounting, Business Studies, Economics"]);
  if (/testOverall/i.test(f.id)) return pick(r, ["6.5", "7.0", "7.5", "6.0"]);
  if (/testBands/i.test(f.id)) return "6.5 / 7.0 / 6.0 / 6.5";
  if (/testRef/i.test(f.id)) return "IELTS-" + int(r, 100000, 999999);
  if (/ref|number|invoice/i.test(f.id)) return "REF-" + int(r, 10000, 99999);
  if (/amount|fee|cost/i.test(f.id)) return String(int(r, 8, 45) * 1000);
  if (/agent/i.test(f.id)) return "Colombo Education Partners";
  if (/dependant/i.test(f.id)) return "None";
  if (/duration/i.test(f.id)) return int(r, 1, 9) + " years";
  return ctx.programme;
}

// ---------- one case ----------

interface Shape {
  /**
   * How many steps the case has walked along ORDERED_STEP_NUMBERS — the spine's own order,
   * which is grouped by stage and is deliberately NOT numeric (stage 7 ends at step 21, and
   * stage 8 then opens at step 19). Taking a prefix of that order is what keeps a case
   * coherent: every `unlockAfter` dependency in the spine points backwards along it, so a
   * prefix can never contain a step whose prerequisite is missing. Counting by step number
   * instead would, for example, admit step 20 while step 19 was still outstanding.
   */
  walk: number;
  status: CaseRecord["status"];
  /** Leave the newest gate undecided so the approvals queue has something in it. */
  gatePending?: boolean;
  gateReturned?: boolean;
  /** Push the service-level clock past its window so the attention queues light up. */
  stale?: boolean;
  legalHold?: boolean;
  noCounsellor?: boolean;
  studentSignIn?: boolean;
}

/**
 * A deliberate spread rather than a random one: every stage of the spine is occupied, every
 * case status appears, and the queues that would otherwise read "nothing to do" — unassigned,
 * overdue, gate pending, legal hold — each have at least one case behind them.
 *
 * The walk positions map onto stages as: 1 Capture · 2-3 Qualify · 4-6 Match · 7-8 Feasibility
 * · 9-12 Apply · 13-14 Offers · 15-19 Accept and pay · 20-25 Visa · 26-30 Depart · 31 Follow-up.
 */
const SHAPES: Shape[] = [
  { walk: 1, status: "open", noCounsellor: true },
  { walk: 1, status: "open", noCounsellor: true, stale: true },
  { walk: 2, status: "open", studentSignIn: true },
  { walk: 3, status: "open", stale: true },
  { walk: 5, status: "open", studentSignIn: true },
  { walk: 6, status: "open" },
  { walk: 7, status: "open", stale: true },
  { walk: 8, status: "open" },
  { walk: 10, status: "open", studentSignIn: true },
  { walk: 12, status: "open" },
  { walk: 13, status: "open", stale: true },
  { walk: 14, status: "open" },
  { walk: 16, status: "open", gatePending: true },
  { walk: 17, status: "open", gateReturned: true },
  { walk: 19, status: "open" },
  { walk: 21, status: "open", gatePending: true, studentSignIn: true },
  { walk: 24, status: "hold" },
  { walk: 9, status: "exited" },
  { walk: 27, status: "deferred" },
  { walk: 30, status: "open", stale: true },
  { walk: 31, status: "completed", legalHold: true },
  { walk: 31, status: "completed" },
];

interface Built {
  users: User[];
  cases: CaseRecord[];
  audit: AuditEntry[];
}

/** Builds the whole set in memory. Nothing is written until the caller commits it. */
async function build(actor: Pick<User, "id" | "name" | "role">, entityCode: string, startNumber: number): Promise<Built> {
  const r = rng(20260916);
  const anchor = Date.now();
  const hash = await hashPassword(SAMPLE_PASSWORD);
  const year = new Date(anchor).getFullYear();

  const users: User[] = [];
  const staffById: Record<string, User> = {};
  for (const s of STAFF) {
    const u: User = {
      id: SAMPLE_PREFIX + "staff-" + s.key,
      name: s.name,
      email: email(s.name, "lyceumplacements.demo"),
      phone: "07" + int(r, 10000000, 79999999),
      branch: s.branch,
      role: s.role,
      passwordHash: hash,
      active: true,
      createdAt: daysBefore(anchor, int(r, 200, 400), r),
      createdBy: actor.id,
      lastSignInAt: daysBefore(anchor, int(r, 0, 3), r),
    };
    users.push(u);
    staffById[s.key] = u;
  }
  const counsellors = [staffById.c1, staffById.c2, staffById.c3];
  const teamLeader = staffById.tl;

  const cases: CaseRecord[] = [];
  const audit: AuditEntry[] = [];
  let auditSeq = 0;
  const addAudit = (at: string, who: Pick<User, "id" | "name" | "role">, ev: AuditEvent) => {
    audit.push({
      id: SAMPLE_PREFIX + "audit-" + (auditSeq++).toString().padStart(4, "0"),
      at,
      actorId: who.id,
      actorName: who.name,
      actorRole: who.role,
      action: ev.action,
      target: ev.target,
      detail: ev.detail,
      eventType: ev.eventType,
      entityType: ev.entityType,
      entityId: ev.entityId,
      entityLabel: ev.entityLabel,
      outcome: ev.outcome ?? "success",
      source: "Sample data",
      summary: ev.summary,
      changes: ev.changes,
      meta: ev.meta,
    });
  };

  SHAPES.forEach((shape, i) => {
    const name = STUDENTS[i % STUDENTS.length];
    const destination = pick(r, DESTINATIONS.slice(0, 6));
    const programme = pick(r, PROGRAMMES);
    const university = pick(r, UNIVERSITIES);
    const ctx = { destination, programme, university, name, intakeMonths: int(r, 3, 11) };
    const id = SAMPLE_PREFIX + "case-" + String(i + 1).padStart(3, "0");
    const ref = entityCode + "-" + year + "-" + String(startNumber + i).padStart(4, "0");
    const counsellor = shape.noCounsellor ? undefined : counsellors[i % counsellors.length];

    // Older cases have walked further, so age tracks progress rather than contradicting it.
    const ageDays = shape.stale ? int(r, 45, 150) : Math.max(3, Math.round(shape.walk * 4) + int(r, 2, 20));
    const createdAt = daysBefore(anchor, ageDays, r);

    const steps: Record<number, StepState> = {};
    const events: CaseEvent[] = [];
    // A prefix of the spine order, never a numeric range — see the note on Shape.walk.
    const walked = ORDERED_STEP_NUMBERS.slice(0, shape.walk);
    const reached = new Set(walked);
    const lastStep = walked[walked.length - 1] ?? 1;
    walked.forEach((n, k) => {
      // Spread the completions between the open date and now, oldest first.
      const at = daysBefore(anchor, Math.max(1, Math.round(ageDays * (1 - (k + 1) / (walked.length + 1)))), r);
      const def = STEP_BY_N[n];
      const optionalSkipped = def?.optional && r() < 0.45;
      steps[n] = optionalSkipped
        ? { status: "na", values: {}, completedAt: at, completedBy: (counsellor ?? teamLeader).id }
        : {
            status: "done",
            values: valuesFor(n, r, anchor, ctx),
            completedAt: at,
            completedBy: (def?.owner === "Team Leader" ? teamLeader : counsellor ?? teamLeader).id,
            ...(def?.studentAction ? { studentSubmittedAt: at } : {}),
          };
      if (k % 3 === 0 || n === lastStep) {
        events.push({
          id: id + "-ev-" + n,
          at,
          by: (counsellor ?? teamLeader).id,
          byName: (counsellor ?? teamLeader).name,
          type: "step",
          text: "Step " + n + " recorded — " + (def?.title ?? ""),
          step: n,
        });
      }
      addAudit(at, counsellor ?? teamLeader, EVENTS.stepCompleted({ id, ref }, n));
    });

    // The step the case is sitting on is left pending rather than absent, so the workspace
    // and the student journey both show a current step instead of a gap.
    const next = ORDERED_STEP_NUMBERS[shape.walk];
    if (next !== undefined && shape.status === "open") steps[next] = { status: "pending", values: {} };

    // Everything below hangs off which steps were actually reached, not off a step number,
    // so a case can never carry a document or a gate for work it has not done.
    const documents: DocItem[] = [];
    if (reached.has(10)) documents.push(...docsFor(id, 10, r, anchor, ageDays, counsellor ?? teamLeader, teamLeader));
    if (reached.has(15)) documents.push(...docsFor(id, 15, r, anchor, ageDays, counsellor ?? teamLeader, teamLeader));

    const gates: GateSubmission[] = [];
    if (reached.has(16)) {
      gates.push(gateFor(id, 16, 1, daysBefore(anchor, Math.max(2, ageDays - 30), r), counsellor ?? teamLeader, teamLeader,
        shape.gatePending && !reached.has(19) ? "pending" : shape.gateReturned ? "returned" : "approved", anchor, r));
    }
    if (reached.has(19)) {
      gates.push(gateFor(id, 19, 1, daysBefore(anchor, Math.max(1, ageDays - 45), r), counsellor ?? teamLeader, teamLeader,
        shape.gatePending ? "pending" : "approved", anchor, r));
    }

    const transfers: TransferRecord[] = [];
    if (reached.has(11)) {
      transfers.push({
        id: id + "-tr-1",
        at: daysBefore(anchor, Math.max(2, ageDays - 20), r),
        by: (counsellor ?? teamLeader).id,
        byName: (counsellor ?? teamLeader).name,
        step: 11,
        recipient: university,
        recipientType: "university",
        country: destination,
        dataCategories: ["Identity", "Education"],
        lawfulBasis: "Performance of a contract",
      } as TransferRecord);
    }

    const rec: CaseRecord = {
      id,
      ref,
      student: { name, email: email(name, "student.demo"), phone: "07" + int(r, 10000000, 79999999) },
      status: shape.status,
      steps,
      documents,
      gates,
      events: events.reverse(),
      transfers,
      createdAt,
      updatedAt: daysBefore(anchor, shape.stale ? int(r, 25, 60) : int(r, 0, 6), r),
      rev: walked.length + 1,
    };
    if (counsellor) { rec.counsellorId = counsellor.id; rec.assignedAt = createdAt; rec.assignedBy = teamLeader.id; }
    if (shape.status === "hold") rec.hold = { country: destination, intake: monthOnly(anchor, 9), programme, reviewDate: dateOnly(daysAfter(anchor, int(r, 20, 70))), note: "Deferred to the next intake at the student's request." };
    if (shape.status === "exited") rec.exit = { code: "E03", reason: "Student chose not to proceed after the feasibility review.", step: lastStep, stage: stageOfStep(lastStep).id, at: daysBefore(anchor, int(r, 10, 40), r), by: (counsellor ?? teamLeader).id };
    if (shape.legalHold) rec.legalHold = { at: daysBefore(anchor, int(r, 5, 30), r), by: teamLeader.id, byName: teamLeader.name, reason: "Retained pending a sponsor funding query." };

    if (shape.studentSignIn) {
      const su: User = {
        id: SAMPLE_PREFIX + "student-" + String(i + 1).padStart(3, "0"),
        name,
        email: rec.student.email,
        phone: rec.student.phone,
        role: "student",
        passwordHash: hash,
        active: true,
        createdAt,
        createdBy: (counsellor ?? teamLeader).id,
        lastSignInAt: daysBefore(anchor, int(r, 0, 5), r),
      };
      users.push(su);
      rec.studentUserId = su.id;
    }

    addAudit(createdAt, counsellor ?? teamLeader, EVENTS.caseOpened({ id, ref }, "Sample data"));
    if (counsellor) addAudit(createdAt, teamLeader, EVENTS.caseAssigned({ id, ref }, counsellor.name));
    cases.push(rec);
  });

  // Sign-ins give the audit explorer a spread of actors and event types, not just case work.
  for (const u of users.filter((x) => x.role !== "student").slice(0, 4)) {
    for (let d = 0; d < 6; d++) addAudit(daysBefore(anchor, d * 3 + int(r, 0, 2), r), u, EVENTS.sessionSignIn(u));
  }

  audit.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { users, cases, audit };
}

const DOC_KINDS: Record<10 | 15, string[]> = {
  10: ["passport", "certificates", "transcripts", "english", "photo", "agreement"],
  15: ["bank", "sponsorLetter", "sponsorId"],
};

function docsFor(caseId: string, step: 10 | 15, r: () => number, anchor: number, ageDays: number, uploader: User, reviewer: User): DocItem[] {
  return DOC_KINDS[step].map((kind, k) => {
    const at = daysBefore(anchor, Math.max(2, ageDays - 15 - k), r);
    // Most land accepted; one or two sit unreviewed or rejected so the review states are visible.
    const status: DocStatus = r() < 0.72 ? "accepted" : r() < 0.6 ? "uploaded" : "rejected";
    const d: DocItem = {
      id: caseId + "-doc-" + step + "-" + kind,
      step,
      kind,
      fileName: kind + "-" + caseId.slice(-3) + ".pdf",
      size: int(r, 90, 3200) * 1024,
      mime: "application/pdf",
      uploadedAt: at,
      uploadedBy: uploader.id,
      status,
    };
    if (status !== "uploaded") {
      d.reviewedBy = reviewer.id;
      d.reviewedAt = daysBefore(anchor, Math.max(1, ageDays - 18 - k), r);
      if (status === "rejected") d.reviewNote = "Not legible at the corners — please re-scan the full page.";
    }
    return d;
  });
}

function gateFor(caseId: string, gate: 16 | 19, round: number, at: string, by: User, decider: User, status: GateSubmission["status"], anchor: number, r: () => number): GateSubmission {
  const g: GateSubmission = { id: caseId + "-gate-" + gate + "-" + round, gate, round, submittedAt: at, submittedBy: by.id, status };
  if (status !== "pending") {
    g.decidedAt = daysBefore(anchor, int(r, 1, 12), r);
    g.decidedBy = decider.id;
    if (status === "returned") g.suggestions = "Six months of statements are needed rather than three; please resubmit with the sponsor's payslips.";
  }
  return g;
}

// ---------- commit ----------

/**
 * Adds the demonstration set. Existing records are left exactly as they are: this merges
 * in, it never replaces. Returns what was created so the caller can report it.
 */
export async function addSampleData(actor: Pick<User, "id" | "name" | "role">): Promise<SampleCounts> {
  const snap = store.snap;
  const entityCode = snap.org.config.entityCode || "LPL";
  // Start well clear of any real reference so the two sets never collide.
  const startNumber = Math.max(9001, (snap.org.config.caseCounter ?? 0) + 1001);
  const built = await build(actor, entityCode, startNumber);

  await store.mutateOrg((o) => {
    for (const u of built.users) o.users[u.id] = u;
    return o;
  });
  await store.mutateCases((c) => {
    for (const rec of built.cases) c.cases[rec.id] = rec;
    return c;
  });

  // The audit rows are written as a block with their own timestamps, which pushAudit cannot
  // do (it stamps "now" and prepends). replaceAll is the only path that preserves the spread.
  const after = store.snap;
  const merged: AuditState = {
    entries: [...built.audit, ...(after.audit.entries ?? [])].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 600),
    rev: (after.audit.rev ?? 0) + 1,
  };
  await store.replaceAll(after.org, after.cases, merged, after.prompts);
  await store.audit(EVENTS.sampleDataAdded(built.users.length, built.cases.length), actor);

  return { users: built.users.length, cases: built.cases.length, audit: built.audit.length };
}

/**
 * Removes every record carrying the prefix and nothing else. Real cases, real accounts and
 * real audit history are untouched, including on a workspace where the two are interleaved.
 */
export async function removeSampleData(actor: Pick<User, "id" | "name" | "role">): Promise<SampleCounts> {
  const before = sampleCounts(store.snap.org, store.snap.cases, store.snap.audit);

  const org: OrgState = { ...store.snap.org, users: { ...store.snap.org.users } };
  for (const id of Object.keys(org.users)) if (isSampleId(id)) delete org.users[id];

  const cases: CasesState = { ...store.snap.cases, cases: { ...store.snap.cases.cases } };
  for (const id of Object.keys(cases.cases)) if (isSampleId(id)) delete cases.cases[id];

  const audit: AuditState = {
    entries: (store.snap.audit.entries ?? []).filter((e) => !isSampleId(e.id) && !isSampleId(e.actorId)),
    rev: (store.snap.audit.rev ?? 0) + 1,
  };

  await store.replaceAll(org, cases, audit, store.snap.prompts);
  await store.audit(EVENTS.sampleDataRemoved(before.users, before.cases), actor);
  return before;
}

/** The step totals quoted in the Settings panel, so the copy cannot drift from the spine. */
export const SAMPLE_SHAPE_SUMMARY = {
  cases: SHAPES.length,
  staff: STAFF.length,
  stages: STAGES.length,
  steps: STEPS.length,
  withSignIn: SHAPES.filter((s) => s.studentSignIn).length,
};

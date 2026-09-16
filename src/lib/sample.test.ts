/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The demonstration set has one safety property that matters more than any other: removing it
 * must leave a workspace's real records exactly as they were. These tests seed a workspace that
 * holds both, run the round trip, and check the real side byte for byte.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { nowIso, store, hashPassword } from "./store";
import { addSampleData, removeSampleData, sampleCounts, isSampleId, SAMPLE_PREFIX, SAMPLE_PASSWORD, SAMPLE_SHAPE_SUMMARY } from "./sample";
import { passwordProblem } from "./store";
import { ORDERED_STEP_NUMBERS, STEP_BY_N, STAGES } from "./spine";
import type { CaseRecord, User } from "./types";

const ADMIN: User = { id: "real-admin", name: "Bhanu Mendis", email: "admin@example.com", role: "admin", passwordHash: "", active: true, createdAt: nowIso() };

const REAL_CASE: CaseRecord = {
  id: "real-case-1",
  ref: "LPL-2026-0001",
  student: { name: "Real Student", email: "real@example.com", phone: "0770000000" },
  status: "open",
  steps: { 1: { status: "done", values: { source: "Website" }, completedAt: nowIso(), completedBy: "real-admin" } },
  documents: [], gates: [], events: [],
  createdAt: nowIso(), updatedAt: nowIso(), rev: 1,
};

async function seedRealWorkspace() {
  await store.resetAll();
  await store.mutateOrg((o) => { o.config.setupComplete = true; o.config.entityCode = "LPL"; o.users[ADMIN.id] = ADMIN; return o; });
  await store.mutateCases((c) => { c.cases[REAL_CASE.id] = structuredClone(REAL_CASE); return c; });
  await store.replaceAll(store.snap.org, store.snap.cases, {
    entries: [{ id: "real-audit-1", at: nowIso(), actorId: ADMIN.id, actorName: ADMIN.name, actorRole: "admin", action: "Case opened", target: REAL_CASE.ref }],
    rev: 1,
  }, store.snap.prompts);
}

describe("sample data", () => {
  beforeEach(async () => { await seedRealWorkspace(); });

  it("adds staff, students and cases without touching what is already there", async () => {
    const made = await addSampleData(ADMIN);
    expect(made.cases).toBe(SAMPLE_SHAPE_SUMMARY.cases);
    expect(made.users).toBeGreaterThanOrEqual(SAMPLE_SHAPE_SUMMARY.staff);

    const { org, cases } = store.snap;
    expect(org.users[ADMIN.id]).toEqual(ADMIN);
    expect(cases.cases[REAL_CASE.id]).toEqual(REAL_CASE);
  });

  it("gives every generated record the prefix, so removal can be exact", async () => {
    await addSampleData(ADMIN);
    const { org, cases, audit } = store.snap;
    const added = Object.keys(cases.cases).filter((id) => id !== REAL_CASE.id);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(isSampleId)).toBe(true);
    expect(Object.keys(org.users).filter((id) => id !== ADMIN.id).every(isSampleId)).toBe(true);
    // The add/remove audit row is written under the real administrator, so it is not prefixed;
    // every row the generator itself produced is.
    const generated = audit.entries.filter((e) => e.id !== "real-audit-1" && e.action !== "Sample data added");
    expect(generated.every((e) => isSampleId(e.id))).toBe(true);
  });

  it("covers every stage and every case status so no dashboard reads empty", async () => {
    await addSampleData(ADMIN);
    const sample = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id));

    const statuses = new Set(sample.map((c) => c.status));
    expect([...statuses].sort()).toEqual(["completed", "deferred", "exited", "hold", "open"]);

    // Every stage of the spine has at least one case whose furthest recorded step sits in it.
    const stagesTouched = new Set<string>();
    for (const c of sample) {
      for (const n of Object.keys(c.steps).map(Number)) {
        if (c.steps[n].status === "pending") continue;
        const def = STEP_BY_N[n];
        if (def) stagesTouched.add(def.stage);
      }
    }
    for (const s of STAGES) expect(stagesTouched.has(s.id), `stage ${s.id} (${s.name}) has no completed step`).toBe(true);
  });

  it("fills the queues that would otherwise say there is nothing to do", async () => {
    await addSampleData(ADMIN);
    const sample = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id));

    expect(sample.some((c) => !c.counsellorId), "an unassigned case").toBe(true);
    expect(sample.some((c) => c.gates.some((g) => g.status === "pending")), "a gate awaiting a decision").toBe(true);
    expect(sample.some((c) => c.gates.some((g) => g.status === "returned")), "a returned gate").toBe(true);
    expect(sample.some((c) => c.legalHold), "a case under legal hold").toBe(true);
    expect(sample.some((c) => c.documents.some((d) => d.status === "uploaded")), "a document awaiting review").toBe(true);
    expect(sample.some((c) => c.documents.some((d) => d.status === "rejected")), "a rejected document").toBe(true);
    expect(sample.some((c) => (c.transfers ?? []).length > 0), "a cross-border transfer").toBe(true);
    expect(sample.some((c) => c.studentUserId), "a student who can sign in").toBe(true);
    expect(sample.some((c) => c.exit), "an exited case with a reason").toBe(true);
  });

  it("records every required field on each completed step", async () => {
    await addSampleData(ADMIN);
    const sample = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id));
    for (const c of sample) {
      for (const [k, st] of Object.entries(c.steps)) {
        if (st.status !== "done") continue;
        const def = STEP_BY_N[Number(k)];
        if (!def) continue;
        for (const f of def.fields) {
          // Conditional fields only apply when their condition is met by the values chosen.
          if (f.showIf && st.values[f.showIf.field] !== f.showIf.equals) continue;
          if (!f.required) continue;
          expect(st.values[f.id], `${c.ref} step ${k} field ${f.id}`).not.toBe(undefined);
        }
      }
    }
  });

  it("walks steps in spine order and never leaves a gap", async () => {
    await addSampleData(ADMIN);
    const sample = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id));
    for (const c of sample) {
      const recorded = ORDERED_STEP_NUMBERS.filter((n) => c.steps[n] && c.steps[n].status !== "pending");
      const furthest = recorded.length ? ORDERED_STEP_NUMBERS.indexOf(recorded[recorded.length - 1]) : -1;
      for (let i = 0; i <= furthest; i++) {
        const n = ORDERED_STEP_NUMBERS[i];
        expect(c.steps[n], `${c.ref} is missing step ${n} below its furthest step`).toBeTruthy();
      }
    }
  });

  it("issues accounts that satisfy the password rule and can be signed into", async () => {
    expect(passwordProblem(SAMPLE_PASSWORD)).toBeNull();
    await addSampleData(ADMIN);
    const hash = await hashPassword(SAMPLE_PASSWORD);
    const accounts = Object.values(store.snap.org.users).filter((u) => isSampleId(u.id));
    expect(accounts.length).toBeGreaterThan(0);
    for (const u of accounts) {
      expect(u.passwordHash, `${u.email} cannot sign in`).toBe(hash);
      expect(u.active).toBe(true);
    }
    expect(new Set(accounts.map((u) => u.role))).toEqual(new Set(["team_leader", "counsellor", "student"]));
  });

  it("removes everything it added and nothing else", async () => {
    await addSampleData(ADMIN);
    expect(sampleCounts(store.snap.org, store.snap.cases, store.snap.audit).cases).toBeGreaterThan(0);

    await removeSampleData(ADMIN);

    const { org, cases, audit } = store.snap;
    expect(Object.keys(org.users)).toEqual([ADMIN.id]);
    expect(Object.keys(cases.cases)).toEqual([REAL_CASE.id]);
    expect(cases.cases[REAL_CASE.id]).toEqual(REAL_CASE);
    expect(org.users[ADMIN.id]).toEqual(ADMIN);
    expect(audit.entries.some((e) => e.id === "real-audit-1")).toBe(true);
    expect(audit.entries.some((e) => isSampleId(e.id))).toBe(false);
    expect(sampleCounts(org, cases, audit)).toEqual({ users: 0, cases: 0, audit: 0 });
  });

  it("is a no-op to remove when none is present", async () => {
    const before = JSON.stringify(store.snap.cases);
    const gone = await removeSampleData(ADMIN);
    expect(gone).toEqual({ users: 0, cases: 0, audit: 0 });
    expect(JSON.stringify(store.snap.cases.cases)).toContain(REAL_CASE.id);
    expect(Object.keys(store.snap.cases.cases)).toEqual(JSON.parse(before).cases ? Object.keys(JSON.parse(before).cases) : []);
  });

  it("generates the same set every time", async () => {
    await addSampleData(ADMIN);
    const first = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id)).map((c) => `${c.id}|${c.ref}|${c.student.name}|${c.status}`).sort();
    await removeSampleData(ADMIN);
    await addSampleData(ADMIN);
    const second = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id)).map((c) => `${c.id}|${c.ref}|${c.student.name}|${c.status}`).sort();
    expect(second).toEqual(first);
  });

  it("keeps sample references clear of the real numbering", async () => {
    await addSampleData(ADMIN);
    const refs = Object.values(store.snap.cases.cases).filter((c) => isSampleId(c.id)).map((c) => c.ref);
    expect(refs).not.toContain(REAL_CASE.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.every((r) => r.startsWith("LPL-"))).toBe(true);
  });

  it("names the prefix it actually uses", () => {
    expect(SAMPLE_PREFIX).toBe("sample-");
    expect(isSampleId("sample-case-001")).toBe(true);
    expect(isSampleId("real-case-1")).toBe(false);
    expect(isSampleId(undefined)).toBe(false);
  });
});

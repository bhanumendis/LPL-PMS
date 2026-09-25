/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Test-only generator of varied case documents, deterministic by seed. It exists to hold the
 * three derivations of a case (signals.ts, summary.ts, and public.case_derive in SQL) to each
 * other across states a hand-written fixture would miss: skipped and reopened steps, gates in
 * every round and status, month-end dates, every case status. Nothing here ships.
 */
import type { CaseRecord, CaseStatus, DocItem, GateSubmission, StepState, TransferRecord } from "@/lib/types";
import { ORDERED_STEP_NUMBERS } from "@/lib/spine";

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

export function generateCases(n: number, seed: number, now: number): CaseRecord[] {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const iso = (t: number) => new Date(t).toISOString();
  const dateOnly = (t: number) => new Date(t).toISOString().slice(0, 10);
  const around = (days: number) => now + Math.round((r() * 2 - 1) * days * DAY);
  const out: CaseRecord[] = [];
  for (let i = 0; i < n; i++) {
    const id = `gen-${seed}-${i}`;
    const created = around(400);
    const steps: Record<number, StepState> = {};
    // Walk the ordered steps, stopping at a random point; sprinkle not-applicable and gaps.
    // One case in six is near the end of the journey, so the follow-up clock is exercised.
    const reach = chance(0.16) ? ORDERED_STEP_NUMBERS.length - 1 : Math.floor(r() * (ORDERED_STEP_NUMBERS.length + 2));
    ORDERED_STEP_NUMBERS.forEach((step, k) => {
      if (k < reach) {
        const status = chance(0.08) ? "na" : chance(0.05) ? "pending" : "done";
        steps[step] = { status, values: {}, completedAt: status === "pending" ? undefined : iso(created + k * 3 * DAY), completedBy: "u1" };
      } else if (chance(0.1)) {
        steps[step] = { status: "pending", values: {} };
      }
    });
    const vals = (step: number) => (steps[step] ??= { status: "pending", values: {} }).values;
    vals(1).source = pick(["Walk-in", "Website", "Hotline", "", "Events"]);
    if (chance(0.3)) vals(1).preferredDestination = pick(["Australia", "Canada", "United Kingdom"]);
    if (chance(0.6)) Object.assign(vals(2), { fullName: "Student " + i, ...(chance(0.7) ? { consent: pick(["Yes", "No"]) } : {}), ...(chance(0.4) ? { destinations: [pick(["Ireland", "Malaysia"])] } : {}) });
    if (chance(0.3)) { vals(2); steps[2].studentSubmittedAt = iso(created + 2 * DAY); }
    if (chance(0.3)) vals(4).cisSentDate = dateOnly(created + Math.round(r() * 12) * DAY);
    if (chance(0.25)) vals(5).requestedDate = dateOnly(around(20));
    if (chance(0.3)) vals(6).countries = [pick(["New Zealand", "Germany"])];
    if (chance(0.4)) vals(13).offerLapseDate = dateOnly(around(60));
    if (chance(0.3)) { vals(14).country = pick(["Australia", "Hungary", ""]); vals(14).acceptedDate = dateOnly(around(60)); }
    if (chance(0.25)) vals(27).outcome = pick(["Granted", "Refused"]);
    if (chance(0.35)) {
      // Month-end arrivals exercise the month-clamping rule.
      const base = new Date(around(200));
      vals(30).arrivalDate = chance(0.3) ? dateOnly(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)) : dateOnly(base.getTime());
    }
    for (const k of Object.keys(steps)) if (Object.keys(steps[Number(k)].values).length === 0 && steps[Number(k)].status === "pending" && chance(0.5)) delete steps[Number(k)];
    const gates: GateSubmission[] = [];
    for (const g of [16, 19] as const) {
      const rounds = chance(0.4) ? 1 + Math.floor(r() * 3) : 0;
      for (let round = 1; round <= rounds; round++) {
        const status = round < rounds ? pick(["returned", "approved"] as const) : pick(["pending", "approved", "returned"] as const);
        gates.push({ id: `${id}-g${g}-${round}`, gate: g, round, submittedAt: iso(created + (20 + round) * DAY), submittedBy: "u1", status, ...(status === "returned" && chance(0.5) ? { addressedAt: iso(created + 30 * DAY), addressedNote: "done" } : {}) });
      }
    }
    const documents: DocItem[] = Array.from({ length: Math.floor(r() * 5) }, (_, d) => ({
      id: `${id}-d${d}`, step: pick([10, 15] as const), kind: "k", fileName: "f.pdf", size: 1, mime: "application/pdf",
      uploadedAt: iso(created + d * DAY), uploadedBy: "u1", status: pick(["uploaded", "accepted", "rejected"] as const),
    }));
    const transfers: TransferRecord[] = Array.from({ length: Math.floor(r() * 3) }, (_, t) => ({
      id: `${id}-t${t}`, at: iso(created), by: "u1", byName: "U", step: 11, recipient: "Uni", recipientType: "university", country: "Australia",
      dataCategories: [], lawfulBasis: "x", safeguard: chance(0.5) ? "None recorded" : "Processor agreement",
    }));
    const status: CaseStatus = pick(["open", "open", "open", "hold", "deferred", "exited", "completed"]);
    const updated = Math.max(created, around(120));
    const c: CaseRecord = {
      id, ref: `LPL-GEN-${i}`, status,
      student: { name: `Student ${i}`, email: `s${i}@example.com`, phone: "1" },
      counsellorId: chance(0.8) ? pick(["c1", "c2", "c3"]) : undefined,
      studentUserId: chance(0.5) ? `stu-${seed}-${i}` : undefined,
      steps, documents, gates, transfers,
      events: chance(0.8) ? [{ id: `${id}-e`, at: iso(updated), by: pick(["c1", "u1"]), byName: "X", type: "step", text: "t" }] : [],
      createdAt: iso(created), updatedAt: iso(updated), rev: 1,
    };
    // Retention anchors near the default disposal dates (24 months after exit, 18 months dormant)
    // so "due soon" and "overdue" both occur under the standard policy.
    const nearDue = (months: number) => now - months * 30.44 * DAY + Math.round(r() * 25) * DAY;
    if (status === "exited") c.exit = { code: pick(["Financial requirement not met", "Visa refused, not re-applying"]), reason: "", step: 8, stage: "P4", at: iso(pick([updated - 800 * DAY, updated - 10 * DAY, nearDue(24)])), by: "u1" };
    if ((status === "hold" || status === "deferred") && chance(0.3)) c.updatedAt = iso(nearDue(18));
    if (status === "hold" || status === "deferred") c.hold = chance(0.7) ? { reviewDate: dateOnly(around(40)) } : {};
    if (chance(0.05)) c.disposal = { at: iso(updated), by: "u1", byName: "U", basis: "b" };
    if (chance(0.05)) c.legalHold = { at: iso(updated), by: "u1", byName: "U", reason: "r" };
    out.push(c);
  }
  return out;
}

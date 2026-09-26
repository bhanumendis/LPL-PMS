/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { compareSeverity, countBadges, deriveAll, deriveCaseSignals } from "./signals";
import { defaultConfig } from "./defaults";
import { blankCase, ISO } from "@/test/fixtures";

const config = defaultConfig();

describe("deriveCaseSignals", () => {
  it("flags a returned gate as bad and lists it first", () => {
    const c = blankCase({ counsellorId: "u1", gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: "u1", status: "returned", decidedAt: ISO, decidedBy: "tl", suggestions: "Add the bank letter" }] });
    const s = deriveCaseSignals(c, config);
    expect(s.gateReturned).toBe(16);
    expect(s.severity).toBe("bad");
    expect(s.attention[0]).toMatchObject({ kind: "gate-returned", label: "Gate 16 returned with suggestions", step: 16 });
  });
  it("counts documents awaiting review as info", () => {
    const c = blankCase({ documents: [{ id: "d1", step: 10, kind: "passport", fileName: "p.pdf", size: 10, mime: "application/pdf", uploadedAt: ISO, uploadedBy: "s1", status: "uploaded" }] });
    const s = deriveCaseSignals(c, config);
    expect(s.docsToReview).toBe(1);
    expect(s.severity).toBe("info");
    expect(s.attention.map((a) => a.label)).toContain("1 document awaiting your review");
  });
  it("a submitted profile awaiting confirmation is info", () => {
    const c = blankCase({ steps: { 1: { status: "done", values: {} }, 2: { status: "pending", values: {}, studentSubmittedAt: ISO } } });
    const s = deriveCaseSignals(c, config);
    expect(s.profileSubmitted).toBe(true);
    expect(s.attention[0].kind).toBe("profile");
  });
  it("a breached clock is bad", () => {
    const old = "2026-01-01T00:00:00.000Z";
    const c = blankCase({ steps: { 1: { status: "done", values: {} }, 2: { status: "done", values: {} }, 3: { status: "done", completedAt: old, values: {} } } });
    const s = deriveCaseSignals(c, config);
    expect(s.breached).toBe(1);
    expect(s.attention[0]).toMatchObject({ kind: "sla", severity: "bad", step: 4 });
    expect(s.attention[0].label).toMatch(/Course Information Sheet due · \d+d overdue/);
  });
  it("a closed case has no attention", () => {
    const c = blankCase({ status: "exited", gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: "u1", status: "pending" }] });
    const s = deriveCaseSignals(c, config);
    expect(s.attention).toEqual([]);
    expect(s.severity).toBe("none");
    expect(s.gatePending).toBeUndefined();
  });
  it("deriveAll returns one entry per case and compareSeverity orders bad before none", () => {
    const quiet = blankCase({ id: "c2", ref: "LPL-2026-0002" });
    const returned = blankCase({ id: "c3", ref: "LPL-2026-0003", gates: [{ id: "g1", gate: 19, round: 1, submittedAt: ISO, submittedBy: "u1", status: "returned", decidedAt: ISO, decidedBy: "tl" }] });
    const all = deriveAll({ [quiet.id]: quiet, [returned.id]: returned }, config);
    expect(all.size).toBe(2);
    const sorted = [...all.values()].sort(compareSeverity);
    expect(sorted[0].id).toBe("c3");
  });
  it("countBadges narrows review counts to the counsellor's caseload", () => {
    const mine = blankCase({ id: "c1", counsellorId: "me", documents: [{ id: "d1", step: 10, kind: "passport", fileName: "p.pdf", size: 1, mime: "x", uploadedAt: ISO, uploadedBy: "s", status: "uploaded" }] });
    const theirs = blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: "other", documents: [{ id: "d2", step: 10, kind: "passport", fileName: "p.pdf", size: 1, mime: "x", uploadedAt: ISO, uploadedBy: "s", status: "uploaded" }] });
    const unassigned = blankCase({ id: "c3", ref: "LPL-2026-0003" });
    const all = deriveAll({ c1: mine, c2: theirs, c3: unassigned }, config);
    expect(countBadges(all.values(), { mineId: "me" })).toMatchObject({ toReview: 1, unassigned: 1 });
    expect(countBadges(all.values())).toMatchObject({ toReview: 2 });
  });
});

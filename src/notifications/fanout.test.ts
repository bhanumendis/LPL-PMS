/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { fanout, recipientsHolding, type FanoutContext } from "./fanout";
import { deriveReminders, displayTitle, relativeTime } from "./reminders";
import { defaultConfig } from "@/lib/defaults";
import { deriveAll } from "@/lib/signals";
import { blankCase, ISO, user } from "@/test/fixtures";
import type { CaseRecord, DocItem, GateSubmission } from "@/lib/types";

const users = {
  admin: user({ id: "admin", role: "admin" }),
  tl: user({ id: "tl", role: "team_leader" }),
  couns: user({ id: "couns", role: "counsellor" }),
  stu: user({ id: "stu", role: "student" }),
  gone: user({ id: "gone", role: "team_leader", active: false }),
};
const ctx = (actorId: string): FanoutContext => ({ actorId, users, config: defaultConfig(), now: "2026-09-12T10:00:00.000Z" });
const base = () => blankCase({ counsellorId: "couns", studentUserId: "stu", assignedAt: ISO });
const gate = (over: Partial<GateSubmission> = {}): GateSubmission => ({ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: "couns", status: "pending", ...over });
const doc = (over: Partial<DocItem> = {}): DocItem => ({ id: "d1", step: 10, kind: "passport", fileName: "p.pdf", size: 1, mime: "application/pdf", uploadedAt: ISO, uploadedBy: "stu", status: "uploaded", ...over });

describe("fanout", () => {
  it("assignment notifies the new counsellor, not the actor", () => {
    const prev = blankCase();
    const next = blankCase({ counsellorId: "couns", assignedAt: ISO });
    const rows = fanout(prev, next, ctx("admin"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientId: "couns", type: "case_assigned", title: "Case LPL-2026-0001 assigned to you", link: "#/case/c1", dedupeKey: `c1:assigned:${ISO}`, groupKey: "c1" });
    expect(fanout(prev, next, ctx("couns"))).toHaveLength(0);
  });
  it("a new pending gate notifies everyone holding gate.write except the actor and inactive users", () => {
    const rows = fanout(base(), { ...base(), gates: [gate()] }, ctx("couns"));
    expect(rows.map((r) => r.recipientId).sort()).toEqual(["admin", "tl"]);
    expect(rows[0]).toMatchObject({ type: "gate_submitted", priority: "high", title: "Gate 16 submitted on LPL-2026-0001", step: 16, link: "#/case/c1/step/16" });
    expect(recipientsHolding(users, defaultConfig(), "gate.write")).not.toContain("gone");
  });
  it("a resubmitted gate says so", () => {
    const rows = fanout(base(), { ...base(), gates: [gate({ id: "g2", round: 2 })] }, ctx("couns"));
    expect(rows[0].title).toBe("Gate 16 resubmitted on LPL-2026-0001");
  });
  it("a decided gate notifies the counsellor; returned is high priority", () => {
    const prev = { ...base(), gates: [gate()] };
    const next = { ...base(), gates: [gate({ status: "returned", decidedAt: ISO, decidedBy: "tl" })] };
    const rows = fanout(prev, next, ctx("tl"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientId: "couns", type: "gate_decided", priority: "high", title: "Gate 16 returned on LPL-2026-0001", dedupeKey: "c1:gate:g1:returned" });
  });
  it("a student upload notifies the counsellor; a counsellor upload notifies nobody", () => {
    const rows = fanout(base(), { ...base(), documents: [doc()] }, ctx("stu"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipientId: "couns", type: "document_uploaded", title: "Document uploaded on LPL-2026-0001", body: "passport", link: "#/case/c1/documents" });
    expect(displayTitle(rows[0], "counsellor")).toBe("Document uploaded on LPL-2026-0001: Passport (photo page)");
    expect(fanout(base(), { ...base(), documents: [doc({ uploadedBy: "couns" })] }, ctx("couns"))).toHaveLength(0);
  });
  it("a review notifies the student; a return is high priority", () => {
    const prev = { ...base(), documents: [doc()] };
    const next = { ...base(), documents: [doc({ status: "rejected", reviewNote: "blurry" })] };
    const rows = fanout(prev, next, ctx("couns"));
    expect(rows[0]).toMatchObject({ recipientId: "stu", type: "document_reviewed", priority: "high", title: "Document returned", body: "passport", link: "#/documents" });
    expect(displayTitle(rows[0], "student")).toBe("Document returned: Passport (photo page)");
  });
  it("profile submission notifies the counsellor", () => {
    const next: CaseRecord = { ...base(), steps: { ...base().steps, 2: { status: "pending", values: {}, studentSubmittedAt: "2026-09-12T09:00:00.000Z" } } };
    const rows = fanout(base(), next, ctx("stu"));
    expect(rows[0]).toMatchObject({ recipientId: "couns", type: "profile_submitted", title: "Profile submitted on LPL-2026-0001", step: 2, link: "#/case/c1/step/2" });
  });
  it("a step completed by staff notifies the student; one confirmed by the student notifies the counsellor", () => {
    const staffDone: CaseRecord = { ...base(), steps: { ...base().steps, 3: { status: "done", completedAt: ISO, completedBy: "couns", values: {} } } };
    const r1 = fanout(base(), staffDone, ctx("couns"));
    expect(r1[0]).toMatchObject({ recipientId: "stu", type: "step_completed", priority: "low", title: "Step 3 completed", link: "#/journey/step/3" });
    const stuDone: CaseRecord = { ...base(), steps: { ...base().steps, 26: { status: "done", completedAt: ISO, completedBy: "stu", values: {} } } };
    const r2 = fanout(base(), stuDone, ctx("stu"));
    expect(r2[0]).toMatchObject({ recipientId: "couns", title: "Step 26 confirmed by student on LPL-2026-0001", link: "#/case/c1/step/26" });
  });
  it("a status change notifies the student and the counsellor with the right priority", () => {
    const rows = fanout(base(), { ...base(), status: "hold", updatedAt: "2026-09-12T10:00:00.000Z" }, ctx("tl"));
    expect(rows.map((r) => r.recipientId).sort()).toEqual(["couns", "stu"]);
    expect(rows[0]).toMatchObject({ type: "status_changed", priority: "high", title: "Case LPL-2026-0001 on hold" });
    expect(new Set(rows.map((r) => r.dedupeKey)).size).toBe(2);
  });
  it("no change produces nothing and the same diff yields the same dedupe keys", () => {
    expect(fanout(base(), base(), ctx("admin"))).toEqual([]);
    const a = fanout(base(), { ...base(), gates: [gate()] }, ctx("couns")).map((r) => r.dedupeKey);
    const b = fanout(base(), { ...base(), gates: [gate()] }, ctx("couns")).map((r) => r.dedupeKey);
    expect(a).toEqual(b);
  });
});

describe("reminders and formatting", () => {
  it("deriveReminders lists my breached clocks first and ignores other counsellors", () => {
    const mine = blankCase({ id: "c1", counsellorId: "me", steps: { 1: { status: "done", values: {} }, 2: { status: "done", values: {} }, 3: { status: "done", completedAt: "2026-01-01T00:00:00.000Z", values: {} } } });
    const theirs = blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: "other", steps: mine.steps });
    const list = deriveReminders(deriveAll({ c1: mine, c2: theirs }, defaultConfig()).values(), "me");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ caseRef: "LPL-2026-0001", severity: "bad", step: 4, link: "#/case/c1/step/4" });
  });
  it("displayTitle uses student wording for students", () => {
    const n = { id: "n", recipientId: "stu", at: ISO, type: "step_completed" as const, priority: "low" as const, title: "Step 4 completed", step: 4 };
    expect(displayTitle(n, "student")).toBe("Course Information Sheet sent");
    expect(displayTitle(n, "counsellor")).toBe("Step 4 completed");
  });
  it("relativeTime is readable", () => {
    const now = Date.parse("2026-09-12T10:00:00.000Z");
    expect(relativeTime("2026-09-12T09:59:50.000Z", now)).toBe("just now");
    expect(relativeTime("2026-09-12T09:30:00.000Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-09-12T04:00:00.000Z", now)).toBe("6 h ago");
    expect(relativeTime("2026-09-10T10:00:00.000Z", now)).toBe("2 d ago");
  });
});

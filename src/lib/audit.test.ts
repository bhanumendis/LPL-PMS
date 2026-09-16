/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { diffChanges, EVENTS, RESTRICTED, type AuditEvent } from "./audit";

const c = { id: "c1", ref: "LPL-2026-0001" };
const u = { id: "u1", name: "Nimal Perera", email: "n@example.com", role: "counsellor" as const };

describe("typed audit events", () => {
  it("diffChanges skips equal values, treats blanks as equal and redacts sensitive fields", () => {
    const fields = [{ id: "name", label: "Name" }, { id: "phone", label: "Phone" }, { id: "maritalStatus", label: "Marital status", sensitive: true }, { id: "notes", label: "Notes" }];
    const out = diffChanges({ name: "A", phone: "1", maritalStatus: "Never married", notes: undefined }, { name: "A", phone: "2", maritalStatus: "Married", notes: "" }, fields);
    expect(out).toEqual([
      { field: "phone", label: "Phone", old: "1", new: "2" },
      { field: "maritalStatus", label: "Marital status", old: RESTRICTED, new: RESTRICTED },
    ]);
  });

  it("diffChanges caps the diff at 40 entries", () => {
    const fields = Array.from({ length: 50 }, (_, i) => ({ id: `f${i}`, label: `F${i}` }));
    const after = Object.fromEntries(fields.map((f) => [f.id, "x"]));
    expect(diffChanges({}, after, fields)).toHaveLength(40);
  });

  it("keeps the v4 action labels", () => {
    expect(EVENTS.caseAssigned(c, "Kasun").action).toBe("Case assigned");
    expect(EVENTS.caseAssigned(c, "Kasun", "Nimal").action).toBe("Case reassigned");
    expect(EVENTS.caseStatus(c, "hold").action).toBe("Place case on hold");
    expect(EVENTS.gateDecided(c, 16, false, "Bank letter missing", 2)).toMatchObject({ action: "Gate 16 returned", target: c.ref, detail: "Bank letter missing", summary: "Returned gate 16 (round 2)" });
    expect(EVENTS.stepCompleted(c, 3)).toMatchObject({ action: "Step 3 completed", entityType: "step", entityId: "c1:3" });
    expect(EVENTS.signInNotIssued("x@example.com", "boom").outcome).toBe("failure");
  });

  it("every builder returns an event type and an entity type", () => {
    const g = { gate: 16 as const };
    const all: AuditEvent[] = [
      EVENTS.caseOpened(c, "Walk-in"), EVENTS.caseAssigned(c, "A"), EVENTS.caseStatus(c, "exited", "x"), EVENTS.caseExported(c),
      EVENTS.stepCompleted(c, 1), EVENTS.stepNa(c, 1), EVENTS.stepReopened(c, 1), EVENTS.stepConfirmedByStudent(c, 1), EVENTS.profileSubmitted(c, []),
      EVENTS.gateSubmitted(c, g.gate), EVENTS.gateResubmitted(c, g.gate, "n"), EVENTS.gateDecided(c, g.gate, true),
      EVENTS.documentUploaded(c, "Passport", "p.pdf"), EVENTS.documentReviewed(c, "p.pdf", true), EVENTS.documentRemoved(c, "Passport", "p.pdf"),
      EVENTS.profileCreated(u), EVENTS.profileUpdated(u, []), EVENTS.signInIssued(u.email, "Counsellor"), EVENTS.signInNotIssued(u.email), EVENTS.temporaryPassword(u), EVENTS.accountActive(u, false), EVENTS.adminBootstrapped(u),
      EVENTS.permissionChanged("case.read", "counsellor", true), EVENTS.permissionsReset(), EVENTS.caseScopeChanged("counsellor", "assigned"),
      EVENTS.settingsUpdated(), EVENTS.backupExported(), EVENTS.backupRestored("b.json"), EVENTS.workspaceReset(), EVENTS.serverConnected("https://x"), EVENTS.serverDisconnected(),
      EVENTS.disposed(c, "basis"), EVENTS.legalHold(c, true, "r"), EVENTS.transferUpdated({ id: "t1", caseRef: c.ref, recipient: "Uni" }, "SCC"), EVENTS.registerExported(3), EVENTS.processorAdded({ name: "Host", country: "SG", safeguard: "DPA" }), EVENTS.processorRemoved("Host"),
      EVENTS.promptCreated({ id: "p1", title: "T" }), EVENTS.promptDuplicated({ id: "p2", title: "T2" }, "p1"), EVENTS.promptDeleted({ id: "p1", title: "T" }), EVENTS.promptSaved({ id: "p1", title: "T" }, 2), EVENTS.promptsExported([{ title: "T" }]), EVENTS.promptsImported("f.json", 2),
      EVENTS.sessionSignIn(u), EVENTS.sessionSignOut(u), EVENTS.signInFailed(u.email, "Invalid credentials"),
      EVENTS.overviewExported(), EVENTS.staffExported(), EVENTS.auditExported({ eventType: "gate" }, 4), EVENTS.notificationsRead(3),
    ];
    expect(all).toHaveLength(Object.keys(EVENTS).length);
    for (const e of all) {
      expect(e.action).toBeTruthy();
      expect(e.eventType).toBeTruthy();
      expect(e.entityType).toBeTruthy();
      expect(e.summary).toBeTruthy();
    }
  });
});

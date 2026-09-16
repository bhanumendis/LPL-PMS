/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { beforeEach, describe, expect, it } from "vitest";
import { filterAudit, store } from "./store";
import { EVENTS } from "./audit";
import { signInAs } from "@/test/session";
import type { AuditEntry, User } from "./types";

const c = { id: "c1", ref: "LPL-2026-0001" };
let me: User;

describe("audit store", () => {
  beforeEach(async () => { me = await signInAs("admin", { id: "adm", name: "Ada Admin" }); });

  it("store.audit records the structured columns, the actor and the browser session", async () => {
    await store.audit(EVENTS.caseOpened(c, "Walk-in"), me);
    const [row] = await store.auditPage({ limit: 5 });
    expect(row).toMatchObject({ action: "Case opened", eventType: "create", entityType: "case", entityId: "c1", actorId: "adm", actorName: "Ada Admin", source: "web", outcome: "success" });
    expect(row.sessionId).toBeTruthy();
  });

  it("auditPage filters by event type and pages with before; auditDetail returns the diff", async () => {
    await store.audit(EVENTS.caseOpened(c), me);
    await store.audit(EVENTS.gateDecided(c, 16, true, undefined, 1), me);
    await store.audit(EVENTS.caseAssigned(c, "Kasun", "Nimal"), me);
    const gates = await store.auditPage({ eventType: "gate" });
    expect(gates.map((r) => r.action)).toEqual(["Gate 16 approved"]);

    const all = await store.auditPage({ limit: 2 });
    expect(all).toHaveLength(2);
    const rest = await store.auditPage({ limit: 2, before: all[1].at });
    expect(rest.every((r) => r.at < all[1].at)).toBe(true);

    const assigned = (await store.auditPage({ q: "reassigned" }))[0];
    expect(assigned.hasChanges).toBe(true);
    expect(assigned.changes).toBeUndefined();
    const detail = await store.auditDetail(assigned.id);
    expect(detail?.changes).toEqual([{ field: "counsellorId", label: "Counsellor", old: "Nimal", new: "Kasun" }]);
  });

  it("the default window is the last 30 days", () => {
    const now = Date.parse("2026-09-12T00:00:00.000Z");
    const mk = (id: string, daysAgo: number): AuditEntry => ({ id, at: new Date(now - daysAgo * 86_400_000).toISOString(), actorId: "a", actorName: "A", actorRole: "admin", action: "x" });
    const rows = [mk("new", 1), mk("old", 40)];
    expect(filterAudit(rows, {}, now).map((r) => r.id)).toEqual(["new"]);
    expect(filterAudit(rows, { from: new Date(now - 60 * 86_400_000).toISOString() }, now).map((r) => r.id)).toEqual(["new", "old"]);
  });
});

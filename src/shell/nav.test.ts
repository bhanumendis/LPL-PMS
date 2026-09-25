/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { activeDestination, destinationsFor, moreDestination, pageTitle, type NavInput } from "./nav";
import { can as canFn, caseScopeOf } from "@/lib/rbac";
import { defaultConfig } from "@/lib/defaults";
import { user } from "@/test/fixtures";
import type { Permission, Role } from "@/lib/types";

function input(role: Role): NavInput {
  const config = defaultConfig();
  const u = user({ id: role, role });
  return { role, can: (p) => canFn(config, u, p), isSuperAdmin: role === "super_admin", seesAll: caseScopeOf(config, role) === "all" };
}

describe("destinationsFor", () => {
  it("counsellor: home, my caseload, approvals; nothing under more", () => {
    const { primary, more } = destinationsFor(input("counsellor"));
    expect(primary.map((d) => d.id)).toEqual(["home", "cases", "approvals"]);
    expect(primary[1].label).toBe("My caseload");
    expect(primary[0].label).toBe("Home");
    expect(more).toEqual([]);
  });
  it("team leader: people and governance grouped, no settings", () => {
    const { primary, more } = destinationsFor(input("team_leader"));
    expect(primary.map((d) => d.id)).toEqual(["home", "cases", "approvals", "escalations", "people", "governance"]);
    expect(primary[1].label).toBe("Cases");
    expect(primary.find((d) => d.id === "people")?.children).toBeUndefined(); // staff only
    expect(primary.find((d) => d.id === "governance")?.children?.map((c) => c.page)).toEqual(["dataprotection", "audit"]);
    expect(more).toEqual([]);
  });
  it("super admin: six primary destinations plus settings and prompts under more", () => {
    const { primary, more } = destinationsFor(input("super_admin"));
    expect(primary).toHaveLength(6);
    expect(more.map((m) => m.page)).toEqual(["settings", "prompts"]);
    expect(moreDestination(more)?.children?.map((c) => c.page)).toEqual(["settings", "prompts"]);
    expect(primary[0].shortcut).toBe("Alt+1");
  });
  it("admin (Placement Team): the same operational destinations, settings but never the Prompt Engineer", () => {
    const { primary, more } = destinationsFor(input("admin"));
    expect(primary.map((d) => d.id)).toEqual(["home", "cases", "approvals", "escalations", "people", "governance"]);
    expect(primary.find((d) => d.id === "people")?.children?.map((c) => c.page)).toEqual(["staff", "roles"]);
    expect(more.map((m) => m.page)).toEqual(["settings"]);
  });
  it("student: four destinations", () => {
    const { primary } = destinationsFor(input("student"));
    expect(primary.map((d) => d.label)).toEqual(["My placement", "Profile", "Documents", "Journey"]);
  });
  it("activeDestination maps case, roles and audit onto their groups", () => {
    const { primary } = destinationsFor(input("super_admin"));
    expect(activeDestination("case", primary)).toBe("cases");
    expect(activeDestination("roles", primary)).toBe("people");
    expect(activeDestination("audit", primary)).toBe("governance");
    expect(activeDestination("", primary)).toBe("home");
  });
  it("pageTitle follows role and scope", () => {
    expect(pageTitle("", input("counsellor"))).toBe("My dashboard");
    expect(pageTitle("cases", input("counsellor"))).toBe("My caseload");
    expect(pageTitle("", input("team_leader"))).toBe("Overview");
    expect(pageTitle("journey", input("student"))).toBe("Journey");
  });
});

/**
 * Every page a role may open must be reachable from visible navigation: a dock or tab-bar
 * destination, a More entry, or the section nav of a grouped destination. v5 hid Roles and
 * permissions and the Audit log behind the command palette because grouped children were
 * never rendered; this is the invariant that would have caught it.
 */
const PAGE_GATE: Record<string, Permission | "super"> = {
  cases: "case.view", approvals: "gate.view", escalations: "escalation.view", staff: "staff.read", roles: "role.view",
  dataprotection: "dataprotection.view", audit: "audit.view", settings: "settings.view", prompts: "super",
};

describe("every permitted page is reachable", () => {
  for (const role of ["super_admin", "admin", "team_leader", "counsellor"] as Role[]) {
    it(role, () => {
      const i = input(role);
      const { primary, more } = destinationsFor(i);
      const reachable = new Set<string>([
        ...primary.map((d) => d.page),
        ...primary.flatMap((d) => (d.children ?? []).map((c) => c.page)),
        ...more.map((m) => m.page),
      ]);
      for (const [page, gate] of Object.entries(PAGE_GATE)) {
        const allowed = gate === "super" ? i.isSuperAdmin : i.can(gate);
        if (allowed) expect(reachable, `${role} may open ${page}`).toContain(page);
      }
    });
  }
});

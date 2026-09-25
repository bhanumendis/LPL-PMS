/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import rbacSql from "../../supabase/migrations/20260925000200_v6_rbac.sql?raw";
import {
  DEFAULT_PERMISSIONS, PERMISSIONS, assignableRoles, canManageAccount, isGroupItEmail, isLocked, isReserved, migrateRbac, normalizeCaseScope,
  normalizePermissions, roleHas,
} from "./rbac";
import { defaultConfig } from "./defaults";
import { user } from "@/test/fixtures";
import type { OrgConfig, Permission, Role, User } from "./types";

/** permission_defaults rows as written in the migration: ('case.view', '{admin,team_leader}'). */
function sqlDefaults(): Record<string, string[]> {
  const block = rbacSql.slice(rbacSql.indexOf("insert into public.permission_defaults"), rbacSql.indexOf("on conflict (perm) do update"));
  const out: Record<string, string[]> = {};
  for (const m of block.matchAll(/\('([a-z]+\.[a-z]+)',\s*'\{([a-z_,]*)\}'\)/g)) out[m[1]] = m[2] ? m[2].split(",") : [];
  return out;
}

describe("the TypeScript matrix and the database agree", () => {
  it("cell for cell", () => {
    const sql = sqlDefaults();
    expect(Object.keys(sql).sort()).toEqual([...PERMISSIONS].sort());
    for (const p of PERMISSIONS) expect(sql[p].sort(), p).toEqual([...DEFAULT_PERMISSIONS[p]].sort());
  });
  it("on which cells are reserved for SUPER ADMIN", () => {
    const fn = rbacSql.slice(rbacSql.indexOf("create or replace function public.perm_is_locked"), rbacSql.indexOf("-- Standard model."));
    expect(fn).toContain("split_part(perm, '.', 1) in ('system', 'prompt') or perm = 'role.write'");
    const reserved = PERMISSIONS.filter(isReserved);
    expect(reserved).toEqual(PERMISSIONS.filter((p) => p.startsWith("system.") || p.startsWith("prompt.") || p === "role.write"));
    for (const p of reserved) expect(DEFAULT_PERMISSIONS[p], p).toEqual([]);
  });
  it("SUPER ADMIN is never listed in the standard model", () => {
    for (const p of PERMISSIONS) expect(DEFAULT_PERMISSIONS[p]).not.toContain("super_admin");
  });
});

describe("the role model", () => {
  const cfg = defaultConfig();
  it("SUPER ADMIN holds every cell and every cell is locked for it", () => {
    for (const p of PERMISSIONS) { expect(roleHas(cfg, p, "super_admin")).toBe(true); expect(isLocked(p, "super_admin")).toBe(true); }
  });
  it("ADMIN never holds system, security or prompt cells, even when configured", () => {
    const tampered: OrgConfig = { ...cfg, permissions: { ...cfg.permissions, "system.write": ["admin"], "role.write": ["admin"], "prompt.view": ["admin"] } as Record<Permission, Role[]> };
    for (const p of ["system.view", "system.write", "system.delete", "role.write", "prompt.view", "prompt.write"] as Permission[]) {
      expect(roleHas(tampered, p, "admin"), p).toBe(false);
    }
    for (const p of ["case.write", "assignment.write", "staff.write", "account.write", "settings.write", "dataprotection.write", "role.read"] as Permission[]) {
      expect(roleHas(cfg, p, "admin"), p).toBe(true);
    }
  });
  it("administrator accounts are managed by SUPER ADMIN only", () => {
    const sa = user({ id: "sa", role: "super_admin" }), ad = user({ id: "ad", role: "admin" }), c = user({ id: "c", role: "counsellor" });
    expect(canManageAccount(ad, sa)).toBe(false);
    expect(canManageAccount(ad, user({ id: "ad2", role: "admin" }))).toBe(false);
    expect(canManageAccount(ad, c)).toBe(true);
    expect(canManageAccount(sa, ad)).toBe(true);
    expect(canManageAccount({ ...sa, active: false }, c)).toBe(false);
    expect(assignableRoles(ad)).toEqual(["team_leader", "counsellor", "student"]);
    expect(assignableRoles(sa)).toContain("super_admin");
  });
  it("Group IT is a domain match, not a substring", () => {
    const d = ["lyceum.lk"];
    expect(isGroupItEmail("It.Person@Lyceum.lk", d)).toBe(true);
    expect(isGroupItEmail("x@notlyceum.lk", d)).toBe(false);
    expect(isGroupItEmail("x@lyceum.lk.evil.com", d)).toBe(false);
    expect(isGroupItEmail("lyceum.lk", d)).toBe(false);
  });
  it("the stored matrix never names SUPER ADMIN and never grants a reserved cell", () => {
    const n = normalizePermissions({ "case.read": ["super_admin", "admin", "ghost"], "system.write": ["admin"] });
    expect(n["case.read"]).toEqual(["admin"]);
    expect(n["system.write"]).toEqual([]);
    expect(normalizeCaseScope({ super_admin: "own", counsellor: "all" })).toMatchObject({ super_admin: "all", counsellor: "all", admin: "all" });
  });
});

describe("a v5 browser workspace moves to v6 as the database does", () => {
  it("the old administrator becomes SUPER ADMIN and the matrix gives ADMIN its standard cells", () => {
    const users: Record<string, User> = { o: user({ id: "o", role: "admin" as Role }), c: user({ id: "c", role: "counsellor" }) };
    const config = { ...defaultConfig(), rbacVersion: undefined, permissions: { "case.delete": ["admin", "team_leader"], "case.read": ["admin", "counsellor"] } as unknown as Record<Permission, Role[]> };
    migrateRbac(config, users);
    expect(users.o.role).toBe("super_admin");
    expect(users.c.role).toBe("counsellor");
    expect(config.permissions["case.delete"]).toEqual(["team_leader"]);
    expect(config.permissions["case.read"]).toEqual(["counsellor", "admin"]);
    expect(config.rbacVersion).toBe(6);
    // Idempotent: a second run changes nothing.
    users.n = user({ id: "n", role: "admin" });
    migrateRbac(config, users);
    expect(users.n.role).toBe("admin");
  });
});

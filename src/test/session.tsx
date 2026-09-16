/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Test helper: a signed-in session on the browser-storage backend.
 */
import { nowIso, store } from "@/lib/store";
import type { CaseRecord, Role, User } from "@/lib/types";

export async function signInAs(role: Role, over: Partial<User> = {}): Promise<User> {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = "#/";
  store.setCurrentUser(null);
  await store.resetAll();
  const u: User = { id: over.id ?? `u-${role}`, name: over.name ?? `${role} user`, email: over.email ?? `${role}@example.com`, passwordHash: "", role, active: true, createdAt: nowIso(), ...over };
  await store.mutateOrg((o) => { o.users[u.id] = u; o.config.setupComplete = true; return o; });
  sessionStorage.setItem("lpl:pms:session", u.id);
  return u;
}

export async function seedCases(cases: CaseRecord[]): Promise<void> {
  await store.mutateCases((s) => { for (const c of cases) s.cases[c.id] = c; return s; });
}

export async function addUser(u: User): Promise<void> {
  await store.mutateOrg((o) => { o.users[u.id] = u; return o; });
}

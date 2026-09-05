/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Role-based access control.
 *
 * The model is a matrix of resources × actions. Every protected resource exposes the same
 * five actions, and a role either holds a cell or does not:
 *
 *   view      the area or list is visible and can be navigated to
 *   read      the full record and its field values can be opened
 *   write     records can be created or changed
 *   delete    records can be removed, disposed of or reset
 *   download  data or files can be exported out of the system
 *
 * Case visibility is scoped in addition to the matrix (own / assigned / all), because a
 * counsellor who may read cases must still only read their own caseload.
 *
 * The Administrator is the system owner: it holds every cell, the cells cannot be removed,
 * and the Prompt Engineer Workspace cannot be granted to any other role. The database
 * mirrors both rules — see supabase/schema.sql, function app_can().
 */
import type { Action, CaseRecord, CaseScope, OrgConfig, Permission, Resource, Role, User } from "./types";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "admin", label: "Administrator", description: "System owner. Manages staff, sign-ins, roles, settings, data protection and every case in the group." },
  { id: "team_leader", label: "Team Leader", description: "Approval authority on the financial and visa file gates; sees every case, SLA escalations and team analytics." },
  { id: "counsellor", label: "Counsellor", description: "Owns assigned cases end to end and all client-facing counsel." },
  { id: "student", label: "Student", description: "Supplies details and documents on their own case." },
];

export const ROLE_LABEL: Record<Role, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.label])) as Record<Role, string>;

export const ACTION_LABEL: Record<Action, string> = { view: "View", read: "Read", write: "Write", delete: "Delete", download: "Download" };

export const ACTION_HELP: Record<Action, string> = {
  view: "See the area, list or summary",
  read: "Open the full record and its values",
  write: "Create or change records",
  delete: "Remove, dispose of or reset records",
  download: "Export data or files out of the system",
};

export interface ResourceDef {
  id: Resource;
  label: string;
  group: string;
  description: string;
  /** Actions that exist for this resource. Cells outside this list are not applicable. */
  actions: Action[];
  /** Notes shown beside a cell, keyed by action. */
  notes?: Partial<Record<Action, string>>;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  { id: "case", label: "Cases", group: "Cases", description: "Student case records and their process steps.", actions: ["view", "read", "write", "delete", "download"], notes: { write: "Open cases, record steps, hold, defer, exit and reopen", download: "Export a case record as JSON" } },
  { id: "sensitive", label: "Special-category fields", group: "Cases", description: "Health, family, marital and financial fields inside a case.", actions: ["view", "read", "write"], notes: { view: "See that the field exists, masked", read: "See the value" } },
  { id: "assignment", label: "Counsellor assignment", group: "Cases", description: "Which counsellor owns a case.", actions: ["view", "write"], notes: { view: "See who the counsellor is", write: "Assign or reassign" } },
  { id: "document", label: "Documents", group: "Documents", description: "Application and visa file uploads.", actions: ["view", "read", "write", "delete", "download"], notes: { view: "See the checklist and each document's status", read: "See file names, sizes and dates", write: "Upload a file (one at a time)", delete: "Remove an uploaded file record" } },
  { id: "review", label: "Document review", group: "Documents", description: "Accepting or returning an uploaded document.", actions: ["view", "write"], notes: { view: "See review outcomes and return reasons", write: "Accept or return a document" } },
  { id: "gate", label: "Team Leader gates", group: "Approvals", description: "Financial verification (step 16) and visa file (step 19) decisions.", actions: ["view", "read", "write"], notes: { view: "See the approvals queue and gate status", read: "Open a submission and its summary", write: "Approve or return a submitted gate" } },
  { id: "escalation", label: "SLA escalations", group: "Approvals", description: "Service level breaches and cases approaching a deadline.", actions: ["view", "read"], notes: { view: "See the escalation counts", read: "See which cases and students are affected" } },
  { id: "analytics", label: "Team analytics", group: "Reporting", description: "The team overview, funnel and caseload reporting.", actions: ["view", "read", "download"], notes: { view: "See the overview tiles", read: "See the funnel, charts and caseload table", download: "Export the overview as CSV" } },
  { id: "staff", label: "Staff profiles", group: "Administration", description: "Counsellor, Team Leader and administrator profiles.", actions: ["view", "read", "write", "delete", "download"], notes: { view: "See names for assignment and approvals", read: "See contact details and student accounts", download: "Export the staff list as CSV" } },
  { id: "account", label: "Sign-in accounts", group: "Administration", description: "Creating sign-ins, setting temporary passwords and deactivating access.", actions: ["write", "delete"], notes: { write: "Create a sign-in or set a temporary password", delete: "Deactivate or reactivate a sign-in" } },
  { id: "role", label: "Roles and permissions", group: "Administration", description: "This matrix.", actions: ["view", "read", "write"], notes: { view: "See the role summaries", read: "See the full matrix", write: "Change cells and case visibility" } },
  { id: "audit", label: "Audit log", group: "Administration", description: "The organisation-wide activity record.", actions: ["view", "read", "download"], notes: { view: "See the audit area", read: "See the entries", download: "Export CSV" } },
  { id: "settings", label: "Organisation settings", group: "Administration", description: "Service levels, reference lists, retention schedule and the server connection. Workspace backup and restore stay with the Administrator.", actions: ["view", "read", "write", "delete"], notes: { view: "See the settings area", read: "See the current values", write: "Change settings", delete: "Reset the workspace" } },
  { id: "dataprotection", label: "Data protection", group: "Data protection", description: "Retention schedule, transfer register and standing processors.", actions: ["view", "read", "write", "delete", "download"], notes: { view: "See the compliance tiles", read: "Open the registers", write: "Edit transfer records, processors, legal holds", delete: "Dispose of a record" } },
  { id: "prompt", label: "Prompt Engineer Workspace", group: "Administration", description: "Authoring and versioning of prompt templates. Administrator only; cannot be granted to other roles.", actions: ["view", "read", "write", "delete", "download"] },
];

export const RESOURCE_BY_ID: Record<Resource, ResourceDef> = Object.fromEntries(RESOURCE_DEFS.map((r) => [r.id, r])) as Record<Resource, ResourceDef>;

/** Every applicable permission cell, in matrix order. */
export const PERMISSIONS: Permission[] = RESOURCE_DEFS.flatMap((r) => r.actions.map((a) => `${r.id}.${a}` as Permission));

export function splitPermission(p: Permission): [Resource, Action] {
  const i = p.lastIndexOf(".");
  return [p.slice(0, i) as Resource, p.slice(i + 1) as Action];
}

export function permissionLabel(p: Permission): string {
  const [res, act] = splitPermission(p);
  return `${ACTION_LABEL[act]} · ${RESOURCE_BY_ID[res].label}`;
}

const A: Role[] = ["admin"];
const AT: Role[] = ["admin", "team_leader"];
const ATC: Role[] = ["admin", "team_leader", "counsellor"];
const ALL: Role[] = ["admin", "team_leader", "counsellor", "student"];

/**
 * The standard model. Administrator holds every cell. Students act only on their own case
 * (scope "own"), counsellors on assigned cases, Team Leaders and administrators on all.
 */
export const DEFAULT_PERMISSIONS: Record<Permission, Role[]> = {
  "case.view": ALL,
  "case.read": ALL,
  "case.write": ALL,
  "case.delete": A,
  "case.download": ATC,
  "sensitive.view": ALL,
  "sensitive.read": ATC,
  "sensitive.write": ALL,
  "assignment.view": ALL,
  "assignment.write": AT,
  "document.view": ALL,
  "document.read": ALL,
  "document.write": ["admin", "counsellor", "student"],
  "document.delete": A,
  "document.download": ALL,
  "review.view": ALL,
  "review.write": ATC,
  "gate.view": ATC,
  "gate.read": ATC,
  "gate.write": AT,
  "escalation.view": AT,
  "escalation.read": AT,
  "analytics.view": AT,
  "analytics.read": AT,
  "analytics.download": AT,
  "staff.view": ATC,
  "staff.read": AT,
  "staff.write": A,
  "staff.delete": A,
  "staff.download": A,
  "account.write": A,
  "account.delete": A,
  "role.view": A,
  "role.read": A,
  "role.write": A,
  "audit.view": AT,
  "audit.read": AT,
  "audit.download": A,
  "settings.view": A,
  "settings.read": A,
  "settings.write": A,
  "settings.delete": A,
  "dataprotection.view": AT,
  "dataprotection.read": AT,
  "dataprotection.write": AT,
  "dataprotection.delete": A,
  "dataprotection.download": AT,
  "prompt.view": A,
  "prompt.read": A,
  "prompt.write": A,
  "prompt.delete": A,
  "prompt.download": A,
};

export const DEFAULT_CASE_SCOPE: Record<Role, CaseScope> = { admin: "all", team_leader: "all", counsellor: "assigned", student: "own" };

export const CASE_SCOPE_LABEL: Record<CaseScope, string> = { none: "No cases", own: "Own case only", assigned: "Assigned caseload", all: "Every case" };

/** Cells that no configuration can change. */
export function isLocked(perm: Permission, role: Role): boolean {
  if (role === "admin") return true;
  return splitPermission(perm)[0] === "prompt";
}

/** True when the cell is held under the given configuration, applying the locked rules. */
export function roleHas(config: OrgConfig, perm: Permission, role: Role): boolean {
  if (role === "admin") return true;
  if (splitPermission(perm)[0] === "prompt") return false;
  const roles = config.permissions?.[perm] ?? DEFAULT_PERMISSIONS[perm] ?? [];
  return roles.includes(role);
}

export function can(config: OrgConfig, user: User | null, perm: Permission): boolean {
  if (!user || !user.active) return false;
  return roleHas(config, perm, user.role);
}

export function caseScopeOf(config: OrgConfig, role: Role): CaseScope {
  if (role === "admin") return "all";
  return config.caseScope?.[role] ?? DEFAULT_CASE_SCOPE[role];
}

/** Whether the case falls inside the user's visibility scope, independent of any action. */
export function inCaseScope(config: OrgConfig, user: User | null, c: CaseRecord): boolean {
  if (!user || !user.active) return false;
  switch (caseScopeOf(config, user.role)) {
    case "all": return true;
    case "assigned": return c.counsellorId === user.id;
    case "own": return c.studentUserId === user.id;
    default: return false;
  }
}

export function canReadCase(config: OrgConfig, user: User | null, c: CaseRecord): boolean {
  return can(config, user, "case.read") && inCaseScope(config, user, c);
}

/** Work a case: record steps, upload, submit gates. Requires write plus scope. */
export function canWorkCase(config: OrgConfig, user: User | null, c: CaseRecord): boolean {
  return can(config, user, "case.write") && inCaseScope(config, user, c);
}

/**
 * Brings a stored permission map up to the current matrix: unknown keys are dropped,
 * missing keys take the standard model, Administrator is always present, and the Prompt
 * Engineer Workspace is stripped from every other role.
 */
export function normalizePermissions(stored: unknown): Record<Permission, Role[]> {
  const src = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = {} as Record<Permission, Role[]>;
  for (const p of PERMISSIONS) {
    const raw = src[p];
    const roles = Array.isArray(raw) ? (raw.filter((r) => typeof r === "string" && ROLE_LABEL[r as Role]) as Role[]) : [...DEFAULT_PERMISSIONS[p]];
    const set = new Set<Role>(roles);
    set.add("admin");
    if (splitPermission(p)[0] === "prompt") { set.clear(); set.add("admin"); }
    out[p] = ROLES.map((r) => r.id).filter((r) => set.has(r));
  }
  return out;
}

export function normalizeCaseScope(stored: unknown): Record<Role, CaseScope> {
  const src = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_CASE_SCOPE };
  for (const r of ROLES) {
    const v = src[r.id];
    if (v === "none" || v === "own" || v === "assigned" || v === "all") out[r.id] = v;
  }
  out.admin = "all";
  return out;
}

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
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
 * Two administrator roles, least privilege between them:
 *   SUPER ADMIN  Group IT. The system owner: holds every cell, including the locked ones
 *                (system configuration, the matrix itself, the Prompt Engineer Workspace).
 *                Restricted to Group IT email domains; granted only by another SUPER ADMIN.
 *   ADMIN        Placement Team. Operational administration of cases, people and settings;
 *                never system or security functions, never administrator accounts.
 *
 * This file decides what the interface offers. The database decides what is allowed: every
 * rule here is mirrored, and enforced, in supabase/migrations (app_can, the guard triggers,
 * row-level security). src/lib/rbac-sql.test.ts checks the two matrices cell for cell.
 */
import type { Action, CaseRecord, CaseScope, OrgConfig, Permission, Resource, Role, User } from "./types";

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: "super_admin", label: "Super Admin", description: "Group IT. System owner: system configuration, security, the permission matrix, administrator accounts and every operational function. Restricted to Group IT email addresses." },
  { id: "admin", label: "Admin", description: "Placement Team administration: every case, assignment, documents, staff profiles and sign-ins for non-administrator roles, operational settings, data protection and reporting. No system or security functions." },
  { id: "team_leader", label: "Team Leader", description: "Approval authority on the financial and visa file gates; sees every case, SLA escalations and team analytics." },
  { id: "counsellor", label: "Counsellor", description: "Owns assigned cases end to end and all client-facing counsel." },
  { id: "student", label: "Student", description: "Supplies details and documents on their own case." },
];

export const ROLE_LABEL: Record<Role, string> = Object.fromEntries(ROLES.map((r) => [r.id, r.label])) as Record<Role, string>;

/** Roles whose accounts only a SUPER ADMIN may create, change, reset or deactivate. */
export const PRIVILEGED_ROLES: readonly Role[] = ["super_admin", "admin"];
export const isPrivileged = (r: Role): boolean => PRIVILEGED_ROLES.includes(r);

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
  { id: "staff", label: "Staff profiles", group: "People", description: "Staff and student profiles and their roles. Administrator accounts are managed by a Super Admin only.", actions: ["view", "read", "write", "delete", "download"], notes: { view: "See names for assignment and approvals", read: "See contact details and student accounts", write: "Create profiles and change roles (not administrator roles)", download: "Export the staff list as CSV" } },
  { id: "account", label: "Sign-in accounts", group: "People", description: "Creating sign-ins, setting temporary passwords and deactivating access. Administrator sign-ins are managed by a Super Admin only.", actions: ["write", "delete"], notes: { write: "Create a sign-in or set a temporary password", delete: "Deactivate or reactivate a sign-in" } },
  { id: "role", label: "Roles and permissions", group: "People", description: "This matrix and case visibility. Changing it is reserved for Super Admin.", actions: ["view", "read", "write"], notes: { view: "See the role summaries", read: "See the full matrix and who holds each role", write: "Change cells and case visibility" } },
  { id: "audit", label: "Audit log", group: "Governance", description: "The organisation-wide activity record.", actions: ["view", "read", "download"], notes: { view: "See the audit area", read: "See the entries", download: "Export CSV" } },
  { id: "dataprotection", label: "Data protection", group: "Governance", description: "Retention schedule, transfer register and standing processors.", actions: ["view", "read", "write", "delete", "download"], notes: { view: "See the compliance tiles", read: "Open the registers", write: "Edit transfer records, processors, legal holds", delete: "Dispose of a record" } },
  { id: "settings", label: "Operational settings", group: "Settings", description: "Organisation name, case reference prefix, service levels, retention schedule, enquiry channels and branches.", actions: ["view", "read", "write"], notes: { view: "See the settings area", read: "See the current values", write: "Change settings" } },
  { id: "system", label: "System configuration", group: "Settings", description: "Integrations (Web Push keys), the server connection and workspace maintenance. Reserved for Super Admin.", actions: ["view", "read", "write", "delete"], notes: { write: "Change integrations and the connection", delete: "Reset a browser-storage workspace" } },
  { id: "prompt", label: "Prompt Engineer Workspace", group: "Settings", description: "Authoring and versioning of prompt templates. Reserved for Super Admin.", actions: ["view", "read", "write", "delete", "download"] },
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

/** Cells that only SUPER ADMIN holds and no configuration can grant. Mirrors perm_is_locked(). */
export function isReserved(perm: Permission): boolean {
  const res = splitPermission(perm)[0];
  return res === "system" || res === "prompt" || perm === "role.write";
}

const A: Role[] = ["admin"];
const AT: Role[] = ["admin", "team_leader"];
const ATC: Role[] = ["admin", "team_leader", "counsellor"];
const ALL: Role[] = ["admin", "team_leader", "counsellor", "student"];
const NONE: Role[] = [];

/**
 * The standard model. SUPER ADMIN is implicit in every cell and never listed. Students act
 * only on their own case (scope "own"), counsellors on assigned cases, Team Leaders and both
 * administrator roles on all. Keep in step with permission_defaults in
 * supabase/migrations/20260925000200_v6_rbac.sql.
 */
export const DEFAULT_PERMISSIONS: Record<Permission, Role[]> = {
  "case.view": ALL,
  "case.read": ALL,
  "case.write": ALL,
  "case.delete": NONE,
  "case.download": ATC,
  "sensitive.view": ALL,
  "sensitive.read": ATC,
  "sensitive.write": ALL,
  "assignment.view": ALL,
  "assignment.write": AT,
  "document.view": ALL,
  "document.read": ALL,
  "document.write": ["admin", "counsellor", "student"],
  "document.delete": NONE,
  "document.download": ALL,
  "review.view": ALL,
  "review.write": ATC,
  "gate.view": ATC,
  "gate.read": ATC,
  "gate.write": ["team_leader"],
  "escalation.view": AT,
  "escalation.read": AT,
  "analytics.view": AT,
  "analytics.read": AT,
  "analytics.download": AT,
  "staff.view": ATC,
  "staff.read": AT,
  "staff.write": A,
  "staff.delete": NONE,
  "staff.download": A,
  "account.write": A,
  "account.delete": A,
  "role.view": A,
  "role.read": A,
  "role.write": NONE,
  "audit.view": AT,
  "audit.read": AT,
  "audit.download": NONE,
  "dataprotection.view": AT,
  "dataprotection.read": AT,
  "dataprotection.write": AT,
  "dataprotection.delete": NONE,
  "dataprotection.download": AT,
  "settings.view": A,
  "settings.read": A,
  "settings.write": A,
  "system.view": NONE,
  "system.read": NONE,
  "system.write": NONE,
  "system.delete": NONE,
  "prompt.view": NONE,
  "prompt.read": NONE,
  "prompt.write": NONE,
  "prompt.delete": NONE,
  "prompt.download": NONE,
};

export const DEFAULT_CASE_SCOPE: Record<Role, CaseScope> = { super_admin: "all", admin: "all", team_leader: "all", counsellor: "assigned", student: "own" };

export const CASE_SCOPE_LABEL: Record<CaseScope, string> = { none: "No cases", own: "Own case only", assigned: "Assigned caseload", all: "Every case" };

/** Cells that no configuration can change for this role. */
export function isLocked(perm: Permission, role: Role): boolean {
  return role === "super_admin" || isReserved(perm);
}

/** True when the cell is held under the given configuration, applying the locked rules. */
export function roleHas(config: OrgConfig, perm: Permission, role: Role): boolean {
  if (role === "super_admin") return true;
  if (isReserved(perm)) return false;
  const roles = config.permissions?.[perm] ?? DEFAULT_PERMISSIONS[perm] ?? [];
  return roles.includes(role);
}

export function can(config: OrgConfig, user: User | null, perm: Permission): boolean {
  if (!user || !user.active) return false;
  return roleHas(config, perm, user.role);
}

export function caseScopeOf(config: OrgConfig, role: Role): CaseScope {
  if (role === "super_admin") return "all";
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
 * Whether `actor` may manage `target`'s profile, role, sign-in or activation at all. Mirrors
 * can_manage_account() and the profile guards: administrator accounts belong to SUPER ADMIN,
 * and nobody manages their own role or activation.
 */
export function canManageAccount(actor: User | null, target: Pick<User, "id" | "role">): boolean {
  if (!actor || !actor.active) return false;
  if (isPrivileged(target.role)) return actor.role === "super_admin";
  return true;
}

/** The roles `actor` may give to someone else's account. */
export function assignableRoles(actor: User | null): Role[] {
  if (!actor || !actor.active) return [];
  return actor.role === "super_admin" ? ["super_admin", "admin", "team_leader", "counsellor", "student"] : ["team_leader", "counsellor", "student"];
}

/** Group IT domains that may hold SUPER ADMIN; the database holds the list, this is the check. */
export function isGroupItEmail(email: string, domains: readonly string[]): boolean {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  return d !== "" && domains.includes(d);
}

/** Configured roles in the stored matrix; SUPER ADMIN is implicit and never stored. */
const STORABLE: Role[] = ["admin", "team_leader", "counsellor", "student"];

/**
 * Brings a stored permission map up to the current matrix: unknown keys are dropped, missing
 * keys take the standard model, SUPER ADMIN is never stored (it holds everything), and
 * reserved cells are empty for everyone else.
 */
export function normalizePermissions(stored: unknown): Record<Permission, Role[]> {
  const src = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = {} as Record<Permission, Role[]>;
  for (const p of PERMISSIONS) {
    const raw = src[p];
    const roles = Array.isArray(raw) ? (raw.filter((r) => typeof r === "string") as Role[]) : [...DEFAULT_PERMISSIONS[p]];
    out[p] = isReserved(p) ? [] : STORABLE.filter((r) => roles.includes(r));
  }
  return out;
}

export function normalizeCaseScope(stored: unknown): Record<Role, CaseScope> {
  const src = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_CASE_SCOPE };
  for (const r of STORABLE) {
    const v = src[r];
    if (v === "none" || v === "own" || v === "assigned" || v === "all") out[r] = v;
  }
  out.super_admin = "all";
  return out;
}

/**
 * Browser-storage workspaces saved before v6 knew one all-powerful "admin". They are moved to
 * the v6 model exactly as the database migration moves a server: that account becomes SUPER
 * ADMIN, and the stored matrix drops the old owner and gives ADMIN its standard cells.
 */
export const RBAC_VERSION = 6;
export function migrateRbac(config: OrgConfig & { rbacVersion?: number }, users: Record<string, User>): void {
  if ((config.rbacVersion ?? 0) >= RBAC_VERSION) return;
  for (const u of Object.values(users)) if ((u.role as string) === "admin") u.role = "super_admin";
  const stored = config.permissions as unknown as Record<string, unknown> | undefined;
  if (stored && typeof stored === "object") {
    const next: Record<string, Role[]> = {};
    for (const p of PERMISSIONS) {
      const raw = stored[p];
      if (!Array.isArray(raw)) continue;
      const kept = (raw as string[]).filter((r) => r !== "admin" && r !== "super_admin") as Role[];
      next[p] = DEFAULT_PERMISSIONS[p].includes("admin") ? [...kept, "admin"] : kept;
    }
    config.permissions = next as Record<Permission, Role[]>;
  }
  config.rbacVersion = RBAC_VERSION;
}

/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Typed audit events. Every builder keeps the v4 `action` label, `target` and `detail` so
 * exports and history stay continuous, and adds the structured columns the explorer filters
 * on: event type, entity, summary and, for updates, a field-level diff.
 */
import { ROLE_LABEL } from "./rbac";
import { STEP_BY_N } from "./spine";
import type { CaseStatus, Role } from "./types";

export type AuditEventType = "create" | "update" | "delete" | "login" | "logout" | "permission" | "auth" | "notification" | "file" | "case" | "gate" | "document" | "system" | "export";
export type EntityType = "case" | "step" | "gate" | "document" | "user" | "account" | "role" | "settings" | "dataprotection" | "prompt" | "session" | "transfer" | "processor" | "workspace" | "notification";
export type AuditOutcome = "success" | "failure";

export interface Change { field: string; label: string; old: unknown; new: unknown }

export interface AuditEvent {
  action: string;
  eventType: AuditEventType;
  entityType: EntityType;
  entityId?: string;
  entityLabel?: string;
  target?: string;
  detail?: string;
  outcome?: AuditOutcome;
  summary?: string;
  changes?: Change[];
  meta?: Record<string, unknown>;
}

export const EVENT_TYPE_LABEL: Record<AuditEventType, string> = {
  create: "Created", update: "Updated", delete: "Deleted", login: "Sign-in", logout: "Sign-out", permission: "Permissions", auth: "Access",
  notification: "Notifications", file: "Files", case: "Case status", gate: "Gates", document: "Documents", system: "System", export: "Exports",
};

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  case: "Case", step: "Step", gate: "Gate", document: "Document", user: "Profile", account: "Account", role: "Role", settings: "Settings",
  dataprotection: "Data protection", prompt: "Prompt template", session: "Session", transfer: "Transfer", processor: "Processor", workspace: "Workspace", notification: "Notification",
};

/** Shown in place of a special-category value; the explorer renders it as a chip. */
export const RESTRICTED = "[restricted]";
const MAX_CHANGES = 40;

const same = (a: unknown, b: unknown): boolean => {
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  if (blank(a) && blank(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};

/** Field-level diff over a whitelist. Equal values are skipped; sensitive values are redacted; at most 40 entries. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>, fields: { id: string; label: string; sensitive?: boolean }[]): Change[] {
  const out: Change[] = [];
  for (const f of fields) {
    if (out.length >= MAX_CHANGES) break;
    const o = before[f.id];
    const n = after[f.id];
    if (same(o, n)) continue;
    out.push({ field: f.id, label: f.label, old: f.sensitive ? RESTRICTED : o ?? null, new: f.sensitive ? RESTRICTED : n ?? null });
  }
  return out;
}

type CaseLike = { id: string; ref: string };
type UserLike = { id: string; name: string; email: string; role: Role };
type PromptLike = { id: string; title: string };

const onCase = (c: CaseLike): Pick<AuditEvent, "entityType" | "entityId" | "entityLabel" | "target"> => ({ entityType: "case", entityId: c.id, entityLabel: c.ref, target: c.ref });
const stepTitle = (n: number) => STEP_BY_N[n]?.title ?? `Step ${n}`;

const STATUS_ACTION: Record<CaseStatus, string> = { open: "Reopen case", hold: "Place case on hold", deferred: "Defer intake", exited: "Exit case", completed: "Complete" };
const STATUS_SUMMARY: Record<CaseStatus, string> = { open: "Reopened the case", hold: "Placed the case on hold", deferred: "Deferred the intake", exited: "Exited the case", completed: "Completed the case" };

export const EVENTS = {
  // cases
  caseOpened: (c: CaseLike, source?: string): AuditEvent => ({ action: "Case opened", eventType: "create", ...onCase(c), detail: source, summary: `Opened case ${c.ref}` }),
  caseAssigned: (c: CaseLike, toName: string, fromName?: string): AuditEvent => ({
    action: fromName ? "Case reassigned" : "Case assigned", eventType: "update", ...onCase(c), detail: toName,
    summary: fromName ? `Reassigned from ${fromName} to ${toName}` : `Assigned to ${toName}`,
    changes: [{ field: "counsellorId", label: "Counsellor", old: fromName ?? null, new: toName }],
  }),
  caseStatus: (c: CaseLike, status: CaseStatus, detail?: string): AuditEvent => ({ action: STATUS_ACTION[status], eventType: "case", ...onCase(c), detail, summary: STATUS_SUMMARY[status], meta: { status } }),
  caseExported: (c: CaseLike): AuditEvent => ({ action: "Case exported", eventType: "export", ...onCase(c), summary: "Exported the case record" }),

  // steps
  stepCompleted: (c: CaseLike, n: number): AuditEvent => ({ action: `Step ${n} completed`, eventType: "update", entityType: "step", entityId: `${c.id}:${n}`, entityLabel: `${c.ref} · step ${n}`, target: c.ref, detail: stepTitle(n), summary: `Completed step ${n}, ${stepTitle(n)}`, meta: { step: n } }),
  stepNa: (c: CaseLike, n: number): AuditEvent => ({ action: `Step ${n} marked not applicable`, eventType: "update", entityType: "step", entityId: `${c.id}:${n}`, entityLabel: `${c.ref} · step ${n}`, target: c.ref, detail: stepTitle(n), summary: `Marked step ${n} not applicable`, meta: { step: n } }),
  stepReopened: (c: CaseLike, n: number): AuditEvent => ({ action: `Step ${n} reopened`, eventType: "update", entityType: "step", entityId: `${c.id}:${n}`, entityLabel: `${c.ref} · step ${n}`, target: c.ref, detail: stepTitle(n), summary: `Reopened step ${n}`, meta: { step: n } }),
  stepConfirmedByStudent: (c: CaseLike, n: number): AuditEvent => ({ action: `Step ${n} confirmed by student`, eventType: "update", entityType: "step", entityId: `${c.id}:${n}`, entityLabel: `${c.ref} · step ${n}`, target: c.ref, detail: stepTitle(n), summary: `Student confirmed step ${n}`, meta: { step: n } }),
  profileSubmitted: (c: CaseLike, changes: Change[] = []): AuditEvent => ({ action: "Profile submitted", eventType: "update", entityType: "step", entityId: `${c.id}:2`, entityLabel: `${c.ref} · step 2`, target: c.ref, summary: "Updated student profile", changes: changes.length ? changes : undefined, meta: { step: 2 } }),

  // gates
  gateSubmitted: (c: CaseLike, gate: 16 | 19, round?: number): AuditEvent => ({ action: `Gate ${gate} submitted`, eventType: "gate", entityType: "gate", entityId: `${c.id}:${gate}`, entityLabel: `${c.ref} · gate ${gate}`, target: c.ref, detail: stepTitle(gate), summary: `Submitted gate ${gate}${round ? ` (round ${round})` : ""}`, meta: { gate, round } }),
  gateResubmitted: (c: CaseLike, gate: 16 | 19, note: string, round?: number): AuditEvent => ({ action: `Gate ${gate} resubmitted`, eventType: "gate", entityType: "gate", entityId: `${c.id}:${gate}`, entityLabel: `${c.ref} · gate ${gate}`, target: c.ref, detail: note, summary: `Resubmitted gate ${gate}${round ? ` (round ${round})` : ""}`, meta: { gate, round } }),
  gateDecided: (c: CaseLike, gate: 16 | 19, approved: boolean, note?: string, round?: number): AuditEvent => ({
    action: `Gate ${gate} ${approved ? "approved" : "returned"}`, eventType: "gate", entityType: "gate", entityId: `${c.id}:${gate}`, entityLabel: `${c.ref} · gate ${gate}`, target: c.ref, detail: note || undefined,
    summary: `${approved ? "Approved" : "Returned"} gate ${gate}${round ? ` (round ${round})` : ""}`, meta: { gate, round, approved },
  }),

  // documents
  documentUploaded: (c: CaseLike, kindLabel: string, fileName: string): AuditEvent => ({ action: "Document uploaded", eventType: "document", entityType: "document", entityId: c.id, entityLabel: `${c.ref} · ${kindLabel}`, target: c.ref, detail: `${kindLabel} — ${fileName}`, summary: `Uploaded ${kindLabel}`, meta: { fileName } }),
  documentReviewed: (c: CaseLike, fileName: string, accepted: boolean, note?: string): AuditEvent => ({ action: accepted ? "Document accepted" : "Document returned", eventType: "document", entityType: "document", entityId: c.id, entityLabel: c.ref, target: c.ref, detail: fileName, summary: `${accepted ? "Accepted" : "Returned"} ${fileName}`, meta: note ? { fileName, note } : { fileName } }),
  documentRemoved: (c: CaseLike, kindLabel: string, fileName: string): AuditEvent => ({ action: "Document removed", eventType: "delete", entityType: "document", entityId: c.id, entityLabel: `${c.ref} · ${kindLabel}`, target: c.ref, detail: `${kindLabel} — ${fileName}`, summary: `Removed ${kindLabel}`, meta: { fileName } }),

  // people and accounts
  profileCreated: (u: UserLike): AuditEvent => ({ action: "Profile created", eventType: "create", entityType: "user", entityId: u.id, entityLabel: u.name, target: u.email, detail: ROLE_LABEL[u.role], summary: `Created ${ROLE_LABEL[u.role]} profile for ${u.name}` }),
  profileUpdated: (u: UserLike, changes: Change[]): AuditEvent => ({ action: "Profile updated", eventType: "update", entityType: "user", entityId: u.id, entityLabel: u.name, target: u.email, summary: `Updated ${changes.length} field${changes.length === 1 ? "" : "s"} on ${u.name}`, changes }),
  signInIssued: (email: string, roleLabel: string): AuditEvent => ({ action: "Sign-in issued", eventType: "auth", entityType: "account", entityLabel: email, target: email, detail: roleLabel, summary: `Issued a ${roleLabel} sign-in` }),
  signInNotIssued: (email: string, error?: string): AuditEvent => ({ action: "Sign-in not issued", eventType: "auth", entityType: "account", entityLabel: email, target: email, detail: error, outcome: "failure", summary: "Sign-in could not be issued" }),
  temporaryPassword: (u: Pick<UserLike, "id" | "name" | "email">): AuditEvent => ({ action: "Temporary password set", eventType: "auth", entityType: "account", entityId: u.id, entityLabel: u.name, target: u.email, summary: `Set a temporary password for ${u.name}` }),
  accountActive: (u: Pick<UserLike, "id" | "name" | "email">, active: boolean, detail?: string): AuditEvent => ({
    action: active ? "Account reactivated" : "Account deactivated", eventType: "update", entityType: "account", entityId: u.id, entityLabel: u.name, target: u.email, detail,
    summary: `${active ? "Reactivated" : "Deactivated"} ${u.name}`, changes: [{ field: "active", label: "Active", old: !active, new: active }],
  }),
  roleAssigned: (u: Pick<UserLike, "id" | "name" | "email">, from: string, to: string): AuditEvent => ({ action: "Role changed", eventType: "permission", entityType: "user", entityId: u.id, entityLabel: u.name, target: u.email, summary: `Changed ${u.name}'s role from ${from} to ${to}`, changes: [{ field: "role", label: "Role", old: from, new: to }] }),
  adminBootstrapped: (u: Pick<UserLike, "id" | "name" | "email">): AuditEvent => ({ action: "Super Admin account created", eventType: "create", entityType: "account", entityId: u.id, entityLabel: u.name, target: u.email, summary: "Created the first administrator" }),

  // roles
  permissionChanged: (perm: string, role: string, granted: boolean): AuditEvent => ({
    action: granted ? "Permission granted" : "Permission removed", eventType: "permission", entityType: "role", entityId: role, entityLabel: ROLE_LABEL[role as Role] ?? role, target: `${role} · ${perm}`,
    summary: `${granted ? "Granted" : "Removed"} ${perm} ${granted ? "to" : "from"} ${ROLE_LABEL[role as Role] ?? role}`, changes: [{ field: perm, label: perm, old: !granted, new: granted }],
  }),
  permissionsReset: (): AuditEvent => ({ action: "Permissions reset to default", eventType: "permission", entityType: "role", summary: "Restored the standard permission model" }),
  caseScopeChanged: (role: string, scope: string, from?: string): AuditEvent => ({
    action: "Case scope changed", eventType: "permission", entityType: "role", entityId: role, entityLabel: ROLE_LABEL[role as Role] ?? role, target: `${role} · ${scope}`,
    summary: `Set ${ROLE_LABEL[role as Role] ?? role} case scope to ${scope}`, changes: [{ field: "caseScope", label: "Case scope", old: from ?? null, new: scope }],
  }),

  // settings and workspace
  settingsUpdated: (changes: Change[] = []): AuditEvent => ({ action: "Settings updated", eventType: "update", entityType: "settings", summary: changes.length ? `Updated ${changes.length} setting${changes.length === 1 ? "" : "s"}` : "Saved settings", changes: changes.length ? changes : undefined }),
  backupExported: (): AuditEvent => ({ action: "Workspace backup exported", eventType: "export", entityType: "workspace", summary: "Exported a workspace backup" }),
  backupRestored: (fileName: string, counts?: Record<string, number>): AuditEvent => ({ action: "Workspace restored from backup", eventType: "system", entityType: "workspace", target: fileName, summary: `Restored the workspace from ${fileName}`, meta: counts }),
  workspaceReset: (): AuditEvent => ({ action: "Workspace reset", eventType: "system", entityType: "workspace", summary: "Reset the workspace" }),
  serverConnected: (url: string): AuditEvent => ({ action: "Server connected", eventType: "system", entityType: "workspace", target: url, summary: `Connected to ${url}` }),
  serverDisconnected: (): AuditEvent => ({ action: "Server disconnected", eventType: "system", entityType: "workspace", summary: "Disconnected from the server" }),

  // data protection
  disposed: (c: CaseLike, basis: string): AuditEvent => ({ action: "Case record disposed", eventType: "delete", entityType: "dataprotection", entityId: c.id, entityLabel: c.ref, target: c.ref, detail: basis, summary: "Destroyed personal data under the retention schedule" }),
  legalHold: (c: CaseLike, placed: boolean, reason?: string): AuditEvent => ({ action: placed ? "Legal hold placed" : "Legal hold lifted", eventType: "update", entityType: "dataprotection", entityId: c.id, entityLabel: c.ref, target: c.ref, detail: placed ? reason : undefined, summary: placed ? "Placed a legal hold" : "Lifted the legal hold" }),
  transferUpdated: (t: { id: string; caseRef: string; recipient: string }, safeguard: string, changes: Change[] = []): AuditEvent => ({ action: "Transfer record updated", eventType: "update", entityType: "transfer", entityId: t.id, entityLabel: `${t.caseRef} · ${t.recipient}`, target: t.caseRef, detail: `${t.recipient} — ${safeguard}`, summary: `Updated the transfer to ${t.recipient}`, changes: changes.length ? changes : undefined }),
  registerExported: (n: number): AuditEvent => ({ action: "Transfer register exported", eventType: "export", entityType: "transfer", detail: `${n} records`, summary: `Exported ${n} transfer record${n === 1 ? "" : "s"}` }),
  processorAdded: (p: { name: string; country: string; safeguard: string }): AuditEvent => ({ action: "Standing processor added", eventType: "create", entityType: "processor", entityLabel: p.name, target: p.name, detail: `${p.country} — ${p.safeguard}`, summary: `Added processor ${p.name}` }),
  processorRemoved: (name: string): AuditEvent => ({ action: "Standing processor removed", eventType: "delete", entityType: "processor", entityLabel: name, target: name, summary: `Removed processor ${name}` }),

  // prompt templates
  promptCreated: (p: PromptLike): AuditEvent => ({ action: "Prompt template created", eventType: "create", entityType: "prompt", entityId: p.id, entityLabel: p.title, target: p.title, detail: p.id, summary: `Created ${p.title}` }),
  promptDuplicated: (p: PromptLike, fromId: string): AuditEvent => ({ action: "Prompt template duplicated", eventType: "create", entityType: "prompt", entityId: p.id, entityLabel: p.title, target: p.title, detail: `from ${fromId}`, summary: `Duplicated into ${p.title}`, meta: { fromId } }),
  promptDeleted: (p: PromptLike): AuditEvent => ({ action: "Prompt template deleted", eventType: "delete", entityType: "prompt", entityId: p.id, entityLabel: p.title, target: p.title, detail: p.id, summary: `Deleted ${p.title}` }),
  promptSaved: (p: PromptLike, version: number): AuditEvent => ({ action: "Prompt template saved", eventType: "update", entityType: "prompt", entityId: p.id, entityLabel: p.title, target: p.title, detail: `v${version}`, summary: `Saved version ${version} of ${p.title}`, meta: { version } }),
  promptsExported: (items: { title: string }[]): AuditEvent => ({ action: "Prompt templates exported", eventType: "export", entityType: "prompt", target: items.length === 1 ? items[0].title : `${items.length} templates`, summary: `Exported ${items.length} template${items.length === 1 ? "" : "s"}` }),
  promptsImported: (fileName: string, n: number): AuditEvent => ({ action: "Prompt templates imported", eventType: "create", entityType: "prompt", target: fileName, detail: `${n} template${n === 1 ? "" : "s"}`, summary: `Imported ${n} template${n === 1 ? "" : "s"}` }),

  // sessions
  sessionSignIn: (u: Pick<UserLike, "id" | "name" | "email">): AuditEvent => ({ action: "Signed in", eventType: "login", entityType: "session", entityId: u.id, entityLabel: u.name, target: u.email, summary: `${u.name} signed in` }),
  sessionSignOut: (u: Pick<UserLike, "id" | "name" | "email">): AuditEvent => ({ action: "Signed out", eventType: "logout", entityType: "session", entityId: u.id, entityLabel: u.name, target: u.email, summary: `${u.name} signed out` }),
  signInFailed: (email: string, reason: string): AuditEvent => ({ action: "Sign-in failed", eventType: "login", entityType: "session", entityLabel: email, target: email, detail: reason, outcome: "failure", summary: "Sign-in attempt failed" }),

  // exports and notifications
  overviewExported: (): AuditEvent => ({ action: "Overview exported", eventType: "export", entityType: "case", summary: "Exported the overview" }),
  staffExported: (): AuditEvent => ({ action: "Staff list exported", eventType: "export", entityType: "user", summary: "Exported the staff list" }),
  auditExported: (filters: Record<string, unknown>, n: number): AuditEvent => ({ action: "Audit log exported", eventType: "export", entityType: "workspace", detail: `${n} entries`, summary: `Exported ${n} audit entr${n === 1 ? "y" : "ies"}`, meta: { filters } }),
  notificationsRead: (n: number): AuditEvent => ({ action: "Notifications marked read", eventType: "notification", entityType: "notification", detail: `${n}`, summary: `Marked ${n} notification${n === 1 ? "" : "s"} read` }),
};

/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
export type Role = "admin" | "team_leader" | "counsellor" | "student";

/**
 * Enterprise RBAC. Every protected resource exposes the same five actions and a role
 * either holds a cell or does not. See rbac.ts for the matrix and the meaning of each
 * action; supabase/schema.sql mirrors the same cells in row-level security.
 */
export const RESOURCES = [
  "case", "sensitive", "assignment", "document", "review", "gate", "escalation", "analytics",
  "staff", "account", "role", "audit", "settings", "dataprotection", "prompt",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["view", "read", "write", "delete", "download"] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * The applicable cells of the matrix. Resources that expose fewer than five actions are
 * narrowed here so that a permission string is always a real cell.
 */
export type Permission =
  | `case.${Action}`
  | "sensitive.view" | "sensitive.read" | "sensitive.write"
  | "assignment.view" | "assignment.write"
  | `document.${Action}`
  | "review.view" | "review.write"
  | "gate.view" | "gate.read" | "gate.write"
  | "escalation.view" | "escalation.read"
  | "analytics.view" | "analytics.read" | "analytics.download"
  | `staff.${Action}`
  | "account.write" | "account.delete"
  | "role.view" | "role.read" | "role.write"
  | "audit.view" | "audit.read" | "audit.download"
  | "settings.view" | "settings.read" | "settings.write" | "settings.delete"
  | `dataprotection.${Action}`
  | `prompt.${Action}`;

/** How far a role's case visibility reaches. Applied on top of `case.view` / `case.read`. */
export type CaseScope = "none" | "own" | "assigned" | "all";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  branch?: string;
  role: Role;
  /** Browser-storage mode only. Empty when an identity provider holds the password. */
  passwordHash: string;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  lastSignInAt?: string;
}

export type StepStatus = "pending" | "done" | "na";

export interface StepState {
  status: StepStatus;
  values: Record<string, unknown>;
  completedAt?: string;
  completedBy?: string;
  studentSubmittedAt?: string;
}

export type DocStatus = "uploaded" | "accepted" | "rejected";

export interface DocItem {
  id: string;
  step: 10 | 15;
  kind: string;
  fileName: string;
  size: number;
  mime: string;
  uploadedAt: string;
  uploadedBy: string;
  status: DocStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** Set when the file body is held by a storage backend; absent for metadata-only records. */
  url?: string;
}

export type GateStatus = "pending" | "approved" | "returned";

export interface GateSubmission {
  id: string;
  gate: 16 | 19;
  round: number;
  submittedAt: string;
  submittedBy: string;
  status: GateStatus;
  decidedAt?: string;
  decidedBy?: string;
  suggestions?: string;
  addressedAt?: string;
  addressedNote?: string;
}

/**
 * Cross-border transfer register (PDPA Part III accountability).
 * One record per disclosure of personal data to a recipient outside Sri Lanka.
 */
export type RecipientType = "platform" | "partner_agent" | "university" | "authority" | "processor";

export interface TransferRecord {
  id: string;
  at: string;
  by: string;
  byName: string;
  step: number;
  recipient: string;
  recipientType: RecipientType;
  /** Partner agents only: whether the agent was on the approved list at the time of transfer. */
  recipientApproved?: boolean;
  country: string;
  dataCategories: string[];
  lawfulBasis: string;
  safeguard: string;
  note?: string;
}

/** A standing processor holds data continuously rather than at one step (hosting, email, storage). */
export interface StandingProcessor {
  id: string;
  name: string;
  purpose: string;
  country: string;
  dataCategories: string[];
  safeguard: string;
  agreementRef?: string;
  addedAt: string;
}

export interface RetentionPolicy {
  /** Months after exit before an unsuccessful case is disposed of. */
  exitedMonths: number;
  /** Months after completion before a placed student's case is disposed of. */
  completedMonths: number;
  /** Months of inactivity before a held or deferred case is treated as dormant. */
  dormantMonths: number;
  /** Days of warning before the disposal date, used to populate the "due soon" queue. */
  warnDays: number;
}

/** Disposal anonymises rather than deletes: the case shell survives for reporting, the person does not. */
export interface Disposal {
  at: string;
  by: string;
  byName: string;
  basis: string;
}

/** Suppresses disposal while a case is under legal or regulatory hold. */
export interface LegalHold {
  at: string;
  by: string;
  byName: string;
  reason: string;
}

export type CaseStatus = "open" | "hold" | "deferred" | "exited" | "completed";

export interface CaseEvent {
  id: string;
  at: string;
  by: string;
  byName: string;
  type: string;
  text: string;
  step?: number;
}

export interface CaseExit {
  code: string;
  reason: string;
  step: number;
  stage: string;
  at: string;
  by: string;
}

export interface CaseRecord {
  id: string;
  ref: string;
  studentUserId?: string;
  student: { name: string; email: string; phone: string };
  counsellorId?: string;
  assignedAt?: string;
  assignedBy?: string;
  status: CaseStatus;
  hold?: { country?: string; intake?: string; programme?: string; reviewDate?: string; note?: string };
  exit?: CaseExit;
  steps: Record<number, StepState>;
  documents: DocItem[];
  gates: GateSubmission[];
  events: CaseEvent[];
  /** Optional so that workspaces saved before the register existed still parse. */
  transfers?: TransferRecord[];
  disposal?: Disposal;
  legalHold?: LegalHold;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface OrgConfig {
  setupComplete: boolean;
  orgName: string;
  entityCode: string;
  permissions: Record<Permission, Role[]>;
  /** Optional so that workspaces saved before scoping was configurable still parse; read via caseScopeOf(). */
  caseScope?: Record<Role, CaseScope>;
  sla: { cisDays: number; offerReminderDays: number; followUpMonths: number };
  /** Optional so that workspaces saved before the policy existed still parse; read via retentionPolicy(). */
  retention?: RetentionPolicy;
  processors?: StandingProcessor[];
  channels: string[];
  branches: string[];
  caseCounter: number;
  rev: number;
}

export interface OrgState {
  config: OrgConfig;
  users: Record<string, User>;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: string;
  target?: string;
  detail?: string;
}

export interface AuditState {
  entries: AuditEntry[];
  rev: number;
}

export interface CasesState {
  cases: Record<string, CaseRecord>;
  rev: number;
}

// ---------------------------------------------------------------------------
// Prompt Engineer Workspace (Administrator only)
// ---------------------------------------------------------------------------

export type PromptStatus = "draft" | "review" | "approved" | "retired";

export interface PromptVersion {
  version: number;
  at: string;
  by: string;
  byName: string;
  body: string;
  note?: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  /** Free-text target model identifier; suggestions are offered in the editor. */
  model: string;
  temperature: number;
  maxTokens: number;
  tags: string[];
  status: PromptStatus;
  /** The current system prompt body. `{{variable}}` placeholders are detected automatically. */
  body: string;
  /** Sample values used by the preview compiler, keyed by variable name. */
  sampleInputs: Record<string, string>;
  version: number;
  history: PromptVersion[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PromptsState {
  prompts: Record<string, PromptTemplate>;
  rev: number;
}

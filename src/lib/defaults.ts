/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Empty-workspace shapes. Kept apart from store.ts so that the server adapter can build
 * the same defaults without importing the store back. There is no sample or seed data
 * anywhere in the build: a new workspace starts empty and stays empty until staff enter
 * real records.
 */
import type { AuditState, CasesState, OrgConfig, OrgState, PromptsState, RetentionPolicy } from "./types";
import { DEFAULT_CASE_SCOPE, DEFAULT_PERMISSIONS, normalizeCaseScope, normalizePermissions } from "./rbac";
import { CHANNELS } from "./spine";

/**
 * Retention schedule. Unsuccessful cases go early; placed students are held for seven
 * years against commercial and tax records; dormant holds are swept on inactivity.
 * LPL Operations should confirm these against Group Legal before go-live.
 */
export const DEFAULT_RETENTION: RetentionPolicy = { exitedMonths: 24, completedMonths: 84, dormantMonths: 18, warnDays: 30 };

/** Minimum length for any password set through the application. */
export const MIN_PASSWORD_LENGTH = 10;

export function defaultConfig(): OrgConfig {
  return {
    setupComplete: false,
    orgName: "Lyceum Placements (Private) Limited",
    entityCode: "LPL",
    permissions: { ...DEFAULT_PERMISSIONS },
    caseScope: { ...DEFAULT_CASE_SCOPE },
    sla: { cisDays: 7, offerReminderDays: 21, followUpMonths: 3 },
    retention: { ...DEFAULT_RETENTION },
    processors: [],
    channels: [...CHANNELS],
    branches: ["Colombo"],
    caseCounter: 0,
    rev: 0,
  };
}

/** Brings a stored configuration up to the current shape without losing anything the administrator set. */
export function normalizeConfig(raw: Partial<OrgConfig> | null | undefined): OrgConfig {
  const base = defaultConfig();
  const cfg: OrgConfig = { ...base, ...(raw ?? {}) };
  cfg.permissions = normalizePermissions(raw?.permissions);
  cfg.caseScope = normalizeCaseScope(raw?.caseScope);
  cfg.sla = { ...base.sla, ...(raw?.sla ?? {}) };
  cfg.retention = { ...DEFAULT_RETENTION, ...(raw?.retention ?? {}) };
  cfg.processors = Array.isArray(raw?.processors) ? raw.processors : [];
  cfg.channels = Array.isArray(raw?.channels) && raw.channels.length ? raw.channels : [...CHANNELS];
  cfg.branches = Array.isArray(raw?.branches) && raw.branches.length ? raw.branches : ["Colombo"];
  return cfg;
}

export function defaultOrg(): OrgState { return { config: defaultConfig(), users: {} }; }
export function defaultCases(): CasesState { return { cases: {}, rev: 0 }; }
export function defaultAudit(): AuditState { return { entries: [], rev: 0 }; }
export function defaultPrompts(): PromptsState { return { prompts: {}, rev: 0 }; }

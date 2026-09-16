/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Notification model. Rows are written by the database (triggers) on a server, or by the
 * reference fan-out in browser-storage mode; the client only reads and marks them.
 */
export type NotificationType =
  | "gate_submitted" | "gate_decided" | "document_uploaded" | "document_reviewed" | "profile_submitted"
  | "step_completed" | "case_assigned" | "status_changed" | "sla_due" | "sla_breached" | "account" | "system";

export type Priority = "low" | "normal" | "high";

export interface NotificationRow {
  id: string;
  recipientId: string;
  at: string;
  type: NotificationType;
  priority: Priority;
  title: string;
  body?: string;
  caseId?: string;
  caseRef?: string;
  step?: number;
  /** Hash route to open, e.g. "#/case/{id}/step/16". */
  link?: string;
  /** Rows sharing a group key are shown together (the case id). */
  groupKey?: string;
  /** One row per event per recipient, whichever path produced it. */
  dedupeKey?: string;
  readAt?: string;
}

export interface NotificationState { unread: number; latest: string | null }

/** A live reminder derived from the caller's own caseload; not stored, clears when resolved. */
export interface Reminder {
  id: string;
  caseId: string;
  caseRef: string;
  name: string;
  label: string;
  days: number;
  severity: "warn" | "bad";
  step: number;
  link: string;
}

export const TYPE_LABEL: Record<NotificationType, string> = {
  gate_submitted: "Gate submitted", gate_decided: "Gate decided", document_uploaded: "Document uploaded", document_reviewed: "Document reviewed",
  profile_submitted: "Profile submitted", step_completed: "Step completed", case_assigned: "Case assigned", status_changed: "Status changed",
  sla_due: "Deadline approaching", sla_breached: "Deadline passed", account: "Account", system: "System",
};

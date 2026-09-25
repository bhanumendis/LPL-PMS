/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Reference fan-out: which notifications one case change produces, for whom. Used directly
 * in browser-storage mode and mirrored by notify_case_change() in supabase/schema.sql. The
 * actor never receives a notification about their own action.
 */
import { DEFAULT_PERMISSIONS } from "@/lib/rbac";
import { STEP_BY_N } from "@/lib/spine";
import type { CaseRecord, OrgConfig, Permission, Role, User } from "@/lib/types";
import type { NotificationRow } from "./types";

export interface FanoutContext { actorId: string; users: Record<string, User>; config: OrgConfig; now: string }

const STATUS_WORD: Record<string, string> = { open: "reopened", hold: "on hold", deferred: "deferred", exited: "exited", completed: "completed" };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "n-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function rolesHolding(config: OrgConfig, perm: Permission): Role[] {
  const roles = config.permissions?.[perm] ?? DEFAULT_PERMISSIONS[perm] ?? [];
  return Array.from(new Set<Role>([...roles, "super_admin"]));
}

export function recipientsHolding(users: Record<string, User>, config: OrgConfig, perm: Permission): string[] {
  const roles = rolesHolding(config, perm);
  return Object.values(users).filter((u) => u.active && roles.includes(u.role)).map((u) => u.id);
}

/** Checklist label for a document kind id ("passport" → "Passport (photo page)"). */
export function kindLabel(step: number | undefined, kind: string | undefined): string {
  if (!kind) return "";
  return (step ? STEP_BY_N[step]?.docs?.find((d) => d.id === kind)?.label : undefined) ?? kind;
}

type Draft = Omit<NotificationRow, "id" | "recipientId" | "at" | "groupKey">;

export function fanout(prev: CaseRecord | null, next: CaseRecord, ctx: FanoutContext): NotificationRow[] {
  const rows: NotificationRow[] = [];
  const add = (recipient: string | undefined, d: Draft) => {
    if (!recipient || recipient === ctx.actorId) return;
    rows.push({ id: newId(), recipientId: recipient, at: ctx.now, groupKey: next.id, ...d });
  };
  const ref = next.ref, cid = next.id, couns = next.counsellorId, student = next.studentUserId;

  // Assignment (also on creation).
  if (couns && couns !== prev?.counsellorId) {
    add(couns, { type: "case_assigned", priority: "normal", title: `Case ${ref} assigned to you`, caseId: cid, caseRef: ref, link: `#/case/${cid}`, dedupeKey: `${cid}:assigned:${next.assignedAt ?? ctx.now}` });
  }
  if (!prev) return rows;

  // Gates.
  const oldGates = new Map(prev.gates.map((g) => [g.id, g]));
  for (const g of next.gates) {
    const o = oldGates.get(g.id);
    if (!o && g.status === "pending") {
      for (const r of recipientsHolding(ctx.users, ctx.config, "gate.write")) {
        add(r, { type: "gate_submitted", priority: "high", title: `Gate ${g.gate} ${g.round > 1 ? "resubmitted" : "submitted"} on ${ref}`, caseId: cid, caseRef: ref, step: g.gate, link: `#/case/${cid}/step/${g.gate}`, dedupeKey: `${cid}:gate:${g.id}:pending:${r}` });
      }
    } else if (o && o.status === "pending" && (g.status === "approved" || g.status === "returned")) {
      add(couns, { type: "gate_decided", priority: g.status === "returned" ? "high" : "normal", title: `Gate ${g.gate} ${g.status} on ${ref}`, caseId: cid, caseRef: ref, step: g.gate, link: `#/case/${cid}/step/${g.gate}`, dedupeKey: `${cid}:gate:${g.id}:${g.status}` });
    }
  }

  // Documents. The kind id travels in `body`; the client renders the checklist label.
  const oldDocs = new Map(prev.documents.map((d) => [d.id, d]));
  for (const d of next.documents) {
    const o = oldDocs.get(d.id);
    if (!o) {
      if (d.uploadedBy !== couns) add(couns, { type: "document_uploaded", priority: "normal", title: `Document uploaded on ${ref}`, body: d.kind, caseId: cid, caseRef: ref, step: d.step, link: `#/case/${cid}/documents`, dedupeKey: `${cid}:doc:${d.id}:uploaded` });
    } else if (o.status === "uploaded" && (d.status === "accepted" || d.status === "rejected")) {
      add(student, { type: "document_reviewed", priority: d.status === "rejected" ? "high" : "normal", title: d.status === "rejected" ? "Document returned" : "Document accepted", body: d.kind, caseId: cid, caseRef: ref, step: d.step, link: "#/documents", dedupeKey: `${cid}:doc:${d.id}:${d.status}` });
    }
  }

  // Profile submitted by the student.
  const ps = next.steps[2]?.studentSubmittedAt;
  if (ps && ps !== prev.steps[2]?.studentSubmittedAt && next.steps[2]?.status !== "done") {
    add(couns, { type: "profile_submitted", priority: "normal", title: `Profile submitted on ${ref}`, caseId: cid, caseRef: ref, step: 2, link: `#/case/${cid}/step/2`, dedupeKey: `${cid}:profile:${ps}` });
  }

  // Steps completed.
  for (const [k, st] of Object.entries(next.steps)) {
    const n = Number(k);
    const ost = prev.steps[n];
    if (st.status !== "done" || ost?.status === "done") continue;
    const key = `${cid}:step:${n}:done:${st.completedAt ?? ""}`;
    if (student && st.completedBy === student) {
      add(couns, { type: "step_completed", priority: "normal", title: `Step ${n} confirmed by student on ${ref}`, caseId: cid, caseRef: ref, step: n, link: `#/case/${cid}/step/${n}`, dedupeKey: key });
    } else {
      add(student, { type: "step_completed", priority: "low", title: `Step ${n} completed`, caseId: cid, caseRef: ref, step: n, link: `#/journey/step/${n}`, dedupeKey: key });
    }
  }

  // Status.
  if (next.status !== prev.status) {
    const priority = next.status === "exited" || next.status === "hold" ? "high" : "normal";
    const title = `Case ${ref} ${STATUS_WORD[next.status] ?? next.status}`;
    add(student, { type: "status_changed", priority, title, caseId: cid, caseRef: ref, link: "#/", dedupeKey: `${cid}:status:${next.status}:${next.updatedAt}:s` });
    add(couns, { type: "status_changed", priority, title, caseId: cid, caseRef: ref, link: `#/case/${cid}`, dedupeKey: `${cid}:status:${next.status}:${next.updatedAt}:c` });
  }

  return rows;
}

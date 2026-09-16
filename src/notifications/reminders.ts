/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Reminders come from the three service-level clocks and returned gates on the caller's own
 * open cases. They are computed live, never stored, and disappear once resolved.
 */
import type { CaseSignals } from "@/lib/signals";
import { STEP_BY_N } from "@/lib/spine";
import type { Role } from "@/lib/types";
import type { NotificationRow, Reminder } from "./types";
import { kindLabel } from "./fanout";

export function deriveReminders(signals: Iterable<CaseSignals>, mineId: string): Reminder[] {
  const out: Reminder[] = [];
  for (const s of signals) {
    if (s.status !== "open" || s.counsellorId !== mineId) continue;
    for (const f of s.flags) {
      if (f.state === "ok") continue;
      out.push({ id: `${s.id}:${f.id}`, caseId: s.id, caseRef: s.ref, name: s.name, label: f.label, days: f.days, severity: f.state === "breached" ? "bad" : "warn", step: f.step, link: `#/case/${s.id}/step/${f.step}` });
    }
    if (s.gateReturned) {
      out.push({ id: `${s.id}:gate:${s.gateReturned}`, caseId: s.id, caseRef: s.ref, name: s.name, label: `Gate ${s.gateReturned} returned with suggestions`, days: 0, severity: "bad", step: s.gateReturned, link: `#/case/${s.id}/step/${s.gateReturned}` });
    }
  }
  out.sort((a, b) => (a.severity === b.severity ? a.days - b.days : a.severity === "bad" ? -1 : 1));
  return out;
}

/** Students read step notifications in their own wording; document rows show the checklist label. */
export function displayTitle(n: NotificationRow, viewerRole: Role): string {
  if (n.type === "step_completed" && n.step && viewerRole === "student") {
    const t = STEP_BY_N[n.step]?.studentTitle;
    if (t) return t;
  }
  if ((n.type === "document_uploaded" || n.type === "document_reviewed") && n.body) return `${n.title}: ${kindLabel(n.step, n.body)}`;
  return n.title;
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.round((now - d) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function dayBucket(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  const yesterday = new Date(now - 86400000);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

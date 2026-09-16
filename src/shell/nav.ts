/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The navigation model. Destinations are declared once and rendered by the dock, the mobile
 * tab bar, the command palette and the document title. Routes are unchanged from v4.
 */
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, FolderOpen, ShieldCheck, AlarmClock, Users, Landmark, MoreHorizontal, House, UserRound, FileText, Route } from "lucide-react";
import type { Permission, Role } from "@/lib/types";
import type { Badges } from "@/lib/signals";

export type DestId = "home" | "cases" | "approvals" | "escalations" | "people" | "governance" | "more" | "profile" | "documents" | "journey";

export interface DestinationChild { id: string; label: string; page: string }

export interface Destination {
  id: DestId;
  label: string;
  icon: LucideIcon;
  /** Route page to open. */
  page: string;
  /** Every route page that counts as "inside" this destination. */
  pages: string[];
  badge?: (b: Badges) => number | undefined;
  shortcut?: string;
  children?: DestinationChild[];
}

export interface NavInput {
  role: Role;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  /** Case scope is "all" (Team Leader, Administrator). */
  seesAll: boolean;
  /** Case scope is "none": the cases destination is hidden. */
  noCases?: boolean;
}

const TITLES: Record<string, string> = {
  overview: "Overview", cases: "Cases", approvals: "Approvals", escalations: "Escalations", staff: "Staff", roles: "Roles and permissions",
  audit: "Audit log", dataprotection: "Data protection", settings: "Settings", prompts: "Prompt Engineer Workspace", case: "Case",
  profile: "Profile", documents: "Documents", journey: "Journey",
};

export function destinationsFor(i: NavInput): { primary: Destination[]; more: Destination[] } {
  if (i.role === "student") {
    const primary: Destination[] = [
      { id: "home", label: "My placement", icon: House, page: "home", pages: ["home", ""] },
      { id: "profile", label: "Profile", icon: UserRound, page: "profile", pages: ["profile"] },
      { id: "documents", label: "Documents", icon: FileText, page: "documents", pages: ["documents"] },
      { id: "journey", label: "Journey", icon: Route, page: "journey", pages: ["journey"] },
    ];
    return { primary: withShortcuts(primary), more: [] };
  }

  const primary: Destination[] = [];
  primary.push({ id: "home", label: i.can("analytics.view") ? "Overview" : "Home", icon: LayoutGrid, page: "overview", pages: ["overview", "home", ""] });
  if (i.can("case.view") && !i.noCases) {
    primary.push(i.seesAll
      ? { id: "cases", label: "Cases", icon: FolderOpen, page: "cases", pages: ["cases", "case"], badge: (b) => b.unassigned || undefined }
      : { id: "cases", label: "My caseload", icon: FolderOpen, page: "cases", pages: ["cases", "case"], badge: (b) => b.toReview || undefined });
  }
  if (i.can("gate.view")) primary.push({ id: "approvals", label: "Approvals", icon: ShieldCheck, page: "approvals", pages: ["approvals"], badge: (b) => b.pendingGates || undefined });
  if (i.can("escalation.view")) primary.push({ id: "escalations", label: "Escalations", icon: AlarmClock, page: "escalations", pages: ["escalations"], badge: (b) => b.breaches || undefined });

  const people: DestinationChild[] = [];
  if (i.can("staff.read")) people.push({ id: "staff", label: "Staff", page: "staff" });
  if (i.can("role.view")) people.push({ id: "roles", label: "Roles and permissions", page: "roles" });
  if (people.length) primary.push({ id: "people", label: "People", icon: Users, page: people[0].page, pages: people.map((p) => p.page), children: people.length > 1 ? people : undefined });

  const gov: DestinationChild[] = [];
  if (i.can("dataprotection.view")) gov.push({ id: "dataprotection", label: "Data protection", page: "dataprotection" });
  if (i.can("audit.view")) gov.push({ id: "audit", label: "Audit log", page: "audit" });
  if (gov.length) primary.push({ id: "governance", label: "Governance", icon: Landmark, page: gov[0].page, pages: gov.map((p) => p.page), children: gov.length > 1 ? gov : undefined, badge: (b) => (i.can("dataprotection.view") ? b.retentionOverdue || undefined : undefined) });

  const more: Destination[] = [];
  if (i.can("settings.view")) more.push({ id: "more", label: "Settings", icon: MoreHorizontal, page: "settings", pages: ["settings"] });
  if (i.isAdmin) more.push({ id: "more", label: "Prompt Engineer", icon: MoreHorizontal, page: "prompts", pages: ["prompts"] });

  return { primary: withShortcuts(primary), more };
}

function withShortcuts(list: Destination[]): Destination[] {
  return list.map((d, n) => (n < 9 ? { ...d, shortcut: `Alt+${n + 1}` } : d));
}

/** Which destination is active for a route page; "case" belongs to cases, "" and "home" to home. */
export function activeDestination(page: string, dests: Destination[]): DestId | undefined {
  const p = page === "" ? "home" : page;
  return dests.find((d) => d.pages.includes(p) || (p === "home" && d.id === "home"))?.id;
}

/** The "More" pages as one destination for the dock and tab bar. */
export function moreDestination(more: Destination[]): Destination | null {
  if (!more.length) return null;
  return { id: "more", label: "More", icon: MoreHorizontal, page: more[0].page, pages: more.flatMap((m) => m.pages), children: more.map((m) => ({ id: m.page, label: m.label, page: m.page })) };
}

export function pageTitle(page: string, i: NavInput): string {
  const p = page === "" ? "home" : page;
  if (i.role === "student") return p === "home" ? "My placement" : TITLES[p] ?? "My placement";
  if (p === "home" || p === "overview") return i.can("analytics.view") ? "Overview" : "My dashboard";
  if (p === "cases") return i.seesAll ? "Cases" : "My caseload";
  return TITLES[p] ?? (i.can("analytics.view") ? "Overview" : "My dashboard");
}

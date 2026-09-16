/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Route → page. Every permission check that gated a page in v4 is kept here, unchanged.
 */
import type { ReactNode } from "react";
import type { Route, SessionCtx } from "@/App";
import { EmptyState } from "@/lib/ui";
import { Overview } from "@/views/home/Overview";
import { StudentHome } from "@/views/home/StudentHome";
import { ProfilePage } from "@/views/student/ProfilePage";
import { DocumentsPage } from "@/views/student/DocumentsPage";
import { JourneyPage } from "@/views/student/JourneyPage";
import { CasesPage } from "@/views/staff/Cases";
import { StaffPage } from "@/views/staff/Staff";
import { RolesPage } from "@/views/staff/Roles";
import { AuditExplorer } from "@/views/staff/AuditExplorer";
import { SettingsPage } from "@/views/staff/Settings";
import { DataProtectionPage } from "@/views/staff/DataProtection";
import { ApprovalsPage, EscalationsPage } from "@/views/staff/Approvals";
import { PromptEngineerPage } from "@/views/staff/PromptEngineer";
import { CaseWorkspace } from "@/views/CaseWorkspace";

export function Denied({ reason }: { reason?: string }) {
  return <div className="panel"><div className="panel-b"><h2>Not permitted</h2><p className="muted mt1">{reason ?? "Your role does not include access to this area."}</p></div></div>;
}

export function renderPage(route: Route, s: SessionCtx): ReactNode {
  const { user, can, isAdmin, cases } = s;
  if (!user) return null;
  const page = route.page === "home" ? "" : route.page;

  if (user.role === "student") {
    const c = Object.values(cases).find((x) => x.studentUserId === user.id);
    if (!c) return <EmptyState glyph="students" title="No application is linked to this account" reason="Contact Lyceum Placements to have your case linked to your sign-in." />;
    switch (page) {
      case "profile": return <ProfilePage c={c} />;
      case "documents": return <DocumentsPage c={c} />;
      case "journey": return <JourneyPage c={c} />;
      default: return <StudentHome c={c} />;
    }
  }

  const current = page || "overview";
  switch (current) {
    case "overview": return <Overview />;
    case "cases": return can("case.view") ? <CasesPage /> : <Denied />;
    case "approvals": return can("gate.view") ? <ApprovalsPage /> : <Denied />;
    case "escalations": return can("escalation.view") ? <EscalationsPage /> : <Denied />;
    case "staff": return can("staff.read") ? <StaffPage /> : <Denied />;
    case "roles": return can("role.view") ? <RolesPage /> : <Denied />;
    case "dataprotection": return can("dataprotection.view") ? <DataProtectionPage /> : <Denied />;
    case "audit": return can("audit.view") ? <AuditExplorer /> : <Denied />;
    case "settings": return can("settings.view") ? <SettingsPage /> : <Denied />;
    case "prompts": return isAdmin ? <PromptEngineerPage /> : <Denied reason="The Prompt Engineer Workspace is available to the Administrator only." />;
    case "case": return route.caseId ? <CaseWorkspace key={route.caseId} caseId={route.caseId} /> : <CasesPage />;
    default: return can("case.view") ? <CasesPage /> : <Overview />;
  }
}

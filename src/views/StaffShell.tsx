/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useEffect, useRef, useState } from "react";
import { LayoutGrid, FolderOpen, ShieldCheck, AlarmClock, Users, KeyRound, ScrollText, Settings, ShieldAlert, LogOut, Menu, X, Wand2 } from "lucide-react";
import { useSession, Wordmark, LiveBadge, Copyright, ThemeToggle, useDocumentTitle } from "@/App";
import { ROLE_LABEL, caseScopeOf } from "@/lib/rbac";
import { Avatar } from "@/lib/ui";
import { Overview } from "@/views/staff/Overview";
import { CasesPage } from "@/views/staff/Cases";
import { StaffPage } from "@/views/staff/Staff";
import { RolesPage } from "@/views/staff/Roles";
import { AuditPage } from "@/views/staff/Audit";
import { SettingsPage } from "@/views/staff/Settings";
import { DataProtectionPage } from "@/views/staff/DataProtection";
import { ApprovalsPage, EscalationsPage } from "@/views/staff/Approvals";
import { PromptEngineerPage } from "@/views/staff/PromptEngineer";
import { CaseWorkspace } from "@/views/CaseWorkspace";
import { slaFlags, latestGate, pendingReviewCount, retentionState } from "@/lib/logic";

interface NavItem { id: string; label: string; icon: React.ReactNode; badge?: number; /** Section label printed above the item. */ sep?: string }

const TITLES: Record<string, string> = { overview: "Overview", cases: "Cases", approvals: "Approvals", escalations: "Escalations", staff: "Staff", roles: "Roles and permissions", audit: "Audit log", dataprotection: "Data protection", settings: "Settings", prompts: "Prompt Engineer Workspace", case: "Case" };

export function StaffShell() {
  const { user, can, isAdmin, route, go, signOut, cases, snap } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const page = route.page === "home" ? "" : route.page;
  const seesAll = !!user && caseScopeOf(snap.org.config, user.role) === "all";
  const overviewTitle = can("analytics.view") ? "Overview" : "My dashboard";
  const titleOf = (p: string) => (p === "overview" || p === "" ? overviewTitle : p === "cases" && !seesAll ? "My caseload" : TITLES[p] ?? overviewTitle);
  useDocumentTitle(titleOf(page));
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); menuRef.current?.focus(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);
  if (!user) return null;

  const allCases = Object.values(cases);
  const mine = seesAll ? allCases : allCases.filter((c) => c.counsellorId === user.id);
  const pendingGates = allCases.filter((c) => c.status === "open" && ([16, 19] as const).some((g) => latestGate(c, g)?.status === "pending")).length;
  const breaches = allCases.reduce((n, c) => n + slaFlags(c, snap.org.config).filter((f) => f.state === "breached").length, 0);
  const unassigned = allCases.filter((c) => !c.counsellorId && c.status === "open").length;
  const toReview = mine.reduce((n, c) => n + pendingReviewCount(c), 0);
  const retentionOverdue = can("dataprotection.view") ? allCases.filter((c) => retentionState(c, snap.org.config) === "overdue").length : 0;

  const nav: NavItem[] = [];
  nav.push({ id: "overview", label: overviewTitle, icon: <LayoutGrid aria-hidden /> });
  if (can("case.view") && caseScopeOf(snap.org.config, user.role) !== "none") {
    if (seesAll) nav.push({ id: "cases", label: "Cases", icon: <FolderOpen aria-hidden />, badge: unassigned || undefined });
    else nav.push({ id: "cases", label: "My caseload", icon: <FolderOpen aria-hidden />, badge: toReview || undefined });
  }
  if (can("gate.view")) nav.push({ id: "approvals", label: "Approvals", icon: <ShieldCheck aria-hidden />, badge: pendingGates || undefined });
  if (can("escalation.view")) nav.push({ id: "escalations", label: "Escalations", icon: <AlarmClock aria-hidden />, badge: breaches || undefined });
  if (can("staff.read")) nav.push({ id: "staff", label: "Staff", icon: <Users aria-hidden /> });
  if (can("role.view")) nav.push({ id: "roles", label: "Roles and permissions", icon: <KeyRound aria-hidden /> });
  if (can("dataprotection.view")) nav.push({ id: "dataprotection", label: "Data protection", icon: <ShieldAlert aria-hidden />, badge: retentionOverdue || undefined });
  if (can("audit.view")) nav.push({ id: "audit", label: "Audit log", icon: <ScrollText aria-hidden /> });
  if (can("settings.view")) nav.push({ id: "settings", label: "Settings", icon: <Settings aria-hidden /> });
  if (isAdmin) nav.push({ id: "prompts", label: "Prompt Engineer", icon: <Wand2 aria-hidden />, sep: "Administrator" });

  const home = nav[0]?.id ?? "overview";
  const current = page || home;
  const active = current === "case" ? "cases" : current;

  let content: React.ReactNode;
  switch (current) {
    case "overview": content = <Overview />; break;
    case "cases": content = can("case.view") ? <CasesPage /> : <Denied />; break;
    case "approvals": content = can("gate.view") ? <ApprovalsPage /> : <Denied />; break;
    case "escalations": content = can("escalation.view") ? <EscalationsPage /> : <Denied />; break;
    case "staff": content = can("staff.read") ? <StaffPage /> : <Denied />; break;
    case "roles": content = can("role.view") ? <RolesPage /> : <Denied />; break;
    case "dataprotection": content = can("dataprotection.view") ? <DataProtectionPage /> : <Denied />; break;
    case "audit": content = can("audit.view") ? <AuditPage /> : <Denied />; break;
    case "settings": content = can("settings.view") ? <SettingsPage /> : <Denied />; break;
    case "prompts": content = isAdmin ? <PromptEngineerPage /> : <Denied />; break;
    case "case": content = route.caseId ? <CaseWorkspace key={route.caseId} caseId={route.caseId} /> : <CasesPage />; break;
    default: content = can("case.view") ? <CasesPage /> : <Overview />;
  }

  const NavList = () => (
    <nav className="nav" aria-label="Main">
      {nav.map((n) => (
        <React.Fragment key={n.id}>
          {n.sep && <p className="nav-sep">{n.sep}</p>}
          <button type="button" className="nav-item" aria-current={active === n.id ? "page" : undefined} onClick={() => { go({ page: n.id }); setOpen(false); }}>
            {n.icon}<span className="grow truncate">{n.label}</span>
            {n.badge ? <span className="badge" aria-label={`${n.badge} needing attention`}>{n.badge}</span> : null}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${open ? "open" : ""}`} id="sidebar" aria-label="Sidebar">
        <div className="flex jcb" style={{ alignItems: "flex-start" }}>
          <Wordmark size="md" stacked />
          <button type="button" className="icon-btn menu-btn" onClick={() => { setOpen(false); menuRef.current?.focus(); }} aria-label="Close menu"><X aria-hidden /></button>
        </div>
        <NavList />
        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={user.name} size={34} tone="ink" />
            <div className="grow" style={{ minWidth: 0 }}>
              <p className="name truncate">{user.name}</p>
              <p className="role truncate">{ROLE_LABEL[user.role]}{user.branch ? ` · ${user.branch}` : ""}</p>
            </div>
            <button type="button" onClick={signOut} className="icon-btn" aria-label="Sign out" title="Sign out"><LogOut aria-hidden /></button>
          </div>
          <LiveBadge />
          <Copyright />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button ref={menuRef} type="button" className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar"><Menu aria-hidden /></button>
          <div className="grow" style={{ minWidth: 0 }}>
            <span className="ui small strong truncate" style={{ display: "block" }}>{titleOf(current)}</span>
            <span className="ui xs muted truncate" style={{ display: "block" }}>{snap.org.config.orgName}</span>
          </div>
          <ThemeToggle />
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <div key={current + (route.caseId ?? "")} className="page">{content}</div>
        </main>
      </div>
    </div>
  );
}

function Denied() {
  return <div className="panel"><div className="panel-b"><h2>Not permitted</h2><p className="muted mt1">Your role does not include access to this area.</p></div></div>;
}

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Empty state: what is empty, why it may be, what to do next.
 */
import React from "react";
import { Users, Inbox, Clock, CircleCheck, Search, BarChart3, ShieldCheck, Bell, FolderOpen } from "lucide-react";

export type EmptyGlyph = "students" | "inbox" | "clock" | "check" | "search" | "chart" | "shield" | "bell" | "cases";

const GLYPH: Record<EmptyGlyph, React.ReactNode> = {
  students: <Users aria-hidden />, inbox: <Inbox aria-hidden />, clock: <Clock aria-hidden />, check: <CircleCheck aria-hidden />,
  search: <Search aria-hidden />, chart: <BarChart3 aria-hidden />, shield: <ShieldCheck aria-hidden />, bell: <Bell aria-hidden />, cases: <FolderOpen aria-hidden />,
};

export function EmptyState({ glyph = "inbox", title, reason, action, compact = false, className = "" }: { glyph?: EmptyGlyph; title: string; reason?: React.ReactNode; action?: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""} ${className}`}>
      <span className="es-glyph" aria-hidden="true">{GLYPH[glyph]}</span>
      <div className="es-body">
        <p className="es-title">{title}</p>
        {reason && <p className="es-reason">{reason}</p>}
        {action && <div className="es-action">{action}</div>}
      </div>
    </div>
  );
}

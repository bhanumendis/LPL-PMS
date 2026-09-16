/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Under 1024 px the dock becomes a bottom tab bar: four primary destinations plus More.
 */
import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Layer } from "@/lib/ui";
import type { Badges } from "@/lib/signals";
import type { DestId, Destination } from "./nav";

export interface TabBarProps {
  primary: Destination[];
  more: Destination | null;
  activeId?: DestId;
  activePage: string;
  badges: Badges;
  onNavigate: (page: string) => void;
  /** Extra tab rendered before More (the counsellor's Students sheet). */
  extraTab?: ReactNode;
  /** Extra entries in the More sheet (appearance, sign out). */
  moreExtra?: ReactNode;
}

interface Entry { key: string; label: string; page: string; icon?: LucideIcon; active: boolean }

export function MobileTabBar({ primary, more, activeId, activePage, badges, onNavigate, extraTab, moreExtra }: TabBarProps) {
  const visibleCount = extraTab ? 3 : 4;
  const shown = primary.slice(0, visibleCount);
  const rest: Entry[] = [
    ...primary.slice(visibleCount).map((d) => ({ key: d.id + d.page, label: d.label, page: d.page, icon: d.icon, active: d.id === activeId })),
    ...(more?.children ?? []).map((c) => ({ key: c.page, label: c.label, page: c.page, active: activePage === c.page })),
  ];
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const restActive = rest.some((r) => r.active);
  return (
    <nav className="tabbar float float-strong" aria-label="Main">
      {shown.map((d) => {
        const n = d.badge?.(badges);
        const Icon = d.icon;
        const active = d.id === activeId;
        return (
          <button key={d.id} type="button" className={`tab-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} aria-label={n ? `${d.label}, ${n} needing attention` : undefined} onClick={() => onNavigate(d.page)}>
            <Icon aria-hidden /><span>{d.label}</span>{n ? <span className="badge" aria-hidden="true">{n}</span> : null}
          </button>
        );
      })}
      {extraTab}
      {(rest.length > 0 || moreExtra) && (
        <>
          <button ref={moreRef} type="button" className={`tab-item ${restActive ? "active" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
            <MoreHorizontal aria-hidden /><span>More</span>
          </button>
          <Layer open={open} onClose={() => setOpen(false)} anchorRef={moreRef} label="More" variant="sheet">
            <div className="sheet-menu">
              {rest.map((r) => {
                const Icon = r.icon;
                return <button key={r.key} type="button" className="menu-item" aria-current={r.active ? "page" : undefined} onClick={() => { setOpen(false); onNavigate(r.page); }}>{Icon ? <Icon aria-hidden /> : null}{r.label}</button>;
              })}
              {moreExtra}
            </div>
          </Layer>
        </>
      )}
    </nav>
  );
}

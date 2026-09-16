/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The floating dock: primary navigation as a glass capsule at the top centre. One sliding
 * highlight moves between destinations; keyboard moves with the arrow keys; Alt+N shortcuts
 * are announced in tooltips and handled by the shell.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Layer, Tooltip } from "@/lib/ui";
import { useReducedMotion } from "@/lib/hooks";
import type { Badges } from "@/lib/signals";
import type { DestId, Destination } from "./nav";

export interface DockProps {
  items: Destination[];
  /** The grouped "More" destination, when the role has one. */
  more?: Destination | null;
  activeId?: DestId;
  /** Route page currently shown; used to mark the right "More" child. */
  activePage?: string;
  onNavigate: (page: string) => void;
  badges: Badges;
  /** Icon-only presentation; the active item keeps its label. */
  compact: boolean;
  className?: string;
}

export function Dock({ items, more, activeId, activePage, onNavigate, badges, compact, className = "" }: DockProps) {
  const all = more ? [...items, more] : items;
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const reduced = useReducedMotion();
  const activeIndex = Math.max(0, all.findIndex((d) => d.id === activeId));
  const [focusIndex, setFocusIndex] = useState(activeIndex);
  useEffect(() => { setFocusIndex(activeIndex); }, [activeIndex]);

  const measure = useCallback(() => {
    const el = btnRefs.current[activeIndex];
    if (!el) { setPill(null); return; }
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [activeIndex]);

  useLayoutEffect(() => {
    measure();
    const t = window.requestAnimationFrame(() => setReady(true));
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return () => window.cancelAnimationFrame(t);
    const ro = new ResizeObserver(() => measure());
    ro.observe(nav);
    return () => { ro.disconnect(); window.cancelAnimationFrame(t); };
  }, [measure, compact, all.length]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = all.length; let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % n;
    else if (e.key === "ArrowLeft") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else return;
    e.preventDefault();
    setFocusIndex(j);
    btnRefs.current[j]?.focus();
  };

  return (
    <nav ref={navRef} className={`dock float ${compact ? "compact" : ""} ${ready && !reduced ? "ready" : ""} ${className}`} aria-label="Main">
      <span className={`dock-pill ${pill ? "on" : ""}`} aria-hidden="true" style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.w } : undefined} />
      <ul className="dock-list" role="list">
        {all.map((d, i) => {
          const isMore = more != null && d === more;
          const active = d.id === activeId;
          const n = d.badge?.(badges);
          const Icon = d.icon;
          const name = `${d.label}${n ? `, ${n} needing attention` : ""}`;
          const button = (
            <button
              ref={(el) => { btnRefs.current[i] = el; if (isMore) moreRef.current = el; }}
              type="button"
              className={`dock-item ${active ? "active" : ""}`}
              aria-current={active && !isMore ? "page" : undefined}
              aria-label={compact || n ? name : undefined}
              aria-haspopup={isMore ? "menu" : undefined}
              aria-expanded={isMore ? moreOpen : undefined}
              tabIndex={i === focusIndex ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => { if (isMore) setMoreOpen((o) => !o); else onNavigate(d.page); }}
            >
              <Icon aria-hidden />
              <span className="lbl">{d.label}</span>
              {n ? <span className="badge" aria-hidden="true">{n}</span> : null}
            </button>
          );
          return (
            <li key={d.id + d.page}>
              {compact || isMore ? <Tooltip label={d.label} shortcut={isMore ? undefined : d.shortcut}>{button}</Tooltip> : button}
            </li>
          );
        })}
      </ul>
      {more && (
        <Layer open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreRef} label="More destinations" placement="bottom" width={240} className="dock-menu-layer">
          <div className="dock-menu" role="menu" aria-label="More destinations">
            {more.children?.map((c) => (
              <button key={c.page} type="button" role="menuitem" aria-current={activePage === c.page ? "page" : undefined} onClick={() => { setMoreOpen(false); onNavigate(c.page); }}>{c.label}</button>
            ))}
          </div>
        </Layer>
      )}
    </nav>
  );
}

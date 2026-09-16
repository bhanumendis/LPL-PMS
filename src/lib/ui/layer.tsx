/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Layer: a popover anchored to its trigger on wide screens, a bottom sheet on phones. Opens
 * from the anchor's corner (transform-origin), traps focus, closes on Escape and outside click.
 * Tooltip: a delayed, non-interactive label for icon-only controls.
 */
import React, { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BP, useMediaQuery } from "../hooks";
import { useFocusTrap } from "./focus";

export type LayerPlacement = "bottom-end" | "bottom-start" | "bottom" | "center" | "left";

export interface LayerProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement>;
  /** Accessible name of the dialog. */
  label: string;
  variant?: "auto" | "popover" | "sheet";
  placement?: LayerPlacement;
  width?: number;
  /** Modal layers get a scrim and aria-modal; non-modal popovers close on outside click only. */
  modal?: boolean;
  /** Hover previews render without moving focus. Default true. */
  trapFocus?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}

interface Pos { top: number; left: number; origin: string }

/** A sheet dragged down past 120 px, or flicked faster than 0.6 px/ms, closes. */
export function shouldDismissSheet(dy: number, ms: number): boolean {
  return dy > 120 || (ms > 0 && dy > 0 && dy / ms > 0.6);
}

export function Layer({ open, onClose, anchorRef, label, variant = "auto", placement = "bottom-end", width = 360, modal = false, trapFocus = true, children, className = "", id }: LayerProps) {
  const isMobile = useMediaQuery(BP.mobile);
  const asSheet = variant === "sheet" || (variant === "auto" && isMobile);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  useFocusTrap(ref, open && trapFocus, { onEscape: onClose });

  const w = typeof window !== "undefined" ? Math.min(width, window.innerWidth - 16) : width;

  useLayoutEffect(() => {
    if (!open || asSheet) return;
    const compute = () => {
      const a = anchorRef?.current?.getBoundingClientRect();
      const ww = Math.min(width, window.innerWidth - 16);
      if (!a || placement === "center") {
        setPos({ top: Math.max(16, Math.round(window.innerHeight * 0.12)), left: Math.round((window.innerWidth - ww) / 2), origin: "top center" });
        return;
      }
      if (placement === "left") {
        const top = Math.max(8, Math.min(a.top, window.innerHeight - 8 - Math.min(720, window.innerHeight * 0.78)));
        setPos({ top: Math.round(top), left: Math.round(Math.max(8, a.left - ww - 10)), origin: "top right" });
        return;
      }
      let left = placement === "bottom-end" ? a.right - ww : placement === "bottom-start" ? a.left : a.left + a.width / 2 - ww / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - ww - 8));
      const originX = placement === "bottom-end" ? "right" : placement === "bottom-start" ? "left" : "center";
      setPos({ top: Math.round(a.bottom + 8), left: Math.round(left), origin: `top ${originX}` });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => { window.removeEventListener("resize", compute); window.removeEventListener("scroll", compute, true); };
  }, [open, asSheet, anchorRef, placement, width]);

  useEffect(() => {
    if (!open || modal || asSheet) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, modal, asSheet, onClose, anchorRef]);

  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    ref.current.style.transform = d.dy ? `translateY(${d.dy}px)` : "";
  };
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ref.current) return;
    ref.current.style.transition = "";
    if (shouldDismissSheet(d.dy, e.timeStamp - d.t)) { onClose(); return; }
    ref.current.style.transform = "";
  };

  if (!open) return null;

  if (asSheet) {
    return createPortal(
      <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} id={id} role="dialog" aria-modal="true" aria-label={label} className={`sheet float float-strong ${className}`} tabIndex={-1}>
          <div className="sheet-grip" aria-hidden="true" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}><div className="sheet-handle" /></div>
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  const style: React.CSSProperties & Record<string, string | number | undefined> = {
    top: pos?.top, left: pos?.left, width: w, visibility: pos ? "visible" : "hidden", "--origin": pos?.origin ?? "top right",
  };
  const node = (
    <div ref={ref} id={id} role="dialog" aria-modal={modal || undefined} aria-label={label} className={`layer float float-strong ${className}`} style={style} tabIndex={-1}>
      {children}
    </div>
  );
  return createPortal(
    modal ? <div className="layer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{node}</div> : node,
    document.body,
  );
}

// ---------- tooltip ----------

interface TooltipChildProps {
  "aria-describedby"?: string;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLElement>) => void;
}

export function Tooltip({ label, shortcut, children, delay = 400, side = "bottom" }: { label: string; shortcut?: string; children: ReactElement<TooltipChildProps>; delay?: number; side?: "bottom" | "right" }) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<number | null>(null);
  const clear = useCallback(() => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } }, []);
  const reveal = useCallback((el: HTMLElement) => { setRect(el.getBoundingClientRect()); setShow(true); }, []);
  const hide = useCallback(() => { clear(); setShow(false); }, [clear]);
  useEffect(() => clear, [clear]);
  const p = children.props;
  const child = cloneElement(children, {
    "aria-describedby": show ? id : p["aria-describedby"],
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { p.onMouseEnter?.(e); const el = e.currentTarget; clear(); timer.current = window.setTimeout(() => reveal(el), delay); },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { p.onMouseLeave?.(e); hide(); },
    onFocus: (e: React.FocusEvent<HTMLElement>) => { p.onFocus?.(e); reveal(e.currentTarget); },
    onBlur: (e: React.FocusEvent<HTMLElement>) => { p.onBlur?.(e); hide(); },
  });
  return (
    <>
      {child}
      {show && rect && createPortal(
        <span role="tooltip" id={id} className={`tooltip float float-strong ${side === "right" ? "right" : ""}`} style={side === "right" ? { top: rect.top + rect.height / 2, left: rect.right + 10 } : { top: rect.bottom + 8, left: rect.left + rect.width / 2 }}>
          {label}{shortcut && <kbd>{shortcut}</kbd>}
        </span>,
        document.body,
      )}
    </>
  );
}

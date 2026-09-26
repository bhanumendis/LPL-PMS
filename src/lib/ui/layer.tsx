/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Layer: a popover anchored to its trigger on wide screens, a bottom sheet on phones. Opens
 * from the anchor's corner (transform-origin), traps focus, closes on Escape and outside click,
 * and leaves the way it came (presence.ts). A sheet follows the finger: past its resting place
 * it rubber-bands, and a throw that dismisses it carries on at the speed it was let go.
 * Tooltip: a delayed, non-interactive label for icon-only controls.
 */
import React, { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { BP, useMediaQuery } from "../hooks";
import { useFocusTrap } from "./focus";
import { EXIT_MS, leavingAttrs, useLastOpen, usePresence } from "./presence";

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

/** A sheet let go more than 120 px down, or thrown down faster than 0.6 px/ms, closes. */
export function shouldDismissSheet(dy: number, velocity: number): boolean {
  return dy > 120 || (dy > 0 && velocity > 0.6);
}

/**
 * Travel past a boundary meets growing resistance and never exceeds `limit` (UIScrollView's
 * rubber-band curve, c = 0.55): the first pixels follow the finger, the rest barely move.
 */
export function rubberBand(overshoot: number, limit: number, c = 0.55): number {
  return overshoot <= 0 ? 0 : (overshoot * limit * c) / (limit + c * overshoot);
}

/** How far a sheet can be pulled up: the part of it kept below the screen (.sheet, 40px). */
const SHEET_OVERSCROLL = 40;
/** A finger that rested this long before lifting threw nothing. */
const THROW_STALE_MS = 80;

export function Layer({ open, onClose, anchorRef, label, variant = "auto", placement = "bottom-end", width = 360, modal = false, trapFocus = true, children, className = "", id }: LayerProps) {
  const isMobile = useMediaQuery(BP.mobile);
  const asSheet = variant === "sheet" || (variant === "auto" && isMobile);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const { mounted, leaving } = usePresence(open, asSheet ? EXIT_MS.sheet : EXIT_MS.popover);
  const content = useLastOpen(children, open);
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

  // The sheet tracks the finger 1:1 downwards and rubber-bands upwards. `v` is the release
  // velocity (px/ms, smoothed over the last moves), not the average over the whole drag.
  const drag = useRef<{ y: number; dy: number; t: number; v: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!open) return;
    drag.current = { y: e.clientY, dy: 0, t: e.timeStamp, v: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dy = e.clientY - d.y;
    const dt = e.timeStamp - d.t;
    if (dt > 0) d.v = 0.8 * ((dy - d.dy) / dt) + 0.2 * d.v;
    d.dy = dy;
    d.t = e.timeStamp;
    const shown = dy >= 0 ? dy : -rubberBand(-dy, SHEET_OVERSCROLL);
    ref.current.style.transform = shown ? `translateY(${shown}px)` : "";
  };
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!d || !el) return;
    const v = e.timeStamp - d.t > THROW_STALE_MS ? 0 : d.v;
    if (shouldDismissSheet(d.dy, v)) {
      // Carry the throw: the rest of the way at the speed the finger left with, within the exit.
      const rest = Math.max(0, el.offsetHeight - d.dy);
      const ms = Math.round(Math.min(EXIT_MS.sheet, Math.max(80, rest / Math.max(v, 0.5))));
      el.dataset.thrown = "";
      el.style.transition = `transform ${ms}ms var(--ease-out)`;
      el.style.transform = "translateY(100%)";
      onClose();
      return;
    }
    // Short of dismissing: back home on the sheet's spring (.sheet transition).
    el.style.transition = "";
    el.style.transform = "";
  };

  if (!mounted) return null;
  const out = leaving ? " is-leaving" : "";

  if (asSheet) {
    return createPortal(
      <div className={`sheet-scrim${out}`} {...leavingAttrs(leaving)} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} id={id} role="dialog" aria-modal="true" aria-label={label} className={`sheet float float-strong ${className}`} tabIndex={-1}>
          <div className="sheet-grip" aria-hidden="true" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}><div className="sheet-handle" /></div>
          {content}
        </div>
      </div>,
      document.body,
    );
  }

  const style: React.CSSProperties & Record<string, string | number | undefined> = {
    top: pos?.top, left: pos?.left, width: w, visibility: pos ? "visible" : "hidden", "--origin": pos?.origin ?? "top right",
  };
  const node = (
    <div ref={ref} id={id} role="dialog" aria-modal={modal || undefined} aria-label={label} className={`layer float float-strong ${className}${out}`} style={style} tabIndex={-1} {...(modal ? {} : leavingAttrs(leaving))}>
      {content}
    </div>
  );
  return createPortal(
    modal ? <div className={`layer-scrim${out}`} {...leavingAttrs(leaving)} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{node}</div> : node,
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

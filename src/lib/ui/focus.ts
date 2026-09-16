/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Focus trap shared by dialogs, popovers and sheets. Layers stack: Escape and Tab cycling
 * belong to the topmost active layer only, so a popover inside a dialog closes first.
 */
import { useEffect, useRef, type RefObject } from "react";

const SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const stack: symbol[] = [];

function focusables(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(SELECTOR)).filter((f) => !f.hasAttribute("data-trap-skip"));
}

export interface FocusTrapOptions {
  /** Where focus lands on open: the first control (default) or the container itself. */
  initial?: "first" | "container";
  /** Return focus to the previously focused element on close (default true). */
  returnFocus?: boolean;
  onEscape?: () => void;
}

export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, opts: FocusTrapOptions = {}): void {
  const { initial = "first", returnFocus = true } = opts;
  // Callers pass inline closures; the effect must not re-run on every render.
  const onEscapeRef = useRef(opts.onEscape);
  useEffect(() => { onEscapeRef.current = opts.onEscape; });
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const token = Symbol("layer");
    stack.push(token);
    const isTop = () => stack[stack.length - 1] === token;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      if (!isTop()) return;
      if (initial === "container") { el.focus(); return; }
      const f = focusables(el);
      (f.find((x) => !x.hasAttribute("data-close")) ?? f[0] ?? el).focus();
    }, 30);
    const h = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onEscapeRef.current?.(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(el);
      if (!f.length) { e.preventDefault(); el.focus(); return; }
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", h);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", h);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (returnFocus) prev?.focus?.();
    };
  }, [active, initial, returnFocus, ref]);
}

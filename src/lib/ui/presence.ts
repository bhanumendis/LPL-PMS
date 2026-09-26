/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Presence: an overlay leaves the way it came instead of vanishing. The moment it closes it is
 * inert and hidden from assistive technology, focus has gone home and its scrim lets the
 * pointer through, so for everything but the eye it is already gone; the node itself goes when
 * its exit has played. Under reduced motion it goes at once.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks";

/** Exit durations, in step with --d-1 and --d-2 in tokens.css (presence.test.ts holds them). */
export const EXIT_MS = { popover: 120, sheet: 200, dialog: 200, toast: 200 } as const;

export function usePresence(open: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const reduced = useReducedMotion();
  const [prev, setPrev] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open !== prev) {
    // Adjusting state during render, React's pattern for responding to a prop change: the
    // closing render already knows it is leaving, so the node is never dropped and remounted.
    setPrev(open);
    setLeaving(!open && !reduced && exitMs > 0);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(false), exitMs);
    return () => window.clearTimeout(t);
  }, [leaving, exitMs]);
  return { mounted: open || leaving, leaving: !open && leaving };
}

/** Attributes for a leaving node: out of the tab order, the pointer and the accessibility tree. */
export function leavingAttrs(leaving: boolean): Record<string, string> {
  return leaving ? { inert: "", "aria-hidden": "true" } : {};
}

/**
 * What an overlay showed while it was open. It leaves showing that, not whatever its parent
 * renders once the thing it showed is gone (a cleared selection, a saved form).
 */
export function useLastOpen<T>(value: T, open: boolean): T {
  const last = useRef(value);
  if (open) last.current = value;
  return last.current;
}

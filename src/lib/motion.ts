/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Motion helpers. Both are progressive: without the View Transitions API or under
 * prefers-reduced-motion the update simply happens, and nothing waits on an animation.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { BP, matches } from "./hooks";

/** The shared name that morphs a rail row into the case workspace header. */
export const CASE_HEAD_TRANSITION = "case-head";

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

let pendingSource: HTMLElement | null = null;

/** Marks the element the next case navigation should morph from (a rail row, a queue row). */
export function setTransitionSource(el: HTMLElement | null) { pendingSource = el; }

/**
 * Runs `update` inside a view transition when the browser supports one and the user has not
 * asked for reduced motion; otherwise runs it directly. React state set inside `update` is
 * flushed synchronously so the new snapshot contains it.
 */
export function runViewTransition(update: () => void): void {
  const source = pendingSource;
  pendingSource = null;
  const doc = document as ViewTransitionDoc;
  if (typeof doc.startViewTransition !== "function" || matches(BP.reducedMotion)) { update(); return; }
  // Two elements may not share a name; if a case header is already on screen, crossfade only.
  const named = source && !document.querySelector(".case-head");
  if (named) source.style.viewTransitionName = CASE_HEAD_TRANSITION;
  try {
    doc.startViewTransition(() => {
      if (named) source.style.viewTransitionName = "";
      flushSync(update);
    });
  } catch {
    if (named) source.style.viewTransitionName = "";
    update();
  }
}

export function useViewTransition(): (update: () => void) => void {
  return useCallback((update: () => void) => runViewTransition(update), []);
}

const FLIP_LIMIT = 30;

/**
 * FLIP for short lists: after each commit, children whose `data-flip` key moved animate from
 * their old position. Skipped above 30 rows and under reduced motion.
 */
export function useFlip(listRef: RefObject<HTMLElement | null>, deps: unknown[]) {
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-flip]"));
    const next = new Map<string, DOMRect>();
    for (const el of items) next.set(el.dataset.flip!, el.getBoundingClientRect());
    const animate = items.length <= FLIP_LIMIT && !matches(BP.reducedMotion);
    if (animate) {
      for (const el of items) {
        const before = rects.current.get(el.dataset.flip!);
        const after = next.get(el.dataset.flip!)!;
        if (!before) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        if (typeof el.animate === "function") {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
        }
      }
    }
    rects.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

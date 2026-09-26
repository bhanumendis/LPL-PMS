/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Motion helpers. All are progressive: without the View Transitions API or under
 * prefers-reduced-motion the update simply happens, and nothing waits on an animation.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";
import { BP, matches } from "./hooks";

/** --ease-out and --d-3 in tokens.css, for animations started from script. */
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const D3_MS = 320;

/**
 * Two page-wide details the stylesheet cannot manage alone:
 * - a background tab pauses its endless animations (loading shimmer and spinners) rather
 *   than spend the battery on frames nobody sees (`html[data-hidden]`, base.css);
 * - iOS Safari applies :active only on a page that listens for touches, so without this every
 *   press on an iPhone would go unanswered.
 */
export function installMotion(doc: Document = document): () => void {
  const root = doc.documentElement;
  const sync = () => root.toggleAttribute("data-hidden", doc.visibilityState === "hidden");
  const touch = () => {};
  sync();
  doc.addEventListener("visibilitychange", sync);
  doc.addEventListener("touchstart", touch, { passive: true });
  return () => {
    doc.removeEventListener("visibilitychange", sync);
    doc.removeEventListener("touchstart", touch);
    root.removeAttribute("data-hidden");
  };
}

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
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: D3_MS, easing: EASE_OUT });
        }
      }
    }
    rects.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

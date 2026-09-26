/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Slice subscriptions to the store. A component that reads one slice re-renders only when
 * that slice changes, not on every poll tick.
 */
import { useRef, useSyncExternalStore } from "react";
import { store, type Snapshot } from "./store";

const subscribe = (fn: () => void) => store.subscribe(() => fn());

/** The whole snapshot. Re-renders on every store emit; prefer useStoreSelect. */
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => store.snap, () => store.snap);
}

/**
 * A derived slice. `isEqual` (default Object.is) decides whether a recomputed value counts as
 * changed; return primitives or memoised objects, or pass a structural comparator.
 */
export function useStoreSelect<T>(selector: (s: Snapshot) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ snap: Snapshot; selector: (s: Snapshot) => T; value: T } | null>(null);
  const read = () => {
    const snap = store.snap;
    const c = cache.current;
    if (c && c.snap === snap && c.selector === selector) return c.value;
    const value = selector(snap);
    if (c && isEqual(c.value, value)) { cache.current = { snap, selector, value: c.value }; return c.value; }
    cache.current = { snap, selector, value };
    return value;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/** Shallow equality for selectors that return small arrays or plain objects. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

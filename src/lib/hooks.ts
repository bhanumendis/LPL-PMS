/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Small shared hooks: viewport queries, remembered preferences, the tab session id.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { uid } from "./ids";

/** Breakpoints used by the shell. Forms keep their own 640 px rule. */
export const BP = {
  mobile: "(max-width: 767px)",
  tablet: "(max-width: 1023px)",
  compact: "(max-width: 1279px)",
  wide: "(min-width: 1440px)",
  touch: "(pointer: coarse)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

function mql(query: string): MediaQueryList | null {
  try { return typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null; } catch { return null; }
}

/** Imperative check for code outside React (animations, scrolling). */
export function matches(query: string): boolean { return mql(query)?.matches ?? false; }

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const m = mql(query);
    if (!m) return () => {};
    const h = () => cb();
    if (typeof m.addEventListener === "function") m.addEventListener("change", h); else m.addListener(h);
    return () => { if (typeof m.removeEventListener === "function") m.removeEventListener("change", h); else m.removeListener(h); };
  }, [query]);
  return useSyncExternalStore(subscribe, () => matches(query), () => false);
}

export function useReducedMotion(): boolean { return useMediaQuery(BP.reducedMotion); }
export function useIsTouch(): boolean { return useMediaQuery(BP.touch); }

function readPref<T>(key: string, initial: T): T {
  try { const raw = localStorage.getItem(key); return raw === null ? initial : (JSON.parse(raw) as T); } catch { return initial; }
}

/** A per-browser preference (rail collapsed, performance section open, dismissed hints). */
export function useLocalPref<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, initial));
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [key]);
  return [value, set];
}

const SID_KEY = "lpl:pms:sid";
/** Stable id for this tab's session; written to audit rows so one sitting can be followed. */
export function sessionId(): string {
  try {
    const cur = sessionStorage.getItem(SID_KEY);
    if (cur) return cur;
    const next = uid();
    sessionStorage.setItem(SID_KEY, next);
    return next;
  } catch { return "no-session"; }
}
export function useSessionId(): string { return sessionId(); }

/** The value once it has stopped changing for `ms` (search boxes: one request per pause, not per key). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Searches go to the server from three characters: shorter terms cannot use its index. */
export const SEARCH_MIN = 3;

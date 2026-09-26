/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * "Unseen updates" for the rail: when the counsellor last opened each case, kept in this
 * browser. No schema change; a case is unseen when it changed after that moment and the last
 * event was not the counsellor's own.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { CaseSignals } from "@/lib/signals";

const EVENT = "lpl:seen";
const key = (userId: string) => `lpl:pms:seen:${userId}`;
const cache = new Map<string, Record<string, string>>();

function read(userId: string): Record<string, string> {
  const hit = cache.get(userId);
  if (hit) return hit;
  let map: Record<string, string> = {};
  try { map = JSON.parse(localStorage.getItem(key(userId)) ?? "{}") as Record<string, string>; } catch { map = {}; }
  cache.set(userId, map);
  return map;
}

export function lastSeen(userId: string, caseId: string): string | null { return read(userId)[caseId] ?? null; }

export function markSeen(userId: string, caseId: string, updatedAt: string): void {
  const cur = read(userId);
  if (cur[caseId] === updatedAt) return;
  const next = { ...cur, [caseId]: updatedAt };
  cache.set(userId, next);
  try { localStorage.setItem(key(userId), JSON.stringify(next)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: userId }));
}

export function hasUnseen(userId: string, s: CaseSignals, seen: Record<string, string> = read(userId)): boolean {
  if (!s.lastEventAt || s.lastEventBy === userId) return false;
  const at = seen[s.id];
  if (!at) return true;
  return s.updatedAt > at;
}

/** The seen map for a user, refreshed when markSeen runs or another tab writes it. */
export function useSeen(userId: string | undefined): Record<string, string> {
  const subscribe = useCallback((cb: () => void) => {
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith("lpl:pms:seen:")) { cache.clear(); cb(); } };
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
  }, []);
  const get = () => (userId ? read(userId) : EMPTY);
  return useSyncExternalStore(subscribe, get, get);
}
const EMPTY: Record<string, string> = {};

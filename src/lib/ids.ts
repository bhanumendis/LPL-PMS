/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Identifiers and timestamps. A leaf module: the domain logic uses these without depending on
 * the store (which would make logic → store → server → queries → logic a cycle).
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowIso(): string { return new Date().toISOString(); }

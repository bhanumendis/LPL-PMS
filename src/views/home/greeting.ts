/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import type { CaseRecord } from "@/lib/types";

export function greeting(name: string, now: Date = new Date()): string {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.trim().split(/\s+/)[0] || name;
  return `${part}, ${first}`;
}

/** New enquiries in the last 30 days against the 30 before, for the stat strip delta. */
export function enquiryDelta(cases: CaseRecord[], now: number = Date.now()): { last: number; prev: number } {
  const d30 = 30 * 86400000;
  let last = 0, prev = 0;
  for (const c of cases) {
    const t = new Date(c.createdAt).getTime();
    if (t > now - d30) last++;
    else if (t > now - 2 * d30) prev++;
  }
  return { last, prev };
}

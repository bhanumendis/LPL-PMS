/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Shared test fixtures. No sample data ships in the build; these exist for tests only.
 */
import type { CaseRecord, User } from "@/lib/types";

export const ISO = "2026-09-01T00:00:00.000Z";

export function blankCase(over: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: "c1",
    ref: "LPL-2026-0001",
    student: { name: "Nimal Perera", email: "nimal@example.com", phone: "0770000000" },
    status: "open",
    steps: { 1: { status: "done", completedAt: ISO, completedBy: "u1", values: { source: "Website" } } },
    documents: [],
    gates: [],
    events: [],
    createdAt: ISO,
    updatedAt: ISO,
    rev: 1,
    ...over,
  };
}

export function user(over: Partial<User> & { id: string; role: User["role"] }): User {
  return { name: over.id, email: `${over.id}@example.com`, passwordHash: "", active: true, createdAt: ISO, ...over };
}

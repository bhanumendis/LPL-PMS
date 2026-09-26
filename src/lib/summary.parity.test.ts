/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The committed parity fixture must be exactly what summary.ts produces today, and the SQL
 * process spine must be exactly spine.ts; otherwise the database and the browser could be
 * compared against a stale answer.
 */
import { describe, expect, it } from "vitest";
import fixture from "../../server/test/integration/testdata/summary_parity.json?raw";
import indexSql from "../../supabase/migrations/20260925000300_v6_case_index.sql?raw";
import { buildParityFixture } from "@/test/parity-fixture";
import { ORDERED_STEP_NUMBERS, STEP_BY_N, pipelineOfStep } from "./spine";

describe("parity fixture", () => {
  it("is up to date (run npm run parity:update after changing summary.ts or the generator)", () => {
    expect(fixture.trim() === JSON.stringify(buildParityFixture())).toBe(true);
  });
  it("the SQL process spine is spine.ts", () => {
    const rows = [...indexSql.matchAll(/^\s*\((\d+), (\d+), (\d), (true|false), '\{([\d,]*)\}'\)/gm)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === "true", m[5] ? m[5].split(",").map(Number) : []]);
    const deps = (n: number) => STEP_BY_N[n].unlockAfter ?? (n === 1 ? [] : n === 6 ? [4] : n === 13 ? [11] : [n - 1]);
    expect(rows).toEqual(ORDERED_STEP_NUMBERS.map((n, i) => [n, i + 1, pipelineOfStep(n).n, !!STEP_BY_N[n].optional, deps(n)]));
  });
});

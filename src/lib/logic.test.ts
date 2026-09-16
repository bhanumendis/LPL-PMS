/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { caseProgress, currentStep, stepState } from "./logic";
import { blankCase } from "@/test/fixtures";

describe("logic baseline", () => {
  it("step 2 is the current step of a fresh case", () => {
    expect(currentStep(blankCase())).toBe(2);
  });
  it("progress counts done over applicable", () => {
    const p = caseProgress(blankCase());
    expect(p.done).toBe(1);
    expect(p.pct).toBeGreaterThan(0);
  });
  it("stepState is safe for missing steps", () => {
    expect(stepState(blankCase(), 30).status).toBe("pending");
  });
});

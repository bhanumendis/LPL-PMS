/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "@/App";
import { seedCases, signInAs } from "@/test/session";
import { blankCase, ISO } from "@/test/fixtures";

function phoneWidth(on: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: on && query === "(max-width: 767px)", media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}

describe("cases list", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("filters by the stage deep link and shows the most urgent attention as a severity chip", async () => {
    const couns = await signInAs("counsellor", { id: "couns" });
    await seedCases([
      blankCase({ id: "c1", counsellorId: couns.id, gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: couns.id, status: "returned", decidedAt: ISO, decidedBy: "tl" }] }),
    ]);
    window.location.hash = "#/cases/stage:P2";
    render(<App />);
    const bar = await screen.findByRole("search", { name: "Filter cases" }, { timeout: 5000 });
    const main = screen.getByRole("main");
    expect(within(bar).getByLabelText("Stage")).toHaveValue("P2");
    const table = within(main).getByRole("table");
    expect(within(table).getByText("Gate 16 returned with suggestions")).toHaveClass("sev-chip", "sev-bad");
    expect(within(table).getByRole("img", { name: /stage \d of 9/ })).toBeInTheDocument();
  });

  it("renders cards instead of the table at phone width", async () => {
    phoneWidth(true);
    const couns = await signInAs("counsellor", { id: "couns" });
    await seedCases([blankCase({ id: "c1", counsellorId: couns.id })]);
    window.location.hash = "#/cases";
    render(<App />);
    expect(await screen.findByRole("list", { name: "My caseload" }, { timeout: 5000 })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).queryByRole("table")).toBeNull();
  });
});

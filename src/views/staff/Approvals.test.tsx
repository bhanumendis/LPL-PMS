/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import App from "@/App";
import { seedCases, signInAs } from "@/test/session";
import { blankCase, ISO } from "@/test/fixtures";
import type { GateSubmission } from "@/lib/types";

const pending = (over: Partial<GateSubmission> = {}): GateSubmission => ({ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: "c", status: "pending", ...over });

describe("approvals", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("says as many are awaiting decision as the queue lists, whatever else is still marked pending", async () => {
    // Reduced motion: the figures show their value at once instead of counting up.
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)", media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    await signInAs("team_leader", { id: "tl" });
    await seedCases([
      blankCase({ id: "c1", ref: "LPL-2026-0001", gates: [pending()] }),
      blankCase({ id: "c2", ref: "LPL-2026-0002", status: "exited", gates: [pending()] }),
      blankCase({ id: "c3", ref: "LPL-2026-0003", status: "hold", gates: [pending()] }),
      blankCase({ id: "c4", ref: "LPL-2026-0004", gates: [pending(), pending({ id: "g2", round: 2, status: "returned", decidedAt: ISO, decidedBy: "tl" })] }),
    ]);
    window.location.hash = "#/approvals";
    render(<App />);
    const queue = await screen.findByRole("region", { name: "Awaiting decision (1)" }, { timeout: 5000 });
    expect(within(queue).getAllByRole("listitem")).toHaveLength(1);
    expect(within(queue).getByText("LPL-2026-0001")).toBeInTheDocument();
    const tile = within(screen.getByRole("group", { name: "Approval position" })).getByText("Awaiting decision").closest(".stat") as HTMLElement;
    await waitFor(() => expect(tile.querySelector(".stat-value")).toHaveTextContent(/^1$/));
    expect(within(queue).queryByText(/of \d+/)).toBeNull();
  });
});

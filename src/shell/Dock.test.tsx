/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dock } from "./Dock";
import { destinationsFor, moreDestination } from "./nav";
import { can as canFn, caseScopeOf } from "@/lib/rbac";
import { defaultConfig } from "@/lib/defaults";
import { user } from "@/test/fixtures";
import type { Badges } from "@/lib/signals";

const config = defaultConfig();
const admin = user({ id: "a", role: "admin" });
const { primary, more } = destinationsFor({ role: "admin", can: (p) => canFn(config, admin, p), isSuperAdmin: true, seesAll: caseScopeOf(config, "admin") === "all" });
const badges: Badges = { unassigned: 3, toReview: 0, pendingGates: 2, breaches: 0, returned: 0, retentionOverdue: 0 };

describe("Dock", () => {
  it("marks the active item and moves focus with arrow keys", () => {
    render(<Dock items={primary} more={moreDestination(more)} activeId="cases" onNavigate={() => {}} badges={badges} compact={false} />);
    const cases = screen.getByRole("button", { name: /^Cases/ });
    expect(cases).toHaveAttribute("aria-current", "page");
    const buttons = screen.getAllByRole("button");
    buttons[1].focus();
    fireEvent.keyDown(buttons[1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[2]);
    fireEvent.keyDown(buttons[2], { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
  });
  it("exposes badge counts in the accessible name", () => {
    render(<Dock items={primary} more={null} activeId="home" onNavigate={() => {}} badges={badges} compact={false} />);
    expect(screen.getByRole("button", { name: "Cases, 3 needing attention" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approvals, 2 needing attention" })).toBeInTheDocument();
  });
  it("navigates on click and opens the More menu", () => {
    const go = vi.fn();
    render(<Dock items={primary} more={moreDestination(more)} activeId="home" activePage="overview" onNavigate={go} badges={badges} compact={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Approvals, 2 needing attention" }));
    expect(go).toHaveBeenCalledWith("approvals");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Prompt Engineer" }));
    expect(go).toHaveBeenCalledWith("prompts");
  });
});

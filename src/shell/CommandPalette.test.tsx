/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { filterCommands, type Command } from "./commands";

const cmds: Command[] = [
  { id: "go:overview", group: "Go to", label: "Overview", run: vi.fn() },
  { id: "go:cases", group: "Go to", label: "Cases", run: vi.fn() },
  { id: "case:c1", group: "Cases", label: "LPL-2026-0001 · Nimal Perera", hint: "Stage 2 · Australia", keywords: "nimal@example.com", run: () => { window.location.hash = "#/case/c1"; } },
  { id: "act:signout", group: "Actions", label: "Sign out", run: vi.fn() },
];

describe("command palette", () => {
  it("filterCommands hides cases until something is typed and ranks label prefixes first", () => {
    expect(filterCommands(cmds, "").map((c) => c.id)).toEqual(["go:overview", "go:cases", "act:signout"]);
    expect(filterCommands(cmds, "0001").map((c) => c.id)).toEqual(["case:c1"]);
    expect(filterCommands(cmds, "nimal@").map((c) => c.id)).toEqual(["case:c1"]);
    expect(filterCommands(cmds, "ca").map((c) => c.id)).toEqual(["go:cases"]);
  });
  it("typing lists the case, Enter opens it, Escape closes", () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={cmds} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "0001" } });
    expect(screen.getByRole("option", { name: /LPL-2026-0001/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(window.location.hash).toBe("#/case/c1");
    expect(onClose).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

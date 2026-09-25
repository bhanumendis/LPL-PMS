/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@/App";
import { seedCases, signInAs } from "@/test/session";
import { blankCase, ISO } from "@/test/fixtures";

describe("counsellor student rail", () => {
  it("stays minimised on the left, slides open with each student's percentage, stage and step, filters, and opens the workspace", async () => {
    const couns = await signInAs("counsellor", { id: "couns" });
    await seedCases([
      blankCase({ id: "c1", counsellorId: couns.id }),
      blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: couns.id, student: { name: "Sithmi Jayasinghe", email: "s@example.com", phone: "0771111111" }, gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: couns.id, status: "returned", decidedAt: ISO, decidedBy: "tl", suggestions: "Add the bank letter" }] }),
      blankCase({ id: "c3", ref: "LPL-2026-0003", counsellorId: "other", student: { name: "Other Student", email: "o@example.com", phone: "0772222222" } }),
    ]);
    render(<App />);

    // Minimised: a strip of progress rings, no list and no panel.
    const strip = await screen.findByRole("complementary", { name: "My students" });
    expect(strip).toHaveClass("strip");
    expect(within(strip).getAllByRole("button", { name: /^Quick view / })).toHaveLength(2);
    expect(within(strip).queryByText(/Other Student/)).toBeNull();
    expect(screen.queryByRole("dialog", { name: "My students" })).toBeNull();

    // Pressing the launcher slides the quick view open.
    const launcher = within(strip).getByRole("button", { name: /Open my students, 2 assigned, 1 needing attention/ });
    fireEvent.click(launcher);
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "My students" });
    const rows = within(panel).getAllByRole("button", { name: /^Open / });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName(/Sithmi Jayasinghe, LPL-2026-0002, \d+ percent complete, stage \d of 9/);
    expect(rows[0]).toHaveTextContent(/Stage \d\/9/);
    expect(rows[0]).toHaveTextContent(/Step \d+ ·/);
    expect(rows[0]).toHaveTextContent(/\d+%/);
    expect(within(panel).getByText("Gate 16 returned with suggestions")).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Caseload summary" })).toHaveTextContent("Need attention");

    fireEvent.click(within(panel).getByRole("button", { name: "Show details for Sithmi Jayasinghe" }));
    const region = within(panel).getByRole("region", { name: "Sithmi Jayasinghe details" });
    expect(region).toHaveTextContent("Gate 16 returned");
    expect(within(region).getByRole("button", { name: /Open current step/ })).toBeInTheDocument();

    const search = within(panel).getByRole("searchbox", { name: "Search students" });
    // The search is debounced and answered by the read model, so the list updates a moment later.
    fireEvent.change(search, { target: { value: "nimal" } });
    await waitFor(() => expect(within(panel).queryByRole("button", { name: /Open Sithmi/ })).toBeNull());
    expect(within(panel).getByRole("button", { name: /Open Nimal Perera/ })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });

    fireEvent.click(await within(panel).findByRole("button", { name: /Open Sithmi Jayasinghe/ }));
    expect(window.location.hash).toBe("#/case/c2");
    expect(await screen.findByRole("heading", { name: "Sithmi Jayasinghe" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "My students" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "My students" })).toBeInTheDocument();
  });

  it("a ring in the strip opens the panel with that student's quick view expanded; Escape closes it", async () => {
    const couns = await signInAs("counsellor", { id: "couns" });
    await seedCases([blankCase({ id: "c1", counsellorId: couns.id })]);
    render(<App />);
    const strip = await screen.findByRole("complementary", { name: "My students" });
    fireEvent.click(within(strip).getByRole("button", { name: /^Quick view Nimal Perera/ }));
    const panel = screen.getByRole("dialog", { name: "My students" });
    expect(within(panel).getByRole("region", { name: "Nimal Perera details" })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? panel, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "My students" })).toBeNull();
  });

  it("team leaders, who see every case, do not get the rail", async () => {
    await signInAs("team_leader");
    render(<App />);
    await screen.findByRole("navigation", { name: "Main" });
    expect(screen.queryByRole("complementary", { name: "My students" })).toBeNull();
  });

  it("a counsellor with no cases sees the empty state in the panel", async () => {
    await signInAs("counsellor");
    render(<App />);
    const strip = await screen.findByRole("complementary", { name: "My students" });
    fireEvent.click(within(strip).getByRole("button", { name: /Open my students/ }));
    expect(within(screen.getByRole("dialog", { name: "My students" })).getByText("No students assigned yet")).toBeInTheDocument();
  });
});

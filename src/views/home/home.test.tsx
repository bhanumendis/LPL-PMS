/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "@/App";
import { addUser, seedCases, signInAs } from "@/test/session";
import { blankCase, ISO, user } from "@/test/fixtures";
import { greeting, enquiryDelta } from "./greeting";

describe("role dashboards", () => {
  it("counsellor: greeting, attention queue with an action, stage flow that filters the caseload", async () => {
    const couns = await signInAs("counsellor", { id: "couns", name: "Nadeesha Fernando" });
    await seedCases([
      blankCase({ id: "c1", counsellorId: couns.id, gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: couns.id, status: "returned", decidedAt: ISO, decidedBy: "tl" }] }),
      blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: couns.id, student: { name: "Sithmi Jayasinghe", email: "s@example.com", phone: "0771111111" } }),
    ]);
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Nadeesha/ })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("group", { name: "Your position" })).toBeInTheDocument();
    const queue = within(main).getByRole("region", { name: "Overdue" });
    expect(queue).toHaveTextContent("Gate 16 returned with suggestions");
    fireEvent.click(within(queue).getByRole("button", { name: /Open gate/ }));
    expect(window.location.hash).toBe("#/case/c1/step/16");
    window.location.hash = "#/";
    const flow = await within(screen.getByRole("main")).findByRole("list", { name: /My open cases by stage/ });
    fireEvent.click(within(flow).getByRole("button", { name: /Stage 2 Qualify and profile, 2 open/ }));
    expect(window.location.hash).toBe("#/cases/stage%3AP2");
  });
  it("team leader: decisions waiting first, with a Review deep link into approvals", async () => {
    await signInAs("team_leader", { id: "tl", name: "Team Leader" });
    const couns = user({ id: "couns", role: "counsellor", name: "Case Counsellor" });
    await addUser(couns);
    await seedCases([blankCase({ id: "c1", counsellorId: couns.id, gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: couns.id, status: "pending" }] })]);
    render(<App />);
    const main = await screen.findByRole("main");
    expect(await within(main).findByRole("group", { name: "Team position" })).toHaveTextContent("Awaiting my decision");
    const q = within(main).getByRole("region", { name: "Awaiting my decision" });
    expect(q).toHaveTextContent("Verify financials for acceptance");
    fireEvent.click(within(main).getByRole("button", { name: "Review" }));
    expect(window.location.hash).toBe("#/approvals/g1");
    expect(await screen.findByRole("dialog", { name: /Verify financials for acceptance/ })).toBeInTheDocument();
  });
  it("administrator: system position, compliance, system health and activity", async () => {
    await signInAs("admin", { name: "Test Administrator" });
    render(<App />);
    const main = await screen.findByRole("main");
    expect(await within(main).findByRole("group", { name: "System position" })).toBeInTheDocument();
    expect(within(main).getByRole("group", { name: "Compliance" })).toBeInTheDocument();
    expect(within(main).getByText("Records")).toBeInTheDocument();
    expect(within(main).getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Performance" })).toHaveAttribute("aria-expanded", "true");
  });
  it("a counsellor without analytics still sees their own performance section collapsed", async () => {
    await signInAs("counsellor");
    render(<App />);
    const main = await screen.findByRole("main");
    const perf = await within(main).findByRole("button", { name: /Performance/ });
    expect(perf).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(perf);
    expect(within(main).getByText("Not enough history yet")).toBeInTheDocument();
  });
  it("greeting and enquiry delta helpers", () => {
    expect(greeting("Nimal Perera", new Date("2026-09-12T08:00:00"))).toBe("Good morning, Nimal");
    expect(greeting("Nimal Perera", new Date("2026-09-12T19:00:00"))).toBe("Good evening, Nimal");
    const now = Date.parse("2026-09-12T00:00:00.000Z");
    const d = enquiryDelta([blankCase({ createdAt: "2026-09-01T00:00:00.000Z" }), blankCase({ id: "c2", createdAt: "2026-07-25T00:00:00.000Z" })], now);
    expect(d).toEqual({ last: 1, prev: 1 });
  });
});

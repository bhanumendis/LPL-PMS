/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import App from "@/App";
import { signInAs } from "@/test/session";

describe("AppShell", () => {
  it("renders the dock for an administrator and no sidebar", async () => {
    await signInAs("admin");
    render(<App />);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("dock");
    const names = within(nav).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Overview", "Cases", "Approvals", "Escalations", "People", "Governance", "More"]);
    expect(document.querySelector("aside.sidebar")).toBeNull();
    expect(document.getElementById("main")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Account: admin user/ })).toBeInTheDocument();
  });
  it("renders the student destinations for a student", async () => {
    await signInAs("student");
    render(<App />);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["My placement", "Profile", "Documents", "Journey"]);
    expect(await screen.findByText("No application is linked to this account")).toBeInTheDocument();
  });
  it("renders My caseload and Approvals for a counsellor", async () => {
    await signInAs("counsellor");
    render(<App />);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Home", "My caseload", "Approvals"]);
    expect(await screen.findByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), counsellor/ })).toBeInTheDocument();
  });
  it("shows the section nav for grouped destinations and reaches Roles and permissions", async () => {
    await signInAs("admin");
    window.location.hash = "#/staff";
    render(<App />);
    const sections = await screen.findByRole("navigation", { name: "People sections" });
    const links = within(sections).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Staff", "Roles and permissions"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    fireEvent.click(links[1]);
    expect(await screen.findByRole("heading", { level: 1, name: "Roles and permissions" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "People sections" })).getByRole("link", { name: "Roles and permissions" })).toHaveAttribute("aria-current", "page");
  });
  it("gives a Team Leader the Audit log through Governance", async () => {
    await signInAs("team_leader");
    window.location.hash = "#/dataprotection";
    render(<App />);
    const sections = await screen.findByRole("navigation", { name: "Governance sections" });
    expect(within(sections).getAllByRole("link").map((l) => l.textContent)).toEqual(["Data protection", "Audit log"]);
  });
  it("shows no section nav on an ungrouped page", async () => {
    await signInAs("counsellor");
    render(<App />);
    await screen.findByRole("navigation", { name: "Main" });
    expect(screen.queryByRole("navigation", { name: /sections$/ })).toBeNull();
  });
});

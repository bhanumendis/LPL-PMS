/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Automated WCAG 2.1 A/AA checks with axe-core over the rendered shell and the main screens
 * for every role, in both themes. Colour contrast is excluded here because jsdom does not
 * compute styles; scripts/contrast.mjs verifies every token pair at AAA instead.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import App from "@/App";
import { addUser, seedCases, signInAs } from "@/test/session";
import { blankCase, ISO, user } from "@/test/fixtures";
import { store } from "@/lib/store";
import { EVENTS } from "@/lib/audit";
import type { Role } from "@/lib/types";

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

async function seed(role: Role) {
  const me = await signInAs(role, { id: `me-${role}`, name: `Test ${role}` });
  const couns = role === "counsellor" ? me : user({ id: "couns", role: "counsellor", name: "Case Counsellor" });
  if (role !== "counsellor") await addUser(couns);
  await seedCases([
    blankCase({ id: "c1", counsellorId: couns.id, gates: [{ id: "g1", gate: 16, round: 1, submittedAt: ISO, submittedBy: couns.id, status: "pending" }] }),
    blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: couns.id, studentUserId: role === "student" ? me.id : undefined, student: { name: "Sithmi Jayasinghe", email: "s@example.com", phone: "0771111111" } }),
  ]);
  await store.audit(EVENTS.caseOpened({ id: "c1", ref: "LPL-2026-0001" }, "Walk-in"), me);
  return me;
}

async function visit(hash: string, ready: () => Promise<unknown>) {
  window.location.hash = hash;
  const view = render(<App />);
  await ready();
  const found = await violations();
  view.unmount();
  return found;
}

const SCREENS: { role: Role; hash: string; ready: () => Promise<unknown> }[] = [
  { role: "admin", hash: "#/", ready: () => screen.findByRole("group", { name: "System position" }, { timeout: 5000 }) },
  { role: "admin", hash: "#/cases", ready: () => screen.findByRole("search", { name: "Filter cases" }, { timeout: 5000 }) },
  { role: "admin", hash: "#/audit", ready: () => screen.findByText("Opened case LPL-2026-0001", {}, { timeout: 5000 }) },
  { role: "admin", hash: "#/case/c1", ready: () => screen.findByRole("tablist", { name: "Case sections" }, { timeout: 5000 }) },
  { role: "super_admin", hash: "#/roles/admin", ready: () => screen.findByRole("tablist", { name: "Roles" }, { timeout: 5000 }) },
  { role: "super_admin", hash: "#/settings", ready: () => screen.findByRole("heading", { level: 2, name: "System configuration" }, { timeout: 5000 }) },
  { role: "admin", hash: "#/roles/counsellor", ready: () => screen.findByRole("tablist", { name: "Roles" }, { timeout: 5000 }) },
  { role: "admin", hash: "#/staff", ready: () => screen.findByRole("navigation", { name: "People sections" }, { timeout: 5000 }) },
  { role: "team_leader", hash: "#/", ready: () => screen.findByRole("group", { name: "Team position" }, { timeout: 5000 }) },
  { role: "team_leader", hash: "#/approvals", ready: () => screen.findByRole("group", { name: "Approval position" }, { timeout: 5000 }) },
  { role: "counsellor", hash: "#/", ready: () => screen.findByRole("group", { name: "Your position" }, { timeout: 5000 }) },
  { role: "counsellor", hash: "#/cases", ready: () => screen.findByRole("search", { name: "Filter cases" }, { timeout: 5000 }) },
  { role: "student", hash: "#/", ready: () => screen.findByRole("navigation", { name: "Main" }, { timeout: 5000 }) },
];

describe("accessibility (axe, WCAG 2.1 A/AA)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const s of SCREENS) {
      it(`${s.role} ${s.hash} in ${theme}`, async () => {
        await seed(s.role);
        localStorage.setItem("lpl:pms:theme", theme);
        expect(await visit(s.hash, s.ready)).toEqual([]);
      }, 20000);
    }
  }

  it("the notification center has no violations", async () => {
    await seed("counsellor");
    window.location.hash = "#/";
    render(<App />);
    await screen.findByRole("group", { name: "Your position" }, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await screen.findByRole("dialog", { name: /Notifications/ });
    expect(await violations()).toEqual([]);
  }, 20000);
});

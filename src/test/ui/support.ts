/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * What the browser specs share: the seeded accounts, every role's pages, signing in through
 * the form, and waiting for a page to settle.
 */
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export type Role = "super_admin" | "admin" | "team_leader" | "counsellor" | "student";
interface Manifest { workspaceCase: string; studentCase: string }

const manifest = JSON.parse(readFileSync(process.env.LPL_UI_MANIFEST ?? ".e2e-ui-manifest.json", "utf8")) as Manifest;

export const ROUTES: Record<Role, string[]> = {
  super_admin: ["#/", "#/cases", "#/staff", "#/roles/admin", "#/audit", "#/dataprotection", "#/settings", "#/prompts"],
  admin: ["#/", "#/cases", `#/case/${manifest.workspaceCase}`, "#/escalations", "#/staff", "#/roles/counsellor"],
  team_leader: ["#/", "#/approvals", "#/escalations", "#/cases"],
  counsellor: ["#/", "#/cases", `#/case/${manifest.workspaceCase}`, `#/case/${manifest.workspaceCase}/timeline`],
  student: ["#/", "#/profile", "#/documents", "#/journey"],
};

export const EMAILS: Record<Role, string> = {
  super_admin: "root@test.local", admin: "admin@test.local", team_leader: "tl@test.local", counsellor: "c1@test.local", student: "student@test.local",
};

export const PASSWORD = process.env.LPL_E2E_PASSWORD ?? "";

/** Signs in through the sign-in form, as a person would, with the theme preset. */
export async function signIn(page: Page, role: Role, theme: "light" | "dark") {
  await page.addInitScript((t) => { localStorage.setItem("lpl:pms:theme", t); }, theme);
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(EMAILS[role]);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("navigation", { name: "Main" }).first().waitFor({ timeout: 30_000 });
}

/** Waits for the page to settle: the main region is there and nothing is loading. (Never
 * "networkidle": the application polls for changes while it is open.) */
export async function settled(page: Page) {
  await page.locator("#main").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(300);
  await expect.poll(async () => page.locator('[aria-busy="true"], .skeleton').count(), { timeout: 30_000 }).toBe(0);
  await page.waitForTimeout(400);
}

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return errors;
}

export const slug = (hash: string) => hash.replace(/^#\/?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "home";

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Every role's pages in the production bundle against lpl-api (scripts/e2e-ui.sh), at every
 * release viewport: no page scrolls sideways, nothing logs an error, axe finds no WCAG 2.2
 * A/AA violation (colour contrast included: a real browser computes it), and a screenshot of
 * each page is kept under test-results/ui for review.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type Role = "super_admin" | "admin" | "team_leader" | "counsellor" | "student";
interface Manifest { workspaceCase: string; studentCase: string }

const manifest = JSON.parse(readFileSync(process.env.LPL_UI_MANIFEST ?? ".e2e-ui-manifest.json", "utf8")) as Manifest;

const ROUTES: Record<Role, string[]> = {
  super_admin: ["#/", "#/cases", "#/staff", "#/roles/admin", "#/audit", "#/dataprotection", "#/settings", "#/prompts"],
  admin: ["#/", "#/cases", `#/case/${manifest.workspaceCase}`, "#/escalations", "#/staff", "#/roles/counsellor"],
  team_leader: ["#/", "#/approvals", "#/escalations", "#/cases"],
  counsellor: ["#/", "#/cases", `#/case/${manifest.workspaceCase}`, `#/case/${manifest.workspaceCase}/timeline`],
  student: ["#/", "#/profile", "#/documents", "#/journey"],
};

const EMAILS: Record<Role, string> = {
  super_admin: "root@test.local", admin: "admin@test.local", team_leader: "tl@test.local", counsellor: "c1@test.local", student: "student@test.local",
};

/** Signs in through the sign-in form, as a person would, with the theme preset. */
async function signIn(page: Page, role: Role, theme: "light" | "dark") {
  await page.addInitScript((t) => { localStorage.setItem("lpl:pms:theme", t); }, theme);
  await page.goto("/");
  await page.locator('input[autocomplete="username"]').fill(EMAILS[role]);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.LPL_E2E_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("navigation", { name: "Main" }).first().waitFor({ timeout: 30_000 });
}

/** Waits for the page to settle: the main region is there and nothing is loading. (Never
 * "networkidle": the application polls for changes while it is open.) */
async function settled(page: Page) {
  await page.locator("#main").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(300);
  await expect.poll(async () => page.locator('[aria-busy="true"], .skeleton').count(), { timeout: 30_000 }).toBe(0);
  await page.waitForTimeout(400);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return errors;
}

async function check(page: Page, info: TestInfo, name: string, errors: string[]) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect.soft(overflow, `${name}: the page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const found = axe.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
  expect.soft(found, `${name}: axe`).toEqual([]);
  expect.soft(errors, `${name}: errors`).toEqual([]);
  const dir = `test-results/ui/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${dir}/${name}.top.png` });
}

const slug = (hash: string) => hash.replace(/^#\/?/, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "") || "home";

for (const role of Object.keys(ROUTES) as Role[]) {
  test(`${role} pages`, async ({ page }, info) => {
    const theme = info.project.name.startsWith("dark") ? "dark" : "light";
    await page.emulateMedia({ reducedMotion: "reduce" });
    await signIn(page, role, theme);
    const errors = watchErrors(page);
    for (const hash of ROUTES[role]) {
      errors.length = 0;
      await page.goto(`/${hash}`);
      await settled(page);
      await check(page, info, `${role}-${slug(hash)}`, errors);
    }
  });
}

test("sign-in", async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /sign in/i }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800); // let the entrance finish before measuring
  await check(page, info, "sign-in", errors);
});

test("sign-in entrance: plays once, settles, and never runs under reduced motion", async ({ page }) => {
  const anim = () => page.locator(".auth-card").evaluate((el) => getComputedStyle(el).animationName);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator(".auth-card").waitFor();
  expect(await anim()).toBe("auth-settle");
  await expect.poll(() => page.locator(".auth-card").evaluate((el) => getComputedStyle(el).opacity), { timeout: 3000 }).toBe("1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator(".auth-card").waitFor();
  expect(await anim()).toBe("none");
  expect(await page.locator(".auth-side > *").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

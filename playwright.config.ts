/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The browser suite: run through scripts/e2e-ui.sh, which builds the production bundle for a
 * local lpl-api and serves it. One project per release viewport; dark theme at desktop width.
 */
import { defineConfig } from "@playwright/test";

// [name, width, height, touch, a phone's browser (meta viewport, no hover)]
const viewports: [string, number, number, boolean, boolean][] = [
  ["1440x900", 1440, 900, false, false],
  ["1280x800", 1280, 800, false, false],
  ["1024x768", 1024, 768, false, false],
  ["768x1024", 768, 1024, true, false],
  ["390x844", 390, 844, true, true],
  ["375x812", 375, 812, true, true],
  ["360x800", 360, 800, true, true],
  ["844x390", 844, 390, true, true], // a phone turned sideways
];

// scripts/e2e-ui.sh runs the suite twice: the pages in parallel, then (LPL_UI_RUN=vitals) the
// Web Vitals one test at a time. Each run keeps its own artifacts and report. The vitals run
// covers one viewport per layout: 1280×800 lays out as 1440×900, 390 and 375 as 360 (the
// narrowest, where text wraps most), and dark changes colours only.
const vitals = process.env.LPL_UI_RUN === "vitals";
const VITALS_VIEWPORTS = ["1440x900", "1024x768", "768x1024", "360x800", "844x390"];

export default defineConfig({
  testDir: "src/test/ui",
  testMatch: vitals ? /vitals\.spec\.ts$/ : /.*\.spec\.ts$/,
  testIgnore: vitals ? [] : [/vitals\.spec\.ts$/],
  outputDir: `test-results/ui-artifacts${process.env.LPL_UI_RUN ? `-${process.env.LPL_UI_RUN}` : ""}`,
  fullyParallel: !vitals,
  workers: vitals ? 1 : process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: `test-results/ui-report${process.env.LPL_UI_RUN ? `-${process.env.LPL_UI_RUN}` : ""}` }]] : [["list"]],
  use: {
    baseURL: process.env.LPL_UI_URL,
    trace: "retain-on-failure",
    // The container's preinstalled Chromium matches @playwright/test 1.56.1; CI installs its own.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    ...viewports.map(([name, width, height, touch, phone]) => ({
      name,
      use: { viewport: { width, height }, hasTouch: touch, isMobile: phone, deviceScaleFactor: 1 },
    })),
    { name: "dark-1440x900", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" as const } },
  ].filter((p) => !vitals || VITALS_VIEWPORTS.includes(p.name)),
});

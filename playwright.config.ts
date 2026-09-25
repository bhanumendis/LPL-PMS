/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The browser suite: run through scripts/e2e-ui.sh, which builds the production bundle for a
 * local lpl-api and serves it. One project per release viewport; dark theme at desktop width.
 */
import { defineConfig } from "@playwright/test";

const viewports: [string, number, number, boolean][] = [
  ["1440x900", 1440, 900, false],
  ["1280x800", 1280, 800, false],
  ["1024x768", 1024, 768, false],
  ["768x1024", 768, 1024, true],
  ["390x844", 390, 844, true],
  ["375x812", 375, 812, true],
  ["360x800", 360, 800, true],
];

export default defineConfig({
  testDir: "src/test/ui",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "test-results/ui-artifacts",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "test-results/ui-report" }]] : [["list"]],
  use: {
    baseURL: process.env.LPL_UI_URL,
    trace: "retain-on-failure",
    // The container's preinstalled Chromium matches @playwright/test 1.56.1; CI installs its own.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    ...viewports.map(([name, width, height, touch]) => ({
      name,
      use: { viewport: { width, height }, hasTouch: touch, isMobile: touch && width < 768, deviceScaleFactor: 1 },
    })),
    { name: "dark-1440x900", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" as const } },
  ],
});

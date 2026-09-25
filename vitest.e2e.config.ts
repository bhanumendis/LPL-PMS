/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The client end-to-end suite: run by scripts/e2e-api.sh against a live lpl-api.
 */
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/test/e2e/**/*.e2e.ts"],
      css: false,
      testTimeout: 60_000,
      hookTimeout: 120_000,
      fileParallelism: false,
    },
  }),
);

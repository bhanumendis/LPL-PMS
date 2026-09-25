/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Unit tests run without a build-time connection even when the production build that runs
// them (npm run build) has one; the tests that need a server stub it themselves.
const noConnection = { VITE_API_URL: "", VITE_API_ANON_KEY: "", VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" };
for (const k of Object.keys(noConnection)) delete process.env[k];

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
      env: noConnection,
    },
  }),
);

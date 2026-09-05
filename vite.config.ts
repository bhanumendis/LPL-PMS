/**
 * Lyceum Placements - Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    target: "es2019",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    reportCompressedSize: false,
    minify: "esbuild",
  },
  // Keep the /*! @license */ notices in the minified bundle so the copyright is visible in the built file.
  esbuild: { legalComments: "inline" },
});

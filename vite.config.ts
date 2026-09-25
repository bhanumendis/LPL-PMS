/**
 * Lyceum Placements - Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

/**
 * A production build is always built for one server and must never carry a privileged key.
 * The build stops, with every problem listed, when the API connection is missing, not HTTPS
 * (localhost excepted, for the end-to-end stack), or when the key is a service-role or secret
 * key rather than the public one.
 */
export function requireApiConnection(): Plugin {
  return {
    name: "lpl-require-api-connection",
    apply: "build",
    configResolved(c) {
      if (c.mode !== "production") return;
      const url = c.env.VITE_API_URL || c.env.VITE_SUPABASE_URL;
      const key = c.env.VITE_API_ANON_KEY || c.env.VITE_SUPABASE_ANON_KEY;
      const problems: string[] = [];
      if (!url) problems.push("VITE_API_URL is required: the address of lpl-api, e.g. https://api.pms.lyceum.lk");
      else {
        try {
          const u = new URL(url);
          if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) problems.push(`VITE_API_URL must use https (got ${u.origin})`);
        } catch { problems.push(`VITE_API_URL is not a URL: ${url}`); }
      }
      if (!key) problems.push("VITE_API_ANON_KEY is required: the public (anon/publishable) key");
      else if (/^sb_secret_/.test(key) || jwtRole(key) === "service_role") problems.push("VITE_API_ANON_KEY is a service-role/secret key. Only the public anon key may be built into the application.");
      if (problems.length) throw new Error(`Production build refused:\n  - ${problems.join("\n  - ")}`);
    },
  };
}

function jwtRole(token: string): string | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try { return (JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { role?: string }).role; } catch { return undefined; }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), requireApiConnection()],
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

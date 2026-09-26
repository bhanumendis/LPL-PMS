/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Finishes the production build: sw.js beside the page, the Content-Security-Policy (inline
 * scripts by hash, connect-src exactly the built-for API) and the banner.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { loadEnv } from "vite";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const src = "dist/index.html";
let html = fs.readFileSync(src, "utf8");

// The service worker is the one thing that cannot live inside the single file: browsers
// register it by URL. It is built here, next to the page, and only activates on hosted
// (HTTPS) builds; the file:// deliverable simply never registers it.
await build({ entryPoints: ["src/sw.ts"], bundle: true, minify: true, format: "iife", target: "es2019", outfile: "dist/sw.js", legalComments: "inline", logLevel: "silent" });

// Content-Security-Policy: every inline script is allowed by hash, so nothing else can run;
// styles need 'unsafe-inline' because React sets style attributes; connect-src admits exactly
// the API the build was made for (the production build refuses to run without one, see
// vite.config.ts), plus any origins in LPL_CONNECT_SRC; worker-src admits sw.js.
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).filter((s) => s.trim().length)
  .map((s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`);
const env = loadEnv("production", process.cwd(), "VITE_");
const apiUrl = env.VITE_API_URL || env.VITE_SUPABASE_URL;
if (!apiUrl) throw new Error("finalize: VITE_API_URL is not set; the production build has no API to admit.");
// Extra origins, space-separated, e.g. a second API during a cutover: LPL_CONNECT_SRC="https://api2.example.com".
const extraConnect = (process.env.LPL_CONNECT_SRC ?? "").split(/\s+/).filter(Boolean);
const csp = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  `connect-src ${[...new Set([new URL(apiUrl).origin, ...extraConnect])].join(" ")}`,
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
html = html.replace(/<meta charset="UTF-8" \/>/, `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);

const banner = `<!--
  Lyceum Placements — Placement Management System (v${version})
  Developed by Bhanu Mendis - Group IT
  Production build for ${new URL(apiUrl).origin}. Every record is held on that server; the
  application never stores records in the browser. sw.js (beside this file on a hosted
  build) receives Web Push notifications.
-->
`;
html = html.replace(/^(<!doctype html>\s*)/i, "$1" + banner);
fs.writeFileSync("dist/LPL_Placement_Management_System.html", html);
fs.writeFileSync(src, html);
const keep = new Set(["index.html", "LPL_Placement_Management_System.html", "sw.js"]);
for (const f of fs.readdirSync("dist")) if (!keep.has(f)) fs.rmSync(`dist/${f}`, { recursive: true, force: true });
console.log(`built v${version}`, (fs.statSync("dist/LPL_Placement_Management_System.html").size / 1024).toFixed(0) + " KB", "+ sw.js", (fs.statSync("dist/sw.js").size / 1024).toFixed(1) + " KB");

import fs from "node:fs";
import { createHash } from "node:crypto";

const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const src = "dist/index.html";
let html = fs.readFileSync(src, "utf8");

// Content-Security-Policy: every inline script is allowed by hash, so nothing else can run;
// styles need 'unsafe-inline' because React sets style attributes; the Supabase project URL is
// entered at runtime, so connect-src is the platform wildcard.
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).filter((s) => s.trim().length)
  .map((s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`);
const csp = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src https://*.supabase.co https://*.supabase.in",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
html = html.replace(/<meta charset="UTF-8" \/>/, `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);

const banner = `<!--
  Lyceum Placements — Placement Management System (v${version})
  Copyright (c) 2026 Bhanu Mendis. All rights reserved.
  Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
  Single-file production build. Records are held on the connected Supabase project; without a
  connection the file stores records in this browser only (see src/lib/store.ts).
-->
`;
html = html.replace(/^(<!doctype html>\s*)/i, "$1" + banner);
fs.writeFileSync("dist/LPL_Placement_Management_System.html", html);
fs.writeFileSync(src, html);
for (const f of fs.readdirSync("dist")) if (f !== "index.html" && f !== "LPL_Placement_Management_System.html") fs.rmSync(`dist/${f}`, { recursive: true, force: true });
console.log(`built v${version}`, (fs.statSync("dist/LPL_Placement_Management_System.html").size / 1024).toFixed(0) + " KB");

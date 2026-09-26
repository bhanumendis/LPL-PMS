/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Bundle budget: the single-file build must stay within its size budget, raw and gzipped
 * (what a browser downloads). Run after `npm run build`; CI fails the build above it.
 * Raise a budget deliberately, in this file, with the reason in the commit.
 */
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BUDGET = { raw: 900 * 1024, gzip: 320 * 1024, sw: 8 * 1024 };
const html = readFileSync("dist/index.html");
const sizes = { raw: html.length, gzip: gzipSync(html, { level: 9 }).length, sw: statSync("dist/sw.js").size };
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let over = false;
for (const k of Object.keys(BUDGET)) {
  const ok = sizes[k] <= BUDGET[k];
  over ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${k.padEnd(4)} ${kb(sizes[k]).padStart(9)} of ${kb(BUDGET[k])}`);
}
if (over) {
  console.error("Bundle budget exceeded. Find what grew (npx vite build --mode production and inspect), or raise the budget here with a reason.");
  process.exit(1);
}

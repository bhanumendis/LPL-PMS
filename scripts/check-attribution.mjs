/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Attribution check (CI): every source file the project owns names its author near the top,
 * in the form for its side — backend (server/, supabase/, workflows, shell scripts, SQL):
 * "Copyright © Bhanu Mendis - LGH IT"; frontend and its tooling: "Developed by Bhanu Mendis -
 * Group IT" — and no file keeps the old reserved-rights line. Third-party and generated files
 * (lock files, go.sum, fixtures, dist) are not ours to mark and are skipped.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BACKEND = "Copyright © Bhanu Mendis - LGH IT";
const FRONTEND = "Developed by Bhanu Mendis - Group IT";
const SOURCE = /\.(ts|tsx|js|mjs|go|sql|css|sh|ya?ml|html)$|(^|\/)Dockerfile$/;
const SKIP = /(^|\/)(package-lock\.json|go\.sum)$|^dist\/|\/testdata\/|\.(png|jpe?g|ico|webp|woff2?)$/;

// The old formula, built so this file does not contain it.
const RESERVED = new RegExp(["all", "rights", "reserved"].join(" "), "i");
// Tracked and new (not ignored) files, so a file is checked before its first commit.
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter((f) => f && !SKIP.test(f));
const problems = [];
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (RESERVED.test(text)) problems.push(`${f}: keeps the old reserved-rights line`);
  if (!SOURCE.test(f)) continue;
  const backend = /^(server|supabase|\.github)\//.test(f) || /\.(sh|sql)$/.test(f);
  const want = backend ? BACKEND : FRONTEND;
  const head = text.split("\n").slice(0, 15).join("\n");
  if (!head.includes(want)) problems.push(`${f}: missing "${want}" in its first 15 lines`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} attribution problem(s).`);
  process.exit(1);
}
console.log(`attribution ok: ${files.length} files checked`);

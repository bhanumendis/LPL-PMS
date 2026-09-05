/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 *
 * WCAG contrast verification for the design tokens in src/styles/app.css.
 *
 * Every text pair must reach 7:1 (AAA, normal text) and every graphic pair 3:1 (non-text).
 * The pairs below are the ones the stylesheet actually composes; the script reads the token
 * values out of the CSS so the numbers cannot drift from the build. Exit code 1 on any failure.
 *
 *   npm run contrast
 */
import fs from "node:fs";

const css = fs.readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");

function block(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error("selector not found: " + selector);
  const start = css.indexOf("{", i), end = css.indexOf("}", start);
  const out = {};
  for (const line of css.slice(start + 1, end).split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const light = block(":root {");
const dark = { ...light, ...block('html[data-theme="dark"] {') };

function parse(v, themeBg) {
  if (v.startsWith("#")) {
    const h = v.length === 4 ? v.slice(1).split("").map((c) => c + c).join("") : v.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
    const alpha = Number(a);
    // Composite a translucent token over the theme ground, which is how it is painted.
    return [r, g, b].map((c, i) => Math.round(Number(c) * alpha + themeBg[i] * (1 - alpha)));
  }
  throw new Error("unparseable colour: " + v);
}

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }

/** [foreground token, background token, minimum ratio, where it is used] */
const PAIRS = [
  ["--ink", "--bg", 7, "body text"],
  ["--ink", "--bg2", 7, "text on soft surfaces"],
  ["--ink", "--glass-solid", 7, "inputs, chips"],
  ["--ink", "--accent-soft", 7, "current nav item, tasks"],
  ["--ink2", "--bg", 7, "secondary text"],
  ["--ink2", "--bg2", 7, "secondary text on soft surfaces"],
  ["--ink2", "--accent-soft", 7, "notice-info, task detail"],
  ["--ink2", "--green-soft", 7, "notice-ok"],
  ["--ink2", "--warn-soft", 7, "notice-warn"],
  ["--ink2", "--exit-soft", 7, "notice-bad, task warn"],
  ["--ink2", "--navy-soft", 7, "notice-navy"],
  ["--muted", "--bg", 7, "labels, hints, captions"],
  ["--muted", "--bg2", 7, "table group rows, soft surfaces"],
  ["--muted", "--glass-solid", 7, "empty states, restricted fields"],
  ["--muted", "--accent-soft", 7, "step number on the highlighted step, prompt list meta on the selected item"],
  ["--muted", "--navy-soft", 7, "captions on navy tint"],
  ["--muted", "--green-soft", 7, "captions on ok tint"],
  ["--muted", "--warn-soft", 7, "captions on warn tint"],
  ["--muted", "--exit-soft", 7, "captions on bad tint"],
  ["--accent-text", "--bg", 7, "links, ghost buttons"],
  ["--accent-text", "--bg2", 7, "links on soft surfaces"],
  ["--accent-text", "--accent-soft", 7, "info pill, tab count, avatar"],
  ["--navy-text", "--bg", 7, "navy pill text"],
  ["--navy-text", "--navy-soft", 7, "navy pill, deferred notice icon"],
  ["--green-text", "--bg", 7, "ok KPI value, accepted text"],
  ["--green-text", "--green-soft", 7, "ok pill"],
  ["--warn-text", "--bg", 7, "warn KPI value"],
  ["--warn-text", "--warn-soft", 7, "warn pill"],
  ["--exit", "--bg", 7, "error text, danger ghost"],
  ["--exit", "--bg2", 7, "returned note on soft surfaces"],
  ["--exit", "--exit-soft", 7, "bad pill"],
  ["--on-accent", "--accent", 7, "primary button label, badge"],
  ["--on-green", "--green-text", 7, "on-ok button label"],
  ["--on-exit", "--exit", 7, "danger button label"],
  ["--bg", "--ink", 7, "skip link, dark button, pressed chip"],
  ["--auth-fg", "--auth-bg", 7, "sign-in side panel heading"],
  ["--auth-muted", "--auth-bg", 7, "sign-in side panel captions"],
  // graphics (non-text): 3:1
  ["--accent", "--bg", 3, "rings, bars, focus ring"],
  ["--accent", "--glass-solid", 3, "switch on, checkbox"],
  ["--green", "--bg", 3, "done markers"],
  ["--warn", "--bg", 3, "warn markers"],
  ["--exit", "--bg", 3, "bad markers"],
  ["--line-strong", "--bg", 3, "input borders"],
  ["--line-strong", "--glass-solid", 3, "input borders on solid"],
  ["--focus", "--bg", 3, "focus outline"],
  ["--on-accent", "--accent", 3, "icon on current stage marker"],
  ["--on-green", "--green", 3, "check icon on done marker"],
  ["--glass-solid", "--accent", 3, "switch knob on the checked track"],
  ["--glass-solid", "--line-strong", 3, "switch knob on the unchecked track"],
];

let failures = 0;
for (const [name, theme] of [["light", light], ["dark", dark]]) {
  const ground = parse(theme["--bg"], [0, 0, 0]);
  console.log(`\n${name} theme`);
  for (const [fg, bg, min, where] of PAIRS) {
    const b = parse(theme[bg], ground);
    const f = parse(theme[fg], b);
    const r = ratio(f, b);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${r.toFixed(2).padStart(6)}:1  (min ${min}:1)  ${fg} on ${bg}  — ${where}`);
  }
}
console.log(failures ? `\n${failures} pair(s) below target` : "\nAll pairs meet target (AAA text 7:1, graphics 3:1)");
process.exit(failures ? 1 : 0);

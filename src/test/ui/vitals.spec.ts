/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Core Web Vitals in the production bundle, as each role uses it. scripts/e2e-ui.sh runs these
 * tests on their own, one at a time, so nothing else competes for the CPU they measure.
 *
 * Phones and tablets run under Lighthouse's mobile conditions (150 ms round trips, 1.6 Mbps
 * down, a CPU four times slower), desktops under its desktop conditions (40 ms, 10 Mbps). Each
 * role signs in from a cold cache, typing as a person does; loads every one of its pages from
 * scratch (revalidating the cached bundle, as a returning browser does) and opens its account
 * menu there; then tours the main navigation. Every document's LCP, CLS and INP are taken the
 * way the web-vitals library takes them from Chrome. Each must stay out of "poor", and the 75th
 * percentile of a role's documents must be "good", which is how Chrome's field data judges a
 * site. A table of every document is kept under test-results/ui/vitals.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { EMAILS, PASSWORD, ROUTES, settled, slug, watchErrors, type Role } from "./support";

const GOOD = { lcp: 2500, cls: 0.1, inp: 200 };
const POOR = { lcp: 4000, cls: 0.25, inp: 500 };

interface Profile { name: string; rtt: number; downKbps: number; upKbps: number; cpu: number }
const MOBILE: Profile = { name: "mobile", rtt: 150, downKbps: 1600, upKbps: 750, cpu: 4 };
const DESKTOP: Profile = { name: "desktop", rtt: 40, downKbps: 10240, upKbps: 10240, cpu: 1 };

interface Vitals { lcp: number; cls: number; inp: number; lcpNode: string; clsNodes: string[]; inpEvent: string }
interface Row extends Vitals { doc: string }

/** Installed in every document before the application runs. */
function observe() {
  const describe = (n: Node | null | undefined): string => {
    const el = n instanceof Element ? n : n?.parentElement;
    if (!el) return "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`;
  };
  const v = { lcp: 0, cls: 0, inp: 0, lcpNode: "", clsNodes: [] as string[], inpEvent: "" };
  (window as unknown as { __vitals: typeof v }).__vitals = v;
  type LcpEntry = PerformanceEntry & { element?: Element | null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as LcpEntry[]) { v.lcp = e.startTime; v.lcpNode = describe(e.element); }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  // CLS: the largest session window of shifts (gaps under 1 s, windows under 5 s).
  type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] };
  let win = 0, first = 0, last = 0, nodes: string[] = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as ShiftEntry[]) {
      if (e.hadRecentInput) continue;
      const src = (e.sources ?? []).map((s) => describe(s.node)).filter(Boolean);
      if (win && e.startTime - last < 1000 && e.startTime - first < 5000) { win += e.value; nodes.push(...src); } else { win = e.value; first = e.startTime; nodes = src; }
      last = e.startTime;
      if (win > v.cls) { v.cls = win; v.clsNodes = [...new Set(nodes)].slice(0, 4); }
    }
  }).observe({ type: "layout-shift", buffered: true });
  // INP: the slowest interaction (under 50 of them, the slowest is the 98th percentile).
  type EventEntry = PerformanceEntry & { interactionId?: number; target?: Node | null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries() as EventEntry[]) {
      if (!e.interactionId || e.duration <= v.inp) continue;
      v.inp = e.duration;
      v.inpEvent = `${e.name} on ${describe(e.target)}`;
    }
  }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
}

async function read(page: Page, doc: string): Promise<Row> {
  await page.waitForTimeout(250); // the last frame's entries reach the observers
  const v = await page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
  return { doc, ...v };
}

/** Lighthouse's network and CPU conditions, on this page, across its navigations. */
async function throttle(page: Page, p: Profile) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: p.rtt, downloadThroughput: (p.downKbps * 1024) / 8, uploadThroughput: (p.upKbps * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  await cdp.send("Network.clearBrowserCache");
}

/** Opens and closes the account menu, where there is one: an interaction every page offers. */
async function openAccountMenu(page: Page) {
  const account = page.getByRole("button", { name: /^Account:/ });
  if (!(await account.isVisible())) return;
  await account.click();
  await page.getByRole("dialog", { name: "Account" }).waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Account" })).toHaveCount(0);
}

const p75 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.75) - 1)];
const ms = (x: number) => `${Math.round(x)} ms`;

for (const role of Object.keys(ROUTES) as Role[]) {
  test(`${role}: Core Web Vitals`, async ({ page }, info) => {
    const theme = info.project.name.startsWith("dark") ? "dark" : "light";
    const profile = info.project.use.hasTouch ? MOBILE : DESKTOP;
    await page.addInitScript((t) => { if (location.protocol.startsWith("http")) localStorage.setItem("lpl:pms:theme", t); }, theme);
    await page.addInitScript(observe);
    await throttle(page, profile);
    const errors = watchErrors(page);
    const rows: Row[] = [];

    // Sign in from a cold cache, typing the address once the form has painted (a person does
    // not type before they see it, and input ends LCP).
    await page.goto("/");
    const email = page.locator('input[autocomplete="username"]');
    await email.waitFor();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals.lcp), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await email.pressSequentially(EMAILS[role]);
    await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("navigation", { name: "Main" }).first().waitFor({ timeout: 60_000 });
    await settled(page);
    rows.push(await read(page, "sign-in"));

    // Every page, loaded from scratch, then used.
    for (const hash of ROUTES[role]) {
      await page.goto("about:blank");
      await page.goto(`/${hash}`);
      await settled(page);
      await openAccountMenu(page);
      rows.push(await read(page, slug(hash)));
    }

    // The main navigation, destination by destination, in one document.
    await page.goto("about:blank");
    await page.goto("/#/");
    await settled(page);
    const tabs = page.locator('nav[aria-label="Main"] button:not([aria-haspopup]):visible');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await settled(page);
    }
    rows.push(await read(page, `navigation (${n} destinations)`));

    const dir = "test-results/ui/vitals";
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${info.project.name}-${role}.json`, JSON.stringify({ profile, rows }, null, 2));
    const table = rows.map((r) => `${r.doc.padEnd(32)} LCP ${ms(r.lcp).padStart(8)} (${r.lcpNode})  CLS ${r.cls.toFixed(3)}${r.clsNodes.length ? ` (${r.clsNodes.join(", ")})` : ""}  INP ${ms(r.inp).padStart(7)}${r.inpEvent ? ` (${r.inpEvent})` : ""}`).join("\n");
    console.log(`${info.project.name} · ${role} · ${profile.name}\n${table}`);

    for (const r of rows) {
      expect.soft(r.lcp, `${r.doc}: an LCP was reported`).toBeGreaterThan(0);
      expect.soft(r.lcp, `${r.doc}: LCP is poor`).toBeLessThanOrEqual(POOR.lcp);
      expect.soft(r.cls, `${r.doc}: CLS is poor (${r.clsNodes.join(", ")})`).toBeLessThanOrEqual(POOR.cls);
      expect.soft(r.inp, `${r.doc}: INP is poor (${r.inpEvent})`).toBeLessThanOrEqual(POOR.inp);
    }
    expect.soft(p75(rows.map((r) => r.lcp)), `75th percentile LCP\n${table}`).toBeLessThanOrEqual(GOOD.lcp);
    expect.soft(p75(rows.map((r) => r.cls)), `75th percentile CLS\n${table}`).toBeLessThanOrEqual(GOOD.cls);
    expect.soft(p75(rows.map((r) => r.inp)), `75th percentile INP\n${table}`).toBeLessThanOrEqual(GOOD.inp);
    expect.soft(errors, "errors").toEqual([]);
  });
}

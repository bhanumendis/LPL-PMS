/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Vitest setup: DOM matchers plus the browser APIs jsdom does not provide.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest globals are off, so testing-library cannot register its own cleanup.
afterEach(() => { cleanup(); });

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const w = window as unknown as { ResizeObserver?: unknown };
if (!w.ResizeObserver) w.ResizeObserver = ResizeObserverStub;

// jsdom defines scrollTo as a "not implemented" stub that logs on every navigation.
window.scrollTo = (() => {}) as typeof window.scrollTo;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

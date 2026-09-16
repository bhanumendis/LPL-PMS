/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useRef } from "react";
import { render } from "@testing-library/react";
import { runViewTransition, setTransitionSource, useFlip, CASE_HEAD_TRANSITION } from "./motion";

type Doc = { startViewTransition?: unknown };

function reducedMotion(on: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: on && query.includes("reduce"), media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
}

describe("motion", () => {
  afterEach(() => { vi.restoreAllMocks(); delete (document as unknown as Doc).startViewTransition; });

  it("runs the update directly when the View Transitions API is absent", () => {
    const update = vi.fn();
    runViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("runs the update directly under reduced motion even when the API exists", () => {
    reducedMotion(true);
    const start = vi.fn();
    (document as unknown as Doc).startViewTransition = start;
    const update = vi.fn();
    runViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("names the source element for the old snapshot and clears it for the new one", () => {
    reducedMotion(false);
    const source = document.createElement("li");
    let nameAtStart = "";
    (document as unknown as Doc).startViewTransition = vi.fn((cb: () => void) => { nameAtStart = source.style.viewTransitionName; cb(); return { finished: Promise.resolve() }; });
    const update = vi.fn();
    setTransitionSource(source);
    runViewTransition(update);
    expect(nameAtStart).toBe(CASE_HEAD_TRANSITION);
    expect(source.style.viewTransitionName).toBe("");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("useFlip animates a row whose key moved", () => {
    reducedMotion(false);
    const animate = vi.fn();
    const proto = Element.prototype as unknown as { animate?: unknown };
    const had = proto.animate;
    proto.animate = animate;
    const tops: Record<string, number> = { a: 0, b: 40 };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const key = (this as HTMLElement).dataset?.flip ?? "";
      return { top: tops[key] ?? 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    function List({ order }: { order: string[] }) {
      const ref = useRef<HTMLUListElement>(null);
      useFlip(ref, [order.join()]);
      return createElement("ul", { ref }, order.map((k) => createElement("li", { key: k, "data-flip": k }, k)));
    }
    const { rerender } = render(createElement(List, { order: ["a", "b"] }));
    expect(animate).not.toHaveBeenCalled();
    tops.a = 40; tops.b = 0;
    rerender(createElement(List, { order: ["b", "a"] }));
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0][0][0].transform).toMatch(/translate\(0px, -?40px\)/);
    proto.animate = had;
  });
});

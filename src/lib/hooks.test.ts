/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { sessionId, useLocalPref, useMediaQuery } from "./hooks";

describe("hooks", () => {
  it("useLocalPref round-trips through localStorage", () => {
    const { result } = renderHook(() => useLocalPref("lpl:test:pref", { open: true }));
    expect(result.current[0]).toEqual({ open: true });
    act(() => result.current[1]({ open: false }));
    expect(result.current[0]).toEqual({ open: false });
    expect(JSON.parse(localStorage.getItem("lpl:test:pref")!)).toEqual({ open: false });
    const again = renderHook(() => useLocalPref("lpl:test:pref", { open: true }));
    expect(again.result.current[0]).toEqual({ open: false });
  });
  it("useMediaQuery returns false in jsdom", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 767px)"));
    expect(result.current).toBe(false);
  });
  it("sessionId is stable within the tab", () => {
    expect(sessionId()).toBe(sessionId());
    expect(sessionId().length).toBeGreaterThan(8);
  });
});

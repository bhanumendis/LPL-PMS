/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { store } from "./store";
import { useStoreSelect } from "./useStore";

describe("useStoreSelect", () => {
  it("re-renders only when the selected slice changes", async () => {
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useStoreSelect((s) => s.backend); });
    expect(result.current).toBe(store.kind);
    const before = renders;
    await act(async () => { await store.refresh(); });
    expect(result.current).toBe(store.kind);
    expect(renders).toBe(before);
  });
  it("keeps a structurally equal object reference stable", async () => {
    const { result, rerender } = renderHook(() => useStoreSelect((s) => ({ kind: s.backend, loaded: s.loaded }), (a, b) => a.kind === b.kind && a.loaded === b.loaded));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Production-build behaviour, with the runtime flag forced off: no runtime re-pointing of the
 * server, no browser storage, and error surfaces that show a reference instead of internals.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

afterEach(() => { vi.resetModules(); vi.doUnmock("./runtime"); localStorage.clear(); });

describe("production build", () => {
  it("ignores a connection stored in the browser and refuses to store one", async () => {
    vi.doMock("./runtime", () => ({ BROWSER_STORAGE_ALLOWED: false }));
    localStorage.setItem("lpl:pms:server", JSON.stringify({ url: "https://attacker.example", anonKey: "k" }));
    const { readServerConfig, writeServerConfig } = await import("./server");
    expect(readServerConfig()).toBeNull();
    writeServerConfig({ url: "https://attacker.example", anonKey: "k" });
    expect(JSON.parse(localStorage.getItem("lpl:pms:server")!).url).toBe("https://attacker.example");
    expect(readServerConfig()).toBeNull();
  });

  it("never falls back to browser storage: without a server the store is unconfigured and refuses writes", async () => {
    vi.doMock("./runtime", () => ({ BROWSER_STORAGE_ALLOWED: false }));
    const { store } = await import("./store");
    await store.refresh();
    expect(store.snap.backend).toBe("unconfigured");
    await expect(store.mutateCases((s) => s)).rejects.toThrow(/not connected/);
    expect(localStorage.getItem("lpl:pms:cases")).toBeNull();
  });
});

describe("error surfaces", () => {
  it("issues readable references", async () => {
    const { errorReference } = await import("./errors");
    const a = errorReference();
    expect(a).toMatch(/^E-[2-9A-HJKMNP-Z]{6}$/);
    expect(errorReference()).not.toBe(a);
  });

  it("a failing region shows a reference, not the exception text", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { RegionBoundary } = await import("./ui/boundary");
    function Boom(): JSX.Element { throw new Error("relation public.cases does not exist at line 7"); }
    render(<RegionBoundary label="test"><Boom /></RegionBoundary>);
    expect(await screen.findByText(/This section could not be drawn/)).toBeTruthy();
    expect(screen.queryByText(/relation public\.cases/)).toBeNull();
    expect(screen.getByText(/^E-/)).toBeTruthy();
    spy.mockRestore();
  });
});

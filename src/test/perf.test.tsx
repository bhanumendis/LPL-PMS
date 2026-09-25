/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Performance guards: a quiet poll re-renders nothing, the workspace load no longer carries
 * the audit log, and blur stays on the float tier.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import baseCss from "@/styles/base.css?raw";
import componentsCss from "@/styles/components.css?raw";
import shellCss from "@/styles/shell.css?raw";
import pagesCss from "@/styles/pages.css?raw";
import { store } from "@/lib/store";
import { useStoreSelect } from "@/lib/useStore";
import { SupabaseBackend } from "@/lib/server";
import { signInAs } from "@/test/session";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("performance guards", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("a refresh with nothing changed does not re-render a slice subscriber", async () => {
    await signInAs("admin");
    await store.refresh();
    let renders = 0;
    function Probe() { useStoreSelect((s) => s.cases.rev); renders++; return null; }
    render(<Probe />);
    const before = renders;
    await act(async () => { await store.refresh(); await store.refresh(); });
    expect(renders).toBe(before);
  });

  it("the server workspace load reads nothing that grows with the organisation", async () => {
    const urls: string[] = [];
    const token = `h.${btoa(JSON.stringify({ sub: "auth-1" }))}.s`;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/auth/v1/token")) return json({ access_token: token, refresh_token: "r", expires_in: 3600, user: { id: "auth-1" } });
      if (url.includes("/rest/v1/org_config")) return json([{ id: "org", config: {} }]);
      if (url.includes("auth_id=eq.auth-1")) return json([{ id: "u1", auth_id: "auth-1", email: "a@x.lk", name: "A", role: "admin", active: true, created_at: "2026-01-01T00:00:00Z" }]);
      return json([]);
    });
    const backend = new SupabaseBackend({ url: "https://example.supabase.co", anonKey: "anon" });
    await backend.signIn("a@example.com", "pw");
    urls.length = 0;
    await backend.load();
    const rest = urls.filter((u) => u.includes("/rest/v1/"));
    // Configuration, the staff directory, the caller's own profile, prompts. No audit rows,
    // no case documents and no student profiles for a staff member.
    expect(rest).toHaveLength(4);
    expect(rest.some((u) => u.includes("/rest/v1/audit") || u.includes("/rest/v1/cases"))).toBe(false);
    expect(rest.filter((u) => u.includes("/rest/v1/app_users")).every((u) => u.includes("role=neq.student") || u.includes("auth_id=eq."))).toBe(true);
  });

  it("blur is declared only on the float tier (at most six rules across the stylesheets)", () => {
    const files = [baseCss, componentsCss, shellCss, pagesCss];
    const blurs = files.flatMap((css) => css.match(/(?<!-webkit-)backdrop-filter:(?!\s*none)[^;]+;/g) ?? []);
    expect(blurs.length).toBeLessThanOrEqual(6);
  });
});

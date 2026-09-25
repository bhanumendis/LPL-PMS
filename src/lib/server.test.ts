/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The wire contract of the server adapter's writes. Under row-level security an upsert is
 * judged by the INSERT and SELECT policies even when the row exists, which refused most
 * roles' legitimate saves in v5; these tests pin the statements v6 sends instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseBackend, ServerError } from "./server";
import { defaultConfig } from "./defaults";
import type { CaseRecord, OrgState, User } from "./types";

interface Call { url: string; method: string; body: unknown; prefer?: string }

let calls: Call[] = [];
let respond: (c: Call) => Response;

beforeEach(() => {
  calls = [];
  respond = () => new Response(null, { status: 204 });
  localStorage.setItem("lpl:pms:server-session", JSON.stringify({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const c: Call = { url: String(url).replace("https://api.test", ""), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, prefer: headers.Prefer };
    calls.push(c);
    return respond(c);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const backend = () => new SupabaseBackend({ url: "https://api.test", anonKey: "anon" });

const user = (id: string, over: Partial<User> = {}): User => ({ id, name: "Name " + id, email: `${id}@lyceum.lk`, role: "counsellor", passwordHash: "", active: true, createdAt: "2026-09-01T00:00:00.000Z", ...over });

const kase = (id: string, rev: number): CaseRecord => ({
  id, ref: "LPL-2026-0001", student: { name: "S", email: "s@x", phone: "1" }, status: "open", steps: {}, documents: [], gates: [], events: [],
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: `2026-09-0${rev}T00:00:00.000Z`, rev,
});

describe("server adapter writes", () => {
  it("never upserts cases: new rows are inserted, changed rows go through save_case", async () => {
    respond = (c) => (c.url.includes("/rpc/") ? Response.json(2) : new Response(null, { status: 201 }));
    const b = backend();
    await b.saveCases({ cases: { a: kase("a", 2), n: kase("n", 1) }, rev: 3 }, { cases: { a: kase("a", 1) }, rev: 2 });
    expect(calls.find((c) => c.url.includes("on_conflict"))).toBeUndefined();
    const save = calls.find((c) => c.url === "/rest/v1/rpc/save_case");
    expect(save?.body).toMatchObject({ p_id: "a", p_rev: 2 });
    const ins = calls.find((c) => c.url === "/rest/v1/cases" && c.method === "POST");
    expect(ins?.prefer).toBe("return=minimal");
    expect(ins?.body).toEqual([expect.objectContaining({ id: "n", ref: "LPL-2026-0001", rev: 1 })]);
  });

  it("inserts audit rows without an upsert", async () => {
    await backend().pushAudit({ id: "x", at: "2026-09-01T00:00:00.000Z", actorId: "u", actorName: "U", actorRole: "counsellor", action: "Signed in" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/rest/v1/audit", method: "POST", prefer: "return=minimal" });
  });

  it("patches only the profile columns that changed and inserts new profiles", async () => {
    const before: OrgState = { config: defaultConfig(), users: { u1: user("u1") } };
    const after: OrgState = { config: defaultConfig(), users: { u1: user("u1", { phone: "0771234567" }), u2: user("u2", { role: "student" }) } };
    await backend().saveOrg(after, before);
    const p = calls.find((c) => c.method === "PATCH");
    expect(p).toMatchObject({ url: "/rest/v1/app_users?id=eq.u1", body: { phone: "0771234567" } });
    const i = calls.find((c) => c.method === "POST");
    expect(i?.url).toBe("/rest/v1/app_users");
    expect((i?.body as { id: string; role: string }[])[0]).toMatchObject({ id: "u2", role: "student" });
    expect(calls.some((c) => c.url.startsWith("/rest/v1/org_config"))).toBe(false);
  });

  it("saves configuration as the stored document with only the changed keys replaced", async () => {
    const b = backend();
    respond = (c) => {
      if (c.url.startsWith("/rest/v1/org_config?select")) return Response.json([{ id: "org", config: { orgName: "Stored", legacyKey: 1 } }]);
      if (c.url.startsWith("/rest/v1/")) return Response.json([]);
      return new Response(null, { status: 204 });
    };
    const loaded = await b.load();
    const next = structuredClone(loaded.org);
    next.config.processors = [{ id: "p", name: "Host", purpose: "", country: "SG", dataCategories: [], safeguard: "", addedAt: "2026-09-01" }];
    await b.saveOrg(next, loaded.org);
    const p = calls.find((c) => c.method === "PATCH");
    expect(p?.url).toBe("/rest/v1/org_config?id=eq.org");
    const doc = (p?.body as { config: Record<string, unknown> }).config;
    expect(doc.orgName).toBe("Stored");
    expect(doc.legacyKey).toBe(1);
    expect(doc.processors).toHaveLength(1);
    expect(doc).not.toHaveProperty("sla");
  });

  it("reports a stale revision with the database's explanation", async () => {
    respond = () => Response.json({ code: "PT409", message: "This case was changed by someone else", hint: "stale_revision", details: null }, { status: 409 });
    const err = await backend().saveCases({ cases: { a: kase("a", 2) }, rev: 1 }, { cases: { a: kase("a", 1) }, rev: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).status).toBe(409);
    expect((err as Error).message).toContain("changed by someone else");
  });

  it("hides server internals behind a plain message", async () => {
    respond = () => Response.json({ code: "XX000", message: "relation cases violates something internal" }, { status: 500 });
    const err = await backend().pushAudit({ id: "x", at: "t", actorId: "u", actorName: "U", actorRole: "counsellor", action: "a" }).catch((e) => e);
    expect((err as Error).message).not.toContain("relation");
  });

  it("refuses to wipe or overwrite a server workspace from the browser", async () => {
    const b = backend();
    await expect(b.clear()).rejects.toBeInstanceOf(ServerError);
    await expect(b.replaceAll({ org: { config: defaultConfig(), users: {} }, cases: { cases: {}, rev: 0 }, audit: { entries: [], rev: 0 }, prompts: { prompts: {}, rev: 0 } })).rejects.toBeInstanceOf(ServerError);
    expect(calls).toHaveLength(0);
  });
});

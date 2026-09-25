/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The browser's server code path against the real lpl-api and Postgres (scripts/e2e-api.sh):
 * the scoped workspace load, every read the views make, per-case writes with optimistic
 * concurrency, and change polling. The read model's answers are compared with the reference
 * implementation (src/lib/queries.ts) over the same documents, through HTTP and the client's
 * own row mapping.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildParityFixture, PARITY_QUERIES, PARITY_NOW } from "@/test/parity-fixture";
import { caseRowOf, localCasesPage, localGateStats, type CaseQuery, type Cursor } from "@/lib/queries";
import { defaultConfig } from "@/lib/defaults";
import type { CaseRecord } from "@/lib/types";

// Set by scripts/e2e-api.sh; the suite is skipped without them.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const API = env.LPL_E2E_API_URL;
const ANON = env.LPL_E2E_ANON_KEY ?? "";
const SECRET = env.LPL_E2E_JWT_SECRET ?? "";
const SUPER_AUTH = "00000000-0000-0000-0000-00000000a001";
const C1_AUTH = "00000000-0000-0000-0000-0000000000c1";

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = "";
  bytes.forEach((x) => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function token(sub: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

/** A client signed in as `sub`: the session the browser would hold after GoTrue. */
async function backendAs(sub: string) {
  localStorage.setItem("lpl:pms:server-session", JSON.stringify({ accessToken: await token(sub), refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
  const { SupabaseBackend } = await import("@/lib/server");
  return new SupabaseBackend({ url: API!, anonKey: ANON });
}

const fx = buildParityFixture();
const cases = fx.cases as CaseRecord[];

describe.skipIf(!API)("the client against lpl-api", () => {
  beforeAll(async () => {
    const admin = await backendAs(SUPER_AUTH);
    for (const c of cases) await admin.insertCase(c);
  });

  it("loads a staff workspace without cases or student profiles", async () => {
    const admin = await backendAs(SUPER_AUTH);
    const w = await admin.load();
    expect(Object.keys(w.cases.cases)).toHaveLength(0);
    const roles = Object.values(w.org.users).map((u) => u.role).sort();
    expect(roles).toEqual(["counsellor", "super_admin"]);
  });

  it("answers every recorded query exactly as the reference implementation", async () => {
    const admin = await backendAs(SUPER_AUTH);
    const config = defaultConfig();
    for (const q of PARITY_QUERIES) {
      const got: string[] = [];
      let after: Cursor | null = null;
      for (;;) {
        const page = await admin.read.casesPage({ ...q, now: PARITY_NOW, limit: 53, after });
        got.push(...page.rows.map((r) => r.id));
        if (!page.next) break;
        after = page.next;
      }
      const want = localCasesPage(cases, { ...q, now: PARITY_NOW, limit: 200 }, config).rows.map((r) => r.id);
      const all: string[] = [];
      let a: Cursor | null = null;
      for (;;) {
        const p = localCasesPage(cases, { ...q, now: PARITY_NOW, limit: 200, after: a }, config);
        all.push(...p.rows.map((r) => r.id));
        if (!p.next) break;
        a = p.next;
      }
      expect(got, JSON.stringify(q)).toEqual(all);
      expect(want).toEqual(all.slice(0, want.length));
    }
  });

  it("maps a row field for field like the reference", async () => {
    const admin = await backendAs(SUPER_AUTH);
    const config = defaultConfig();
    const now = Date.parse(PARITY_NOW);
    const q: CaseQuery = { sort: "severity", now: PARITY_NOW, limit: 200 };
    const page = await admin.read.casesPage(q);
    for (const row of page.rows) {
      const ref = caseRowOf(cases.find((c) => c.id === row.id)!, config, now);
      for (const k of Object.keys(ref) as (keyof typeof ref)[]) {
        const a = ref[k], b = row[k];
        if (typeof a === "string" && /^\d{4}-\d{2}-\d{2}T/.test(a)) expect(new Date(b as string).getTime(), `${row.id}.${String(k)}`).toBe(new Date(a).getTime());
        else expect(b, `${row.id}.${String(k)}`).toEqual(a);
      }
    }
  });

  it("serves the dashboard, registers, statistics and profiles", async () => {
    const admin = await backendAs(SUPER_AUTH);
    const d = await admin.read.dashboard();
    expect(d.total).toBe(cases.length);
    expect(typeof d.computedAt).toBe("string");
    expect(await admin.read.casesCount({ status: ["open"] }, 100_000)).toBe(cases.filter((c) => c.status === "open").length);
    const transfers = await admin.read.transfersPage({ limit: 200 });
    expect(transfers.rows.length).toBe(Math.min(200, cases.reduce((n, c) => n + (c.transfers?.length ?? 0), 0)));
    expect(transfers.rows[0].caseRef).toMatch(/^LPL-GEN-/);
    const stats = await admin.read.gateStats();
    const local = localGateStats(cases);
    expect([stats.pending, stats.decided, stats.approved, stats.firstRoundApproved]).toEqual([local.pending, local.decided, local.approved, local.firstRoundApproved]);
    const gates = await admin.read.gatesPage({ status: "pending", limit: 5 });
    expect(gates.rows.every((g) => g.status === "pending" && typeof g.studentName === "string")).toBe(true);
    const staff = await admin.read.usersPage({ role: "staff" });
    expect(staff.rows.map((u) => u.id)).toContain("c1");
  });

  it("limits a counsellor to their caseload everywhere", async () => {
    const c1 = await backendAs(C1_AUTH);
    const mine = cases.filter((c) => c.counsellorId === "c1").map((c) => c.id).sort();
    const seen: string[] = [];
    let after: Cursor | null = null;
    for (;;) {
      const p = await c1.read.casesPage({ limit: 200, after });
      seen.push(...p.rows.map((r) => r.id));
      if (!p.next) break;
      after = p.next;
    }
    expect(seen.sort()).toEqual(mine);
    expect((await c1.read.dashboard()).total).toBe(mine.length);
    const other = cases.find((c) => c.counsellorId && c.counsellorId !== "c1")!;
    expect(await c1.getCase(other.id)).toBeNull();
    expect((await c1.read.casesPage({ q: other.ref })).rows).toHaveLength(0);
  });

  it("saves a case at its next revision, refuses a stale one, and moves the change counters", async () => {
    const c1 = await backendAs(C1_AUTH);
    const id = cases.find((c) => c.counsellorId === "c1")!.id;
    const v0 = await c1.changeVersions();
    const doc = (await c1.getCase(id))!;
    const next = { ...doc, rev: doc.rev + 1, student: { ...doc.student, name: "Renamed Student" } };
    await c1.saveCase(next);
    expect((await c1.getCase(id))!.student.name).toBe("Renamed Student");
    await expect(c1.saveCase({ ...doc, rev: doc.rev + 1 })).rejects.toMatchObject({ status: 409 });
    const v1 = await c1.changeVersions();
    expect(v1!.cases).toBeGreaterThan(v0!.cases);
    const row = (await c1.read.casesPage({ ids: [id] })).rows[0];
    expect(row.studentName).toBe("Renamed Student");
  });

  it("files a push subscription under whoever subscribes the device last", async () => {
    const admin = await backendAs(SUPER_AUTH);
    const c1 = await backendAs(C1_AUTH);
    const device = { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-shared-desk", p256dh: "B".padEnd(87, "A"), auth: "A".padEnd(22, "A"), userAgent: "e2e" };
    await admin.savePushSubscription("ignored", device);
    await c1.savePushSubscription("ignored", device);
    expect((await c1.listPushSubscriptions("c1")).map((d) => d.endpoint)).toEqual([device.endpoint]);
    const w = await admin.load();
    const me = Object.values(w.org.users).find((u) => u.role === "super_admin")!;
    expect(await admin.listPushSubscriptions(me.id)).toEqual([]);
    await expect(c1.savePushSubscription("ignored", { ...device, endpoint: "http://fcm.googleapis.com/x" })).rejects.toMatchObject({ status: 400 });
  });

  it("drives the store: open, change and re-read a case on a server", async () => {
    localStorage.setItem("lpl:pms:server", JSON.stringify({ url: API, anonKey: ANON }));
    localStorage.setItem("lpl:pms:server-session", JSON.stringify({ accessToken: await token(C1_AUTH), refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
    const { store } = await import("@/lib/store");
    store.reconnect();
    await store.refresh();
    expect(store.kind).toBe("server");
    expect(Object.keys(store.snap.cases.cases)).toHaveLength(0);
    const first = (await store.read.casesPage({ limit: 1 })).rows[0];
    const opened = await store.openCase(first.id);
    expect(opened?.id).toBe(first.id);
    const before = store.readVersion;
    const saved = await store.mutateCase(first.id, (c) => { c.student.phone = "0770000001"; });
    expect(saved?.rev).toBe(opened!.rev + 1);
    expect(store.readVersion).toBeGreaterThan(before);
    expect((await store.openCase(first.id))?.student.phone).toBe("0770000001");
  });
});

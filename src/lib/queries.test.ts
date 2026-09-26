/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The reference read model. Case pages are held to the database by the parity fixture (the Go
 * suite replays every recorded query); these tests cover paging mechanics, the registers, the
 * profile policy and the wire form.
 */
import { describe, expect, it } from "vitest";
import { caseQueryToWire, localCasesCount, localCasesPage, localGatesPage, localGateStats, localTransfersPage, localUsersPage, userVisible, type CaseQuery, type Cursor, type RegisterCursor } from "./queries";
import { defaultConfig } from "./defaults";
import { generateCases } from "@/test/generate";
import { blankCase } from "@/test/fixtures";
import type { GateSubmission, User } from "./types";

const NOW = Date.UTC(2026, 8, 25, 12);
const cases = generateCases(300, 5, NOW);
const config = defaultConfig();

function allCasePages(q: CaseQuery, limit: number): string[] {
  const out: string[] = [];
  let after: Cursor | null = null;
  for (let i = 0; i < 1000; i++) {
    const p = localCasesPage(cases, { ...q, limit, after }, config, NOW);
    out.push(...p.rows.map((r) => r.id));
    if (!p.next) return out;
    after = p.next;
  }
  throw new Error("did not finish");
}

describe("case pages", () => {
  for (const q of [{}, { sort: "severity" }, { sort: "urgency", dir: "desc" }, { sort: "retention" }, { attention: true }] as CaseQuery[]) {
    it(`page by page equals one big page (${JSON.stringify(q)})`, () => {
      const whole = localCasesPage(cases, { ...q, limit: 200 }, config, NOW).rows.map((r) => r.id);
      const paged = allCasePages(q, 7);
      expect(new Set(paged).size).toBe(paged.length);
      expect(paged.slice(0, whole.length)).toEqual(whole);
      expect(paged.length).toBe(localCasesCount(cases, q, config, 100_000, NOW));
    });
  }

  it("clamps the page size and the count", () => {
    expect(localCasesPage(cases, { limit: 5000 }, config, NOW).rows).toHaveLength(200);
    expect(localCasesPage(cases, { limit: 0 }, config, NOW).rows).toHaveLength(1);
    expect(localCasesCount(cases, {}, config, 10, NOW)).toBe(10);
  });

  it("puts open cases first, then the most recently updated", () => {
    const rows = localCasesPage(cases, { limit: 200 }, config, NOW).rows;
    const firstClosed = rows.findIndex((r) => r.status !== "open");
    expect(rows.slice(firstClosed).every((r) => r.status !== "open")).toBe(true);
    for (let i = 1; i < firstClosed; i++) expect(Date.parse(rows[i - 1].updatedAt || "0") >= Date.parse(rows[i].updatedAt || "0")).toBe(true);
  });
});

describe("registers", () => {
  it("pages the transfer register newest first without loss", () => {
    const total = cases.reduce((n, c) => n + (c.transfers?.length ?? 0), 0);
    const seen: string[] = [];
    let after: RegisterCursor | null = null;
    let last = Infinity;
    for (;;) {
      const p = localTransfersPage(cases, { limit: 9, after });
      for (const r of p.rows) {
        const t = r.at ? Date.parse(r.at) : -Infinity;
        expect(t <= last).toBe(true);
        last = t;
        seen.push(`${r.caseId}/${r.id}`);
      }
      if (!p.next) break;
      after = p.next;
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(localTransfersPage(cases, { safeguard: "none", limit: 200 }).rows.every((r) => r.safeguard === "None recorded")).toBe(true);
  });

  it("splits gates into pending submissions (oldest first) and decisions, and agrees with the statistics", () => {
    const every = (q: { status?: "pending" }) => {
      const out: ReturnType<typeof localGatesPage>["rows"] = [];
      let after: RegisterCursor | null = null;
      for (;;) {
        const p = localGatesPage(cases, { ...q, limit: 50, after });
        out.push(...p.rows);
        if (!p.next) return out;
        after = p.next;
      }
    };
    const pending = every({ status: "pending" });
    const decided = every({});
    expect(new Set(decided.map((g) => `${g.caseId}/${g.id}`)).size).toBe(decided.length);
    const stats = localGateStats(cases);
    expect(pending.every((g) => g.status === "pending")).toBe(true);
    expect(decided.every((g) => g.status === "approved" || g.status === "returned")).toBe(true);
    // Awaiting decision is the approval queue, not every submission still marked pending.
    expect(stats.pending).toBe(localCasesCount(cases, { gate: "pending" }, config, 10_000, NOW));
    expect(stats.pending).toBeLessThan(pending.length);
    expect(stats.decided).toBe(decided.length);
    expect(stats.approved).toBe(decided.filter((g) => g.status === "approved").length);
    for (let i = 1; i < pending.length; i++) expect((pending[i - 1].submittedAt ?? "") <= (pending[i].submittedAt ?? "")).toBe(true);
    expect(localGatesPage(cases, { gate: 19, limit: 200 }).rows.every((g) => g.gate === 19)).toBe(true);
  });
});

describe("awaiting decision", () => {
  const at = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString();
  const gate = (over: Partial<GateSubmission> & { id: string }): GateSubmission => ({ gate: 16, round: 1, submittedAt: at(1), submittedBy: "c", status: "pending", ...over });

  it("counts the cases the approval queue lists, not every submission still marked pending", () => {
    const set = [
      blankCase({ id: "open", gates: [gate({ id: "g1", submittedAt: at(3) })] }),
      blankCase({ id: "both-gates", gates: [gate({ id: "g1", submittedAt: at(5) }), gate({ id: "g2", gate: 19, submittedAt: at(6) })] }),
      blankCase({ id: "exited", status: "exited", gates: [gate({ id: "g1", submittedAt: at(1) })] }),
      blankCase({ id: "on-hold", status: "hold", gates: [gate({ id: "g1", submittedAt: at(1) })] }),
      blankCase({ id: "superseded", gates: [gate({ id: "g1", submittedAt: at(1) }), gate({ id: "g2", round: 2, status: "returned", submittedAt: at(2), decidedAt: at(4), decidedBy: "tl" })] }),
    ];
    const stats = localGateStats(set);
    expect(localGatesPage(set, { status: "pending", limit: 50 }).rows).toHaveLength(6);
    expect(stats.pending).toBe(2);
    expect(stats.pending).toBe(localCasesCount(set, { gate: "pending" }, config, 10_000, NOW));
    expect(localCasesPage(set, { gate: "pending", sort: "gate", limit: 50 }, config, NOW).rows.map((r) => r.id)).toEqual(["open", "both-gates"]);
    expect(stats.oldestPendingAt).toBe(at(3));
    expect(stats.decided).toBe(1);
  });
});

describe("profiles", () => {
  const u = (id: string, role: User["role"], name = id): User => ({ id, name, email: `${id}@x.lk`, role, passwordHash: "h", active: true, createdAt: "2026-01-01T00:00:00Z" });
  const staff = [u("a", "admin"), u("c1", "counsellor", "Beth"), u("c2", "counsellor", "anna"), u("t", "team_leader")];
  const students = [u("s1", "student"), u("s2", "student")];
  const all = [...staff, ...students];
  const mine = [{ ...cases[0], studentUserId: "s1", counsellorId: "c1" }];

  it("follows the users_read policy", () => {
    const visibleTo = (viewer: User) => all.filter((x) => userVisible(config, viewer, x, mine)).map((x) => x.id).sort();
    expect(visibleTo(staff[0])).toEqual(all.map((x) => x.id).sort());
    expect(visibleTo(staff[1])).toEqual(staff.map((x) => x.id).sort());
    expect(visibleTo(students[0])).toEqual(["c1", "s1"]);
    expect(visibleTo(students[1])).toEqual(["s2"]);
  });

  it("orders by name without regard to case and pages by (name, id)", () => {
    const page1 = localUsersPage(all, { role: "staff", limit: 2 });
    const page2 = localUsersPage(all, { role: "staff", limit: 2, after: page1.next });
    expect([...page1.rows, ...page2.rows].map((x) => x.id)).toEqual(["a", "c2", "c1", "t"]);
    expect(localUsersPage(all, { q: "S1@", limit: 50 }).rows.map((x) => x.id)).toEqual(["s1"]);
  });
});

describe("wire form", () => {
  it("renames holdReview and drops empty values", () => {
    expect(caseQueryToWire({ holdReview: true, q: "", status: [], ids: [], sort: "severity" })).toEqual({ hold_review: true, ids: [], sort: "severity" });
  });
});

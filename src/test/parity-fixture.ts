/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The summary parity fixture: generated cases and what src/lib/summary.ts says about them at a
 * fixed moment under two configurations. server/test/integration replays it against Postgres
 * (public.case_derive, public.case_state, public.dashboard_summary) and requires the same
 * answers. Regenerate with `npm run parity:update`; src/lib/summary.parity.test.ts fails when
 * the committed file is stale.
 */
import type { CaseRecord, OrgConfig } from "@/lib/types";
import { defaultConfig } from "@/lib/defaults";
import { dashboardOf, evaluateCase, summarizeCase, type CaseSummary, type DashboardSummary } from "@/lib/summary";
import { caseQueryToWire, localCasesPage, type CaseQuery } from "@/lib/queries";
import { generateCases } from "./generate";

export const PARITY_NOW = "2026-09-25T12:00:00.000Z";

export const PARITY_CONFIGS: Record<string, Pick<OrgConfig, "sla" | "retention">> = {
  standard: { sla: defaultConfig().sla, retention: defaultConfig().retention },
  tight: { sla: { cisDays: 3, offerReminderDays: 45, followUpMonths: 1 }, retention: { exitedMonths: 1, completedMonths: 2, dormantMonths: 3, warnDays: 60 } },
};

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

/** The summary as the database stores it: snake_case columns, "" timestamps as null. */
export function summaryRow(s: CaseSummary): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    const col = k === "updatedAt" ? "data_updated_at" : snake(k);
    out[col] = v === "" && (k === "createdAt" || k === "updatedAt") ? null : v;
  }
  return out;
}

/**
 * Queries whose complete, ordered answers the database must reproduce (paged 37 at a time).
 * Between them they use every sort, both directions, and every filter.
 */
export const PARITY_QUERIES: CaseQuery[] = [
  {}, { dir: "asc" }, { status: ["open"] }, { status: ["hold", "deferred"] }, { stage: 4 }, { counsellor: "c2" }, { counsellor: "none" },
  { sort: "severity" }, { sort: "severity", dir: "desc" }, { sort: "urgency" }, { sort: "urgency", clock: "due" }, { sort: "urgency", dir: "desc", clock: "breached" },
  { sort: "retention" }, { sort: "retention", retention: ["overdue", "due_soon"] }, { sort: "gate", gate: "pending" }, { sort: "gate", dir: "desc", gate: "pending" },
  { attention: true }, { attention: true, sort: "severity" }, { q: "student 1" }, { q: "lpl-gen-2", sort: "severity" }, { docs: true }, { profile: true },
  { holdReview: true }, { gate: "returned", sort: "severity" }, { severity: ["warn"] }, { retention: ["held", "disposed"], sort: "retention" },
];

export interface ParityQuery { config: string; p: Record<string, unknown>; ids: string[] }

export interface ParityFixture {
  now: string;
  configs: typeof PARITY_CONFIGS;
  cases: CaseRecord[];
  summaries: Record<string, Record<string, unknown>>;
  states: Record<string, Record<string, Record<string, unknown>>>;
  dashboards: Record<string, DashboardSummary>;
  queries: ParityQuery[];
}

export function buildParityFixture(n = 400, seed = 20260925): ParityFixture {
  const now = new Date(PARITY_NOW).getTime();
  const cases = generateCases(n, seed, now);
  const summaries = cases.map(summarizeCase);
  const fixture: ParityFixture = { now: PARITY_NOW, configs: PARITY_CONFIGS, cases, summaries: {}, states: {}, dashboards: {}, queries: [] };
  for (const s of summaries) fixture.summaries[s.id] = summaryRow(s);
  for (const [name, part] of Object.entries(PARITY_CONFIGS)) {
    const config = { ...defaultConfig(), ...part };
    fixture.states[name] = {};
    for (const s of summaries) {
      const st = evaluateCase(s, config, now);
      fixture.states[name][s.id] = {
        breached: st.breached, due_soon: st.dueSoon, docs_to_review: st.docsToReview,
        gate_pending_now: st.gatePending, gate_returned_now: st.gateReturned, profile_submitted_now: st.profileSubmitted,
        hold_review_due: st.holdReviewDue, retention: st.retention,
        severity_rank: { bad: 0, warn: 1, info: 2, none: 3 }[st.severity],
        worst_days: st.clocks.length ? Math.min(...st.clocks.map((c) => c.days)) : null,
      };
    }
    fixture.dashboards[name] = dashboardOf(summaries, config, now);
    for (const q of PARITY_QUERIES) {
      const ids: string[] = [];
      let after: CaseQuery["after"] = null;
      for (;;) {
        const page = localCasesPage(cases, { ...q, limit: 37, after, now: PARITY_NOW }, config);
        ids.push(...page.rows.map((r) => r.id));
        if (!page.next) break;
        after = page.next;
      }
      fixture.queries.push({ config: name, p: caseQueryToWire(q), ids });
    }
  }
  return fixture;
}

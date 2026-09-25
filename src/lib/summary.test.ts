/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * summary.ts must say exactly what signals.ts and the analytics in logic.ts say, case by case
 * and in aggregate, for a fixed "now". (The database is held to summary.ts by the parity
 * fixture; this closes the loop.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveCaseSignals, signalsFromSummary } from "./signals";
import { summarizeCase, evaluateCase, dashboardOf } from "./summary";
import { averageLeadTime, caseChannel, caseDestination, consentCoverage, countBy, docStats, funnel, monthlyVolume, retentionSummary, slaCompliance, unsafeguardedTransfers, allTransfers } from "./logic";
import { defaultConfig } from "./defaults";
import { enquiryDelta } from "@/views/home/greeting";
import { generateCases } from "@/test/generate";

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

describe("summary agrees with signals.ts and logic.ts", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  for (const [name, config] of [["standard", defaultConfig()], ["tight", { ...defaultConfig(), sla: { cisDays: 3, offerReminderDays: 45, followUpMonths: 1 }, retention: { exitedMonths: 1, completedMonths: 2, dormantMonths: 3, warnDays: 60 } }]] as const) {
    it(`case by case (${name} service levels)`, () => {
      for (const c of generateCases(800, 11, NOW)) {
        const sig = deriveCaseSignals(c, config);
        const s = summarizeCase(c);
        const st = evaluateCase(s, config, NOW);
        const where = `${c.id} ${name}`;
        expect(s.currentStep, where).toBe(sig.currentStep);
        expect(s.stage, where).toBe(sig.stage.n);
        expect([s.progressDone, s.progressApplicable, s.progressPct], where).toEqual([sig.progress.done, sig.progress.applicable, sig.progress.pct]);
        expect(st.breached, where).toBe(sig.breached);
        expect(st.dueSoon, where).toBe(sig.dueSoon);
        expect(st.clocks.map((f) => [f.id, f.days, f.state]), where).toEqual(sig.flags.map((f) => [f.id, f.days, f.state]));
        expect(st.docsToReview, where).toBe(sig.docsToReview);
        expect(st.gatePending ?? undefined, where).toBe(sig.gatePending);
        expect(st.gateReturned ?? undefined, where).toBe(sig.gateReturned);
        expect(st.profileSubmitted, where).toBe(sig.profileSubmitted);
        expect(st.holdReviewDue, where).toBe(sig.holdReviewDue);
        expect(st.retention, where).toBe(sig.retention);
        expect(st.severity, where).toBe(sig.severity);
        expect(s.destination, where).toBe(caseDestination(c));
        expect(s.channel, where).toBe(caseChannel(c));
      }
    });

    it(`in aggregate (${name} service levels)`, () => {
      const cases = generateCases(800, 23, NOW);
      const d = dashboardOf(cases.map(summarizeCase), config, NOW);
      expect(d.funnel).toEqual(funnel(cases));
      const vol = monthlyVolume(cases, 24, NOW);
      expect(d.volume.map((v) => v.enquiries)).toEqual(vol.enquiries);
      expect(d.volume.map((v) => v.arrivals)).toEqual(vol.arrivals);
      expect(d.sla.map((x) => [x.met, x.total])).toEqual(slaCompliance(cases, config).map((x) => [x.met, x.total]));
      expect(d.leadDays).toBe(averageLeadTime(cases));
      expect(d.docs).toEqual(docStats(cases));
      const consent = consentCoverage(cases);
      expect([d.compliance.consentCovered, d.compliance.consentTotal, d.compliance.consentPct]).toEqual([consent.covered, consent.total, consent.pct]);
      expect(d.retention).toEqual(retentionSummary(cases, config));
      expect(d.compliance.unsafeguarded).toBe(unsafeguardedTransfers(cases));
      expect(d.compliance.transfers).toBe(allTransfers(cases).length);
      expect(d.destinations).toEqual(countBy(cases.filter((c) => c.status !== "exited"), caseDestination).slice(0, 8));
      expect(d.channels).toEqual(countBy(cases, caseChannel));
      expect(d.exits).toEqual(countBy(cases.filter((c) => c.status === "exited"), (c) => c.exit?.code ?? "Other"));
      const delta = enquiryDelta(cases, NOW);
      expect(d.enquiries).toEqual({ last30: delta.last, prev30: delta.prev });
      const signals = cases.map((c) => deriveCaseSignals(c, config));
      const open = signals.filter((s) => s.status === "open");
      expect(d.open.breached).toBe(open.reduce((n, s) => n + s.breached, 0));
      expect(d.open.unassigned).toBe(open.filter((s) => !s.counsellorId).length);
      expect(d.byStage.map((b) => b.open)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => open.filter((s) => s.stage.n === n).length));
      expect(d.byStage.map((b) => b.bad)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => open.filter((s) => s.stage.n === n && s.severity === "bad").length));
    });
  }

  it("signals from a summary match signals from the document", () => {
    const config = defaultConfig();
    let compared = 0;
    for (const c of generateCases(800, 17, NOW)) {
      const full = deriveCaseSignals(c, config);
      // A summary records one returned and one pending gate; skip the rare case with two of a kind.
      const kinds = full.attention.map((a) => a.kind);
      if (kinds.filter((k) => k === "gate-returned").length > 1 || kinds.filter((k) => k === "gate-pending").length > 1) continue;
      const lite = signalsFromSummary(summarizeCase(c), config, NOW);
      const where = c.id;
      expect(lite.attention.map((a) => [a.kind, a.label, a.severity, a.step ?? null]), where).toEqual(full.attention.map((a) => [a.kind, a.label, a.severity, a.step ?? null]));
      expect(lite.severity, where).toBe(full.severity);
      expect(lite.flags.map((f) => [f.id, f.days, f.state, f.step, f.due.getTime()]), where).toEqual(full.flags.map((f) => [f.id, f.days, f.state, f.step, f.due.getTime()]));
      expect(lite.stages.map((p) => [p.id, p.done, p.total, p.complete, p.current]), where).toEqual(full.stages.map((p) => [p.id, p.done, p.total, p.complete, p.current]));
      expect([lite.stage.id, lite.currentStep, lite.progress], where).toEqual([full.stage.id, full.currentStep, full.progress]);
      expect([lite.breached, lite.dueSoon, lite.docsToReview, lite.profileSubmitted, lite.retention, lite.holdReviewDue], where).toEqual([full.breached, full.dueSoon, full.docsToReview, full.profileSubmitted, full.retention, full.holdReviewDue]);
      compared++;
    }
    expect(compared).toBeGreaterThan(700);
  });

  it("the generated cases exercise every state the comparison depends on", () => {
    const config = defaultConfig();
    const states = generateCases(800, 11, NOW).map((c) => evaluateCase(summarizeCase(c), config, NOW));
    const count = (f: (s: (typeof states)[number]) => boolean) => states.filter(f).length;
    for (const sev of ["bad", "warn", "info", "none"] as const) expect(count((s) => s.severity === sev), sev).toBeGreaterThan(10);
    for (const r of ["none", "scheduled", "due_soon", "overdue", "held", "disposed"] as const) expect(count((s) => s.retention === r), r).toBeGreaterThan(3);
    for (const id of ["cis", "cis2", "offer", "followup"] as const) {
      expect(count((s) => s.clocks.some((c) => c.id === id && c.state === "breached")), `${id} breached`).toBeGreaterThan(2);
      expect(count((s) => s.clocks.some((c) => c.id === id && c.state !== "breached")), `${id} live`).toBeGreaterThan(2);
    }
    expect(count((s) => s.gatePending != null)).toBeGreaterThan(10);
    expect(count((s) => s.gateReturned != null)).toBeGreaterThan(5);
    expect(count((s) => s.holdReviewDue)).toBeGreaterThan(5);
    expect(count((s) => s.profileSubmitted)).toBeGreaterThan(5);
  });

  it("month arithmetic clamps like the database", async () => {
    const { addMonths } = await import("./logic");
    expect(addMonths("2026-01-31", 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths("2028-01-31", 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonths("2026-08-31", 3).toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(addMonths("2026-03-15T10:30:00.000Z", -1).toISOString()).toBe("2026-02-15T10:30:00.000Z");
  });
});
